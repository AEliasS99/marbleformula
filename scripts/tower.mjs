// Pre-simulates the marble race with Rapier and bakes it to src/sim.json, plus a
// matching soundtrack to public/race.wav.
//
// Remotion renders frames out of order across many tabs, so physics must never
// run live during a render: we step a fixed-timestep world once, here, and the
// composition just looks up frame N. The audio is synthesized from the same
// simulation (impacts → clacks), so it lines up with the picture exactly.
import RAPIER from "@dimforge/rapier3d-compat";
import { Quaternion, Vector3, Euler } from "three";
import { mkdirSync, writeFileSync } from "node:fs";

const SEED = Number(process.argv[2] ?? 3);
const QUIET = process.argv.includes("--quiet"); // seed sweeps: skip writing files

const FPS = 30;
const SUBSTEPS = 4; // physics at 120 Hz, recorded at 30 fps
const DT = 1 / (FPS * SUBSTEPS);
const RACE_START = 3 * FPS; // marbles drop in and settle during a 3-2-1 countdown
const MAX_SECONDS = 50;
const TAIL_SECONDS = 2;

// --- Course layout -------------------------------------------------------------
// A zigzag tower seen from the front: ramps alternate direction, each one
// dropping its marbles off the low end onto the high end of the ramp below.
// Ramps run along x, the course is DEPTH deep in z, between a back wall and a
// glass front.
const RAMPS = 4;
const SLOPE = (15 * Math.PI) / 180;
const DEPTH = 4;
const X_LOW = 10; // ramps end here on their low side (open drop)...
const X_WALL = 11.2; // ...and run all the way to the side bumpers on their high side
const DROP = 1.6; // vertical gap between a ramp's low end and the ramp below
const THICK = 0.25;
const MARBLE_RADIUS = 0.35;
const GATE_X = -8.2;
const FINISH_X = -8; // on the last ramp

const MARBLES = [
  { name: "Ruby", color: "#e5484d" },
  { name: "Tangerine", color: "#f76b15" },
  { name: "Sunny", color: "#ffc53d" },
  { name: "Lime", color: "#9ad84a" },
  { name: "Lagoon", color: "#12a594" },
  { name: "Cobalt", color: "#3e63dd" },
  { name: "Violet", color: "#8e4ec6" },
  { name: "Pearl", color: "#e8e8ec" },
];

// Seeded PRNG so a given seed always produces the same course and race.
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const audioRand = mulberry32(SEED * 7919 + 1); // separate stream: sound never changes the race

const q = (quat) => [quat.x, quat.y, quat.z, quat.w];
const v = (vec) => [vec.x, vec.y, vec.z];

const ramps = [];
for (let i = 0; i < RAMPS; i++) {
  const d = i % 2 === 0 ? 1 : -1; // travel direction along x
  const xHigh = -X_WALL * d;
  const xLow = X_LOW * d;
  const xc = (xHigh + xLow) / 2;
  let yc = 0;
  if (i > 0) {
    const prev = ramps[i - 1];
    const yDrop = prev.yAt(prev.xLow) - DROP;
    yc = yDrop + Math.tan(SLOPE) * d * (prev.xLow - xc);
  }
  const quat = new Quaternion().setFromEuler(new Euler(0, 0, -SLOPE * d));
  const normal = new Vector3(0, 1, 0).applyQuaternion(quat);
  ramps.push({
    i,
    d,
    xHigh,
    xLow,
    xc,
    yc,
    quat,
    normal,
    length: Math.abs(xLow - xHigh),
    yAt: (x) => yc - Math.tan(SLOPE) * d * (x - xc),
    /** World point on the ramp's top surface, lifted `up` along its normal. */
    surface(x, z, up = 0) {
      return new Vector3(x, this.yAt(x), z).addScaledVector(normal, up);
    },
  });
}
const last = ramps[RAMPS - 1];
const basinY = last.yAt(last.xLow) - 2.6;
const topY = ramps[0].yAt(ramps[0].xHigh) + 2.5;

/** Static scenery, in world space, shared with the renderer. */
const statics = [];
const addBox = (kind, center, size, quat = new Quaternion()) =>
  statics.push({ shape: "box", kind, pos: v(center), quat: q(quat), size });
const addCylinder = (kind, center, radius, height, quat) =>
  statics.push({ shape: "cylinder", kind, pos: v(center), quat: q(quat), radius, height });

for (const r of ramps) {
  const len = r.length / Math.cos(SLOPE);
  const center = r.surface(r.xc, 0, -THICK / 2);
  addBox("ramp", center, [len, THICK, DEPTH], r.quat);
}

// Side bumpers, basin floor, back wall and front glass enclose everything.
const towerH = topY - basinY;
const midY = (topY + basinY) / 2;
for (const side of [-1, 1]) {
  addBox("bumper", new Vector3(side * (X_WALL + 0.1), midY, 0), [0.2, towerH, DEPTH]);
}
addBox("basin", new Vector3(0, basinY - 0.15, 0), [X_WALL * 2 + 0.4, 0.3, DEPTH]);
addBox("back", new Vector3(0, midY, -DEPTH / 2 - 0.1), [X_WALL * 2 + 0.4, towerH, 0.2]);
addBox("glass", new Vector3(0, midY, DEPTH / 2 + 0.05), [X_WALL * 2 + 0.4, towerH, 0.1]);

// Spinning paddles in the middle of the two inner ramps.
const spinnerDefs = [1, 2].map((ri, k) => ({
  ramp: ramps[ri],
  x: ramps[ri].xc,
  speed: (k === 0 ? 1 : -1) * 1.3, // rad/s
  phase: rand() * Math.PI,
}));

// Pegs, rejection-sampled per ramp, kept clear of walls, landing zones,
// spinners, the start gate and the finish line.
for (const r of ramps) {
  const pegs = [];
  for (let tries = 0; pegs.length < 5 && tries < 4000; tries++) {
    const s = 3 + rand() * (r.length - 5.5); // distance from the high end
    const x = r.xHigh + s * r.d;
    const z = (rand() - 0.5) * 1.7; // |z| ≤ 0.85 leaves > a marble-width gap to the walls
    if (r.i === 0 && x < GATE_X + 2) continue;
    if (r.i === RAMPS - 1 && x < FINISH_X + 2) continue;
    if (spinnerDefs.some((sp) => sp.ramp === r && Math.abs(sp.x - x) < 2.1)) continue;
    if (pegs.every((p) => Math.hypot(p.x - x, p.z - z) > 2.0)) pegs.push({ x, z });
  }
  for (const p of pegs) addCylinder("peg", r.surface(p.x, p.z, 0.35), 0.24, 0.7, r.quat);
}

const finishLine = {
  pos: v(last.surface(FINISH_X, 0, 0.01)),
  quat: q(last.quat),
  depth: DEPTH,
};

// --- Physics -----------------------------------------------------------------
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
world.timestep = DT;

const MATERIAL = {
  ramp: [0.45, 0.25],
  peg: [0.3, 0.45],
  bumper: [0.2, 0.4],
  basin: [0.6, 0.2],
  back: [0.05, 0.3],
  glass: [0.05, 0.3],
};
const rot = (arr) => ({ x: arr[0], y: arr[1], z: arr[2], w: arr[3] });
for (const s of statics) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(...s.pos).setRotation(rot(s.quat)),
  );
  const desc =
    s.shape === "box"
      ? RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2)
      : RAPIER.ColliderDesc.cylinder(s.height / 2, s.radius);
  const [friction, restitution] = MATERIAL[s.kind];
  world.createCollider(desc.setFriction(friction).setRestitution(restitution), body);
}

// Moving parts are kinematic: their pose is a pure function of time.
const movers = [];
function addMover(kind, size, poseAt) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
      .setFriction(0.2)
      .setRestitution(0.5),
    body,
  );
  const m = { kind, size, poseAt, body, poses: [] };
  const [p, r] = poseAt(0);
  body.setTranslation(p, true);
  body.setRotation(r, true);
  movers.push(m);
  return m;
}

const gateBase = ramps[0].surface(GATE_X, 0, 0.6);
addMover("gate", [0.2, 1.2, DEPTH], (t) => {
  const open = Math.min(Math.max((t - RACE_START / FPS) / 0.35, 0), 1);
  const eased = 1 - (1 - open) ** 3;
  return [
    { x: gateBase.x, y: gateBase.y + eased * 1.8, z: gateBase.z },
    rot(q(ramps[0].quat)),
  ];
});
for (const sp of spinnerDefs) {
  const c = sp.ramp.surface(sp.x, 0, 0.3);
  addMover("spinner", [0.25, 0.5, 2.4], (t) => {
    const spin = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), sp.phase + sp.speed * t);
    return [{ x: c.x, y: c.y, z: c.z }, rot(q(sp.ramp.quat.clone().multiply(spin)))];
  });
}

// Starting bin: 12 slots behind the gate, 8 picked at random, dropped from
// staggered heights so they tumble in and settle against the gate.
const slots = [];
for (const x of [-10.6, -9.75, -8.9]) for (const z of [-1.35, -0.45, 0.45, 1.35]) slots.push({ x, z });
for (let i = slots.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [slots[i], slots[j]] = [slots[j], slots[i]];
}
// Drop order is shuffled too, so no marble gets a built-in head start.
const dropOrder = MARBLES.map((_, i) => i);
for (let i = dropOrder.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [dropOrder[i], dropOrder[j]] = [dropOrder[j], dropOrder[i]];
}
const bodies = MARBLES.map((_, i) => {
  const { x, z } = slots[i];
  const y = ramps[0].yAt(x) + 0.6 + dropOrder[i] * 0.25 + rand() * 0.3;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCcdEnabled(true),
  );
  world.createCollider(
    RAPIER.ColliderDesc.ball(MARBLE_RADIUS).setFriction(0.15).setRestitution(0.5).setDensity(2),
    body,
  );
  return body;
});

/**
 * Continuous race progress: which ramp the marble is on (the highest ramp whose
 * surface is below it), plus distance travelled along that ramp.
 */
function progressOf(x, y) {
  for (const r of ramps) {
    if (y >= r.yAt(x) - 0.3) {
      const along = Math.min(Math.max((x - r.xHigh) * r.d, 0), r.length + 1);
      return r.i * 25 + along;
    }
  }
  return RAMPS * 25;
}
const FINISH_PROGRESS = (RAMPS - 1) * 25 + (FINISH_X - last.xHigh) * last.d;

// --- Audio capture -------------------------------------------------------------
// Impacts are detected from sudden velocity changes (beyond gravity) per substep.
const impacts = []; // { t, strength, x, glass }
const rolling = []; // per substep: mean speed of marbles
const prevVel = bodies.map(() => null);
const lastImpactStep = bodies.map(() => -99);

const round = (n) => Math.round(n * 1e4) / 1e4;
const frames = [];
const finishFrame = MARBLES.map(() => null);
let lastFinish = null;
let step = 0;

for (let f = 0; f < MAX_SECONDS * FPS; f++) {
  frames.push(
    bodies.map((b, i) => {
      const p = b.translation();
      const r = b.rotation();
      const progress = progressOf(p.x, p.y);
      if (finishFrame[i] === null && f > RACE_START && progress >= FINISH_PROGRESS) finishFrame[i] = f;
      return [p.x, p.y, p.z, r.x, r.y, r.z, r.w, progress].map(round);
    }),
  );
  for (const m of movers) {
    const p = m.body.translation();
    const r = m.body.rotation();
    m.poses.push([p.x, p.y, p.z, r.x, r.y, r.z, r.w].map(round));
  }

  if (lastFinish === null && finishFrame.every((x) => x !== null)) lastFinish = f;
  if (lastFinish !== null && f - lastFinish >= TAIL_SECONDS * FPS) break;

  for (let s = 0; s < SUBSTEPS; s++) {
    const ts = (step + 1) * DT;
    for (const m of movers) {
      const [p, r] = m.poseAt(ts);
      m.body.setNextKinematicTranslation(p);
      m.body.setNextKinematicRotation(r);
    }
    world.step();
    step++;

    let speedSum = 0;
    bodies.forEach((b, i) => {
      const vel = b.linvel();
      speedSum += Math.hypot(vel.x, vel.y, vel.z);
      const pv = prevVel[i];
      prevVel[i] = vel;
      if (!pv) return;
      const dv = Math.hypot(vel.x - pv.x, vel.y - pv.y + 9.81 * DT, vel.z - pv.z);
      if (dv > 0.6 && step - lastImpactStep[i] > 3) {
        lastImpactStep[i] = step;
        const p = b.translation();
        const glass = bodies.some((o, j) => {
          if (j === i) return false;
          const op = o.translation();
          return Math.hypot(op.x - p.x, op.y - p.y, op.z - p.z) < MARBLE_RADIUS * 2 + 0.08;
        });
        impacts.push({ t: step * DT, strength: dv, x: p.x, glass });
      }
    });
    rolling.push(speedSum / bodies.length);
  }
}

// --- Timeline --------------------------------------------------------------------
// race → slow-motion replay of the winning finish → results card.
const order = MARBLES.map((_, i) => i)
  .filter((i) => finishFrame[i] !== null)
  .sort((a, b) => finishFrame[a] - finishFrame[b]);
const winnerFrame = finishFrame[order[0]] ?? frames.length - 1;
const REPLAY_SPEED = 0.35;
const replayFrom = Math.max(RACE_START, winnerFrame - 40);
const replayTo = Math.min(frames.length - 1, winnerFrame + 25);
const timeline = {
  raceStart: RACE_START,
  raceFrames: frames.length,
  replay: {
    at: frames.length,
    from: replayFrom,
    to: replayTo,
    speed: REPLAY_SPEED,
    frames: Math.ceil((replayTo - replayFrom) / REPLAY_SPEED),
  },
  resultsFrames: 5 * FPS,
};
timeline.results = { at: timeline.replay.at + timeline.replay.frames };
timeline.total = timeline.results.at + timeline.resultsFrames;

// --- Report ----------------------------------------------------------------------
const secs = (frame) => ((frame - RACE_START) / FPS).toFixed(2);
console.log(
  `seed ${SEED}: race ${(frames.length / FPS).toFixed(1)}s, video ${(timeline.total / FPS).toFixed(1)}s`,
);
order.forEach((i, k) => console.log(`  ${k + 1}. ${MARBLES[i].name} @ ${secs(finishFrame[i])}s`));
const dnf = MARBLES.filter((_, i) => finishFrame[i] === null).map((m) => m.name);
if (dnf.length) console.log(`  DNF: ${dnf.join(", ")}`);
if (order.length > 1) console.log(`  margin: ${((finishFrame[order[1]] - winnerFrame) / FPS).toFixed(2)}s`);
if (QUIET) process.exit(0);

const out = {
  seed: SEED,
  fps: FPS,
  marbleRadius: MARBLE_RADIUS,
  timeline,
  bounds: { xMin: -X_WALL, xMax: X_WALL, yMin: basinY, yMax: topY, depth: DEPTH },
  marbles: MARBLES.map((m, i) => ({ ...m, finishFrame: finishFrame[i] })),
  statics,
  movers: movers.map(({ kind, size, poses }) => ({ kind, size, poses })),
  finishLine,
  frames,
};
writeFileSync(new URL("../src/tower/sim.json", import.meta.url), JSON.stringify(out));

// --- Soundtrack ------------------------------------------------------------------
const RATE = 44100;
const total = Math.ceil((timeline.total / FPS) * RATE);
const L = new Float32Array(total);
const R = new Float32Array(total);
const add = (i, s, pan) => {
  if (i < 0 || i >= total) return;
  L[i] += s * Math.cos(((pan + 1) * Math.PI) / 4);
  R[i] += s * Math.sin(((pan + 1) * Math.PI) / 4);
};

/** Short percussive hit: a damped sine plus a tiny noise transient. */
function clack(t, freq, decay, amp, pan) {
  const start = Math.round(t * RATE);
  const n = Math.round(decay * 6 * RATE);
  for (let k = 0; k < n; k++) {
    const tt = k / RATE;
    const env = Math.exp(-tt / decay);
    const noise = k < 120 ? (audioRand() * 2 - 1) * (1 - k / 120) * 0.6 : 0;
    add(start + k, amp * env * (Math.sin(2 * Math.PI * freq * tt) * 0.8 + noise), pan);
  }
}
/** Bell: a few inharmonic partials with a long tail. */
function bell(t, freq, amp, pan = 0, length = 1.6) {
  const start = Math.round(t * RATE);
  const partials = [
    [1, 1],
    [2.76, 0.45],
    [5.4, 0.2],
    [8.9, 0.08],
  ];
  for (let k = 0; k < length * RATE; k++) {
    const tt = k / RATE;
    let s = 0;
    for (const [mul, a] of partials) s += a * Math.exp((-tt * (1 + mul)) / length) * Math.sin(2 * Math.PI * freq * mul * tt);
    add(start + k, amp * s * Math.min(1, k / 40), pan);
  }
}
function beep(t, freq, dur, amp) {
  const start = Math.round(t * RATE);
  for (let k = 0; k < dur * RATE; k++) {
    const tt = k / RATE;
    const env = Math.min(1, k / 200) * Math.min(1, (dur * RATE - k) / 800);
    add(start + k, amp * env * (Math.sin(2 * Math.PI * freq * tt) + 0.3 * Math.sin(4 * Math.PI * freq * tt)), 0);
  }
}

// Countdown and gate.
for (let k = 0; k < 3; k++) beep(k, 660, 0.16, 0.35);
beep(RACE_START / FPS, 1320, 0.4, 0.4);

// Rolling rumble: low-passed noise following average marble speed (race only).
let lp1 = 0;
let lp2 = 0;
for (let k = 0; k < Math.min(total, Math.round((frames.length / FPS) * RATE)); k++) {
  const speed = rolling[Math.min(rolling.length - 1, Math.floor(k / RATE / DT))] ?? 0;
  lp1 += 0.03 * (audioRand() * 2 - 1 - lp1);
  lp2 += 0.03 * (lp1 - lp2);
  const s = lp2 * Math.min(speed, 6) * 0.35;
  L[k] += s;
  R[k] += s;
}

// Impacts: marble-on-marble rings like glass, everything else knocks like wood.
for (const im of impacts) {
  const amp = Math.min(1, (im.strength - 0.4) / 4) ** 0.7 * 0.32;
  const pan = Math.max(-0.9, Math.min(0.9, im.x / X_WALL));
  if (im.glass) clack(im.t, 2800 + audioRand() * 1600, 0.018, amp, pan);
  else clack(im.t, 650 + audioRand() * 700, 0.03, amp * 0.8, pan);
}

// A chime for every finisher, brightest for the winner.
order.forEach((i, k) => bell(finishFrame[i] / FPS, k === 0 ? 1046.5 : 784, k === 0 ? 0.35 : 0.18, -0.6));

// Replay whoosh, then a fanfare arpeggio on the results card.
{
  const start = Math.round((timeline.replay.at / FPS) * RATE);
  const n = Math.round(0.9 * RATE);
  let lp = 0;
  for (let k = 0; k < n && start + k < total; k++) {
    const p = k / n;
    lp += (0.02 + 0.25 * p) * (audioRand() * 2 - 1 - lp);
    const s = lp * Math.sin(Math.PI * p) * 0.9;
    L[start + k] += s;
    R[start + k] += s;
  }
}
[523.25, 659.25, 783.99, 1046.5].forEach((fq, k) =>
  bell(timeline.results.at / FPS + 0.15 + k * 0.14, fq, 0.22, (k - 1.5) * 0.3, 2.2),
);

// Normalize and write 16-bit stereo WAV.
let peak = 0;
for (let k = 0; k < total; k++) peak = Math.max(peak, Math.abs(L[k]), Math.abs(R[k]));
const gain = peak > 0.9 ? 0.9 / peak : 1;
const wav = Buffer.alloc(44 + total * 4);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + total * 4, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(RATE, 24);
wav.writeUInt32LE(RATE * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(total * 4, 40);
for (let k = 0; k < total; k++) {
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[k] * gain)) * 32767), 44 + k * 4);
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[k] * gain)) * 32767), 46 + k * 4);
}
mkdirSync(new URL("../public", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/race.wav", import.meta.url), wav);
console.log(`  ${impacts.length} impacts → public/race.wav`);
