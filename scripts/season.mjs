// Marble Grand Prix season: real circuit outlines turned into downhill marble
// tracks, raced with Rapier, filmed by a deterministic "TV director", scored
// with championship points. For every round it writes src/gp/races/<id>.json and
// public/gp/<id>.wav; then src/gp/races/season.json and src/gp/races/index.ts.
//
//   node scripts/season.mjs                        bake the whole season
//   node scripts/season.mjs --round r3-spa --seeds 1-12   try seeds for one round
//
// As with the tower, physics never runs at render time: Remotion renders frames
// out of order, so the composition only looks things up by frame number.
import RAPIER from "@dimforge/rapier3d-compat";
import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOutline, marbleize, SCALE, SLOPE } from "./circuit.mjs";
import { venueBlocks, venueClearance, venueLayout } from "../src/gp/venue.js";
import { ALWAYS, BY_TYPE, OBSTACLES, PHYSICS_ORDER } from "../src/gp/obstacles/index.js";
import { VORTEX } from "../src/gp/obstacles/vortex.js";
import { REGROUP } from "../src/gp/obstacles/regroup.js";
import { fanGust } from "../src/gp/obstacles/fan.js";
import { CIRCUITS } from "../src/gp/circuits/index.js";
import { TEAMS, teamOf } from "../src/gp/teams.js";
import { introPlan, TEAM_FRAMES } from "../src/gp/intro-plan.js";
import { STAIR, stairLocal, stairLoop } from "../src/gp/stair.js";
import { BANK_PIVOT, buildTrackMesh, liftCleatPose, pointInFrame, pointOnTrack, surfaceHeight as surfaceHeightAt, TRACK, TRACK_DEPTH } from "../src/gp/trackMesh.js";

// --- Season ------------------------------------------------------------------------
// The circuits and their designs live in src/gp/circuits/ (one file each).
// GP_SEEDS=<file.json> ({ "r1-monaco": 7, ... }) overrides the design files' seeds (the factory's picks).
const SEED_OVERRIDE = process.env.GP_SEEDS ? JSON.parse(readFileSync(process.env.GP_SEEDS, "utf8")) : {};
const ROUNDS = CIRCUITS.map((c) => (SEED_OVERRIDE[c.id] !== undefined ? { ...c, seed: SEED_OVERRIDE[c.id] } : c));
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

// Each marble carries a national flag (drawn in src/gp/flags.ts); `color` is a
// distinctive fallback tint for places where a flag can't be drawn.
const MARBLES = [
  { name: "Spain", abbr: "ESP", flag: "ESP", color: "#ffc400" },
  { name: "Italy", abbr: "ITA", flag: "ITA", color: "#009246" },
  { name: "France", abbr: "FRA", flag: "FRA", color: "#0055a4" },
  { name: "Germany", abbr: "DEU", flag: "DEU", color: "#ffce00" },
  { name: "Britain", abbr: "GBR", flag: "GBR", color: "#c8102e" },
  { name: "USA", abbr: "USA", flag: "USA", color: "#3c3b6e" },
  { name: "Brazil", abbr: "BRA", flag: "BRA", color: "#009c3b" },
  { name: "Japan", abbr: "JPN", flag: "JPN", color: "#bc002d" },
  { name: "Argentina", abbr: "ARG", flag: "ARG", color: "#74acdf" },
  { name: "Mexico", abbr: "MEX", flag: "MEX", color: "#006847" },
  { name: "Netherlands", abbr: "NLD", flag: "NLD", color: "#ff7f00" },
  { name: "Belgium", abbr: "BEL", flag: "BEL", color: "#fdda24" },
  { name: "Austria", abbr: "AUT", flag: "AUT", color: "#ed2939" },
  { name: "Poland", abbr: "POL", flag: "POL", color: "#dc143c" },
  { name: "Ireland", abbr: "IRL", flag: "IRL", color: "#169b62" },
  { name: "Sweden", abbr: "SWE", flag: "SWE", color: "#006aa7" },
  { name: "Denmark", abbr: "DNK", flag: "DNK", color: "#c8102e" },
  { name: "Canada", abbr: "CAN", flag: "CAN", color: "#ff0000" },
  { name: "China", abbr: "CHN", flag: "CHN", color: "#de2910" },
  { name: "India", abbr: "IND", flag: "IND", color: "#ff9933" },
];
// The grid: ten lanes, two rows (a marble per lane per row).
const GRID = { lanes: 10, rows: 2, rowGap: 1.0 };
// Disqualification zones: a red pad at the foot of one wall beside each
// machine. A marble that rolls over it (its centre within DQ.reach of the
// wall, i.e. pressed against it, on the floor) is out of the race. Narrow and
// short, so it catches only the unlucky few that get bounced into the wall there.
const DQ = {
  len: +(process.env.DQ_LEN ?? 0.09), // three laps: three passes over every pad
  width: 0.42,
  reach: +(process.env.DQ_REACH ?? 0.37),
  offset: +(process.env.DQ_OFF ?? 6.0),
  every: +(process.env.DQ_EVERY ?? 5), // a pad at every n-th machine
  types: OBSTACLES.filter((o) => o.dq).map((o) => o.type), // the modules say where a pad may go // not the slalom or the splitter: those press everyone to the walls
};

// --- Timing & physics constants ------------------------------------------------------
const FPS = 60;
const SUBSTEPS = 2; // physics still steps at 120 Hz
const DT = 1 / (FPS * SUBSTEPS);
const R = 0.35; // marble radius
const GRID_LENGTH = 9.5; // track behind the start line
// Start area: one lane per marble, separated by dividers, then a gentle funnel
// into the normal track width.
const START = { half: 4.7, lanesFrom: -8.6, lanesTo: -0.35, funnel: 11 };
const RUNOFF = 16; // (single-lap layouts) track after the finish line
// Laps: the track ends `cabin` units short of the grid's start (the same spot
// in plan, a lap's descent lower) and a lift cabin carries the field back up
// to the grid. The finish line is just before the cabin on the last lap.
const LAPS = 3;
// Cabin 4.2 × 4.4: the whole field fits in one layer; walls 2.4 so a pile
// arriving at speed cannot climb out.
// It goes by arrivals: a short hold after the first marble aboard (or a third
// of the field), not a wait for everyone; a quick cycle so the next load is soon.
// Two cabins side by side: the track widens into two bays over its last
// `funnel` units (a divider between them), each bay with its own bar and
// cabin, so one cabin is loading while the other is away.
const ELEVATOR = { cabin: 4.2, width: 4.4, wall: 2.4, need: 0.34, hold: 2.5, close: 0.45, rise: 4.0, open: 0.4, unload: 2.5, descend: 2.4, barLift: 1.7, funnel: 8, bays: 2 };
const SAMPLE = 0.5; // centreline sample spacing
// Gravity is scaled up from 9.81: at real gravity a 0.7-unit marble behaves like
// a 70 cm ball (slow, floaty bounces). Stronger gravity makes it look and move
// like a small, quick marble.
const GRAVITY = 22;
// Every curve is banked (up to 22°) so the marbles carry their speed through it.
// Steep banking: the marbles carry their speed round the bends instead of piling into the outer wall.
// (Through an S-bend the rate limit below decides how fast it can flip.)
const DESIGN_SPEED = Number(process.env.GP_DESIGN_SPEED ?? 14); // for banking
const MAX_BANK = (Number(process.env.GP_MAX_BANK ?? 28) * Math.PI) / 180;
// How fast banking may change along the track. On a flat floor, twisting faster
// than this makes the low edge climb while the centre line descends: a bowl that
// traps marbles. At 0.8 the low edge still descends, at a fifth of the slope.
const BANK_FLIP = Number(process.env.GP_BANK_FLIP ?? 1.0); // ×slope: above 1 the low edge may climb briefly in an S
const BANK_RATE = (Math.tan(SLOPE) * BANK_FLIP) / (TRACK.width / 2); // radians per unit
const DAMPING = 0.055; // rolling resistance + air: caps the speed of a marble (0.075 felt sluggish)
// Marble–marble contacts average the two marbles' restitution: 0.75, glass on
// glass, lively. Everything else (track, obstacles, machines) uses the Min
// combine rule, so its own value is the effective one: a head-on hit must not
// send a marble back up the slope to oscillate against the obstacle for seconds.
const MARBLE_RESTITUTION = 0.75;
const TRACK_RESTITUTION = 0.4;
const OBSTACLE_RESTITUTION = { bumper: 0.65, spinner: 0.35, fin: 0.5, splitter: 0.3, divider: 0.3, hammer: 0.5, cleat: 0.1, guard: 0.3, pusher: 0.2, turntable: 0.1, roller: 0.2, vortex: 0.2 };
const GUARD = { height: 1.4, segment: 1 }; // default; zones that throw marbles higher say so
// Clear guard panels over the stretches where marbles can fly: a jump's kicker,
// flight and landing, and every machine that can throw one.
// Drops too: at speed, a marble leaving a drop in a bend can land on the wall top.
// [from, to, height]: clear guard panels over each obstacle that throws marbles (from its module's `guard`).
const GUARD_ZONES = Object.fromEntries(OBSTACLES.filter((o) => o.guard).map((o) => [o.type, o.guard]));
// A steeper launch out of the lanes, so the race starts with a punch.
const START_STEEP = { until: 25, slope: Math.tan((8 * Math.PI) / 180) };
const BRAKE_DAMPING = 1.8; // after the chequered flag
const LIGHT_TIMES = [1.2, 1.8, 2.4, 3.0, 3.6]; // seconds; then a random hold before lights out
const LINGER = Math.round(1 * FPS);
const GATE = { swing: (105 * Math.PI) / 180, time: 0.35 }; // flap opening: angle, seconds
const REPLAY_SPEED = 0.35;
// Mid-race instant replays: up to `count` of the hardest obstacle hits.
const HIGHLIGHTS = { count: 3, minGap: 9, before: 0.8, after: 1.0, speed: 0.4 };

const GROUP_TRACK = (0x0001 << 16) | 0x0002;
const GROUP_MARBLE = (0x0002 << 16) | 0x0007;
// Clear parts (the vortex bowl): marbles collide with them, the director's
// sight-line rays pass through them, as they do through the acrylic in the render.
const GROUP_CLEAR = (0x0004 << 16) | 0x0002;
const QUERY_TRACK_ONLY = (0x0002 << 16) | 0x0001;

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const v3 = (a) => new Vector3(a[0], a[1], a[2]);
const r3 = (n) => Math.round(n * 1000) / 1000;
const arr = (v) => [r3(v.x), r3(v.y), r3(v.z)];

// --- Course --------------------------------------------------------------------------
// Obstacles. Each sits on a straight; `before`/`after` is the clear straight it
// needs around its position. Sizes respect the marble (0.7 wide): every gap is
// either wider than a marble or too narrow to enter, so nothing can wedge.
// `maxCurv`: physical obstacles need a truly straight track (banking in a bend
// shifts the trough's lowest line sideways, steering marbles into them);
// shape features (drops, bumps, twists) can't trap anything and go on gentle bends.
// The obstacle library (src/gp/obstacles/) says what each one needs; the planner reads it in its order.
const FEATURES = Object.fromEntries(OBSTACLES.map((o) => [o.type, { before: o.place.before, after: o.place.after, label: o.label, maxCurv: o.place.maxCurv, ...(o.place.once ? { once: true } : {}) }]));
// Kicker: a 10° run-up (so even a slow marble arrives with enough speed to clear
// the lip: v²/2g must exceed `lip`), the ramp up to the lip, then the fall.
const JUMP = { runup: 4, runupSlope: Math.tan((10 * Math.PI) / 180), lip: 0.45, ramp: 2.0, drop: 2.0 };
const MIN_DROPS = 2;
const MIN_JUMPS = 3;
// The machine: a chain lift carries the marbles up a steep belt (placed apart
// from the cycling obstacles; one per circuit, on its longest straight).
const LIFT = { angle: (22 * Math.PI) / 180, len: 9, lead: 2.4, rise: 1.2, speed: 3.2, spacing: 1.5, count: 10, before: 4, after: 13 };
const TWIST = { amp: (42 * Math.PI) / 180, length: 14 };
const DROP_HEIGHT = 1.1;
const BUMP = { amp: 0.13, length: 1.6, count: 4 };
// Crests at the bends' apexes: a mini kicker (run-up, lip, small drop): fast marbles take off in the bend.
const VORTEX_SWIRL = { accel: 9, share: 0.9 };
// Obstacles that get their own locked camera (the small ones are seen in passing: too many cuts otherwise).
const CAM_FEATURES = ["vortex", "spinner", "hammer", "turntable", "rollers", "pusher", "jump", "drop", "lift", "fan", "bumpers", "pegs", "splitter"];
const TUBES = { minCurv: 0.17, height: 1.7 };
const LAUNCHES = { max: 2, gap: 12 };
const FANS = { extra: 3, spacing: 60 };
const BOOSTERS = { spacing: 22, max: Number(process.env.GP_BOOSTERS ?? 8) };
const CREST = { runup: 2.5, runupSlope: Math.tan((14 * Math.PI) / 180), ramp: 1.2, lip: 0.22, drop: 0.25, minCurv: 0.035, maxCurv: 0.16, spacing: 18, max: 8 };

function hashString(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Places obstacles along the straights, cycling through every type. */
/** What a feature needs (its clear straight and how straight), for the planner, explicit layouts and the design tool. */
export function featureRule(type) {
  if (type === "lift") return { before: LIFT.before, after: LIFT.after, maxCurv: 0.03, label: "THE LIFT" };
  const f = FEATURES[type];
  if (!f) throw new Error(`unknown obstacle "${type}"; one of lift, ${Object.keys(FEATURES).join(", ")}`);
  return f;
}

/** Placement checks on a course's centreline: is the stretch around u straight enough for `type`? */
export function placementRules(curv) {
  const straightAt = (u, maxCurv) => {
    const k0 = Math.round((u + GRID_LENGTH) / SAMPLE);
    for (let j = -10; j <= 10; j++) {
      const c = curv[Math.max(0, Math.min(curv.length - 1, k0 + j))];
      if (Math.abs(c) > maxCurv) return false;
    }
    return true;
  };
  const clear = (u, f) => {
    for (let x = u - f.before; x <= u + f.after; x += 1) if (!straightAt(x, f.maxCurv)) return false;
    return true;
  };
  return { straightAt, clear };
}

/**
 * An explicit layout from a circuit's design file: [type, u] entries in lap
 * order (u omitted: the first legal spot after the previous entry). Every
 * placement is checked: straight enough, inside the lap, clear of its
 * neighbours (4 units between spans). Errors name the entry and where it could go.
 */
function placeLayout(layout, curv, L, id) {
  const { clear } = placementRules(curv);
  const features = [];
  const overlaps = (u, f) => features.some((g) => !(u + f.after + 4 < g.u - g.span[0] || u - f.before - 4 > g.u + g.span[1]));
  const legal = (u, f) => u >= 12 + START.funnel && u <= L - 18 && clear(u, f) && !overlaps(u, f);
  const errors = [];
  let cursor = 12 + START.funnel;
  for (const [k, entry] of layout.entries()) {
    const [type, at] = Array.isArray(entry) ? entry : [entry.type, entry.u];
    const f = featureRule(type);
    let u = at;
    if (u === undefined || u === null) {
      u = null;
      for (let x = Math.ceil(cursor); x <= L - 18; x += 1)
        if (legal(x, f)) {
          u = x;
          break;
        }
      if (u === null) {
        errors.push(`#${k + 1} ${type}: no room left after u=${cursor.toFixed(0)}`);
        continue;
      }
    } else if (!legal(u, f)) {
      const near = [];
      for (let d = 1; d < 80 && near.length < 2; d += 1)
        for (const x of [Math.round(u) - d, Math.round(u) + d]) if (near.length < 2 && legal(x, f)) near.push(x);
      const why = u < 12 + START.funnel || u > L - 18 ? "outside the lap's usable part" : !clear(u, f) ? `the track is not straight enough from ${(u - f.before).toFixed(0)} to ${(u + f.after).toFixed(0)}` : "too close to another obstacle";
      errors.push(`#${k + 1} ${type} at u=${u}: ${why}${near.length ? `; legal nearby: ${near.join(", ")}` : ""}`);
      continue;
    }
    features.push({ type, u: r3(u), label: f.label, span: [f.before, f.after] });
    cursor = u + f.after + 4;
  }
  if (errors.length) throw new Error(`${id}: layout has ${errors.length} problem(s):\n  ${errors.join("\n  ")}\n(run: npm run design -- ${id})`);
  features.sort((a, b) => a.u - b.u);
  return features;
}

function planFeatures(us, curv, L, rand) {
  const straightAt = (u, maxCurv) => {
    const k0 = Math.round((u + GRID_LENGTH) / SAMPLE);
    for (let j = -10; j <= 10; j++) {
      const c = curv[Math.max(0, Math.min(curv.length - 1, k0 + j))];
      if (Math.abs(c) > maxCurv) return false;
    }
    return true;
  };
  const clear = (u, f) => {
    for (let x = u - f.before; x <= u + f.after; x += 1) if (!straightAt(x, f.maxCurv)) return false;
    return true;
  };
  const queue = [];
  const refill = () => {
    const types = Object.keys(FEATURES).filter((t) => !FEATURES[t].once);
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    if (queue.length && types[0] === queue[queue.length - 1]) types.push(types.shift());
    queue.push(...types);
  };
  const features = [];
  const overlaps = (u, f) => features.some((g) => !(u + f.after + 4 < g.u - g.span[0] || u - f.before - 4 > g.u + g.span[1]));
  // The lift first: the straightest spot nearest the middle of the lap.
  {
    const lf = { ...LIFT, maxCurv: 0.03 };
    let best = null;
    for (let x = L * 0.25; x < L * 0.75; x += 1) if (clear(x, lf) && (best === null || Math.abs(x - L / 2) < Math.abs(best - L / 2))) best = x;
    if (best !== null) features.push({ type: "lift", u: r3(best), label: "THE LIFT", span: [LIFT.before, LIFT.after] });
  }
  // Jumps next, spread over the lap: they need straight track and are the
  // crowd-pleasers, so they get first pick of the room.
  for (let j = 0; j < MIN_JUMPS; j++) {
    const target = 12 + START.funnel + ((j + 0.5) / MIN_JUMPS) * (L - 30 - START.funnel);
    let best = null;
    for (let x = target - 30; x <= target + 30; x += 1) {
      if (x < 12 + START.funnel || x > L - 18) continue;
      if (clear(x, FEATURES.jump) && !overlaps(x, FEATURES.jump) && (best === null || Math.abs(x - target) < Math.abs(best - target))) best = x;
    }
    if (best !== null) features.push({ type: "jump", u: r3(best), label: FEATURES.jump.label, span: [FEATURES.jump.before, FEATURES.jump.after] });
  }
  // The machines are the show: one turntable and one pusher per circuit,
  // spread over the lap, before the cycling obstacles fill in the rest.
  for (const [j, type] of ALWAYS.entries()) {
    const target = 12 + START.funnel + ((j + 0.7) / 5.4) * (L - 30 - START.funnel);
    let best = null;
    for (let x = 12 + START.funnel; x <= L - 18; x += 1) {
      if (clear(x, FEATURES[type]) && !overlaps(x, FEATURES[type]) && (best === null || Math.abs(x - target) < Math.abs(best - target))) best = x;
    }
    if (best !== null) features.push({ type, u: r3(best), label: FEATURES[type].label, span: [FEATURES[type].before, FEATURES[type].after] });
  }
  // Regroup gates, spread over the lap, wherever there is room.
  for (let j = 0; j < REGROUP.count; j++) {
    const target = 12 + START.funnel + ((j + 0.75) / (REGROUP.count + 0.5)) * (L - 30 - START.funnel);
    let best = null;
    for (let x = target - 70; x <= target + 70; x += 1) {
      if (x < 12 + START.funnel || x > L - 18) continue;
      if (clear(x, FEATURES.regroup) && !overlaps(x, FEATURES.regroup) && (best === null || Math.abs(x - target) < Math.abs(best - target))) best = x;
    }
    if (best !== null) features.push({ type: "regroup", u: r3(best), label: FEATURES.regroup.label, span: [FEATURES.regroup.before, FEATURES.regroup.after] });
  }
  // The cycling obstacles start a little later than the machines may: the
  // twenty marbles leave the funnel as one block and need room to string out.
  let u = 30 + START.funnel;
  while (u < L - 18) {
    if (!queue.length) refill();
    // Try the next type in the queue, then the others, at this spot.
    const order = [...queue.slice(0, 3)];
    const type = order.find((t) => clear(u, FEATURES[t]) && !overlaps(u, FEATURES[t]));
    if (!type) {
      u += 1;
      continue;
    }
    queue.splice(queue.indexOf(type), 1);
    features.push({ type, u: r3(u), label: FEATURES[type].label, span: [FEATURES[type].before, FEATURES[type].after] });
    u += FEATURES[type].after + 6 + rand() * 6;
  }
  // Drops are the crowd-pleasers: make sure there are a few, in any free spot.
  const free = (u, f) =>
    clear(u, f) && features.every((g) => u + f.after + 4 < g.u - g.span[0] || u - f.before - 4 > g.u + g.span[1]);
  for (const [type, min] of [["drop", MIN_DROPS]])
    for (let tries = 0; features.filter((f) => f.type === type).length < min && tries < 600; tries++) {
      const u0 = 12 + START.funnel + rand() * (L - 32 - START.funnel);
      if (free(u0, FEATURES[type])) features.push({ type, u: r3(u0), label: FEATURES[type].label, span: [FEATURES[type].before, FEATURES[type].after] });
    }
  features.sort((a, b) => a.u - b.u);
  return features;
}

/**
 * A hand-drawn circuit (from the designer, `npm run designer`): `outline` is the
 * centreline as [x, z] points in track units, already at scale. Centred like a
 * real one; its "real" length is what the lap would be at the season's usual 0.08.
 */
function drawnOutline(round) {
  const raw = round.outline;
  const cx = raw.reduce((a, p) => a + p[0], 0) / raw.length;
  const cz = raw.reduce((a, p) => a + p[1], 0) / raw.length;
  let per = 0;
  raw.forEach((p, i) => (per += Math.hypot(raw[(i + 1) % raw.length][0] - p[0], raw[(i + 1) % raw.length][1] - p[1])));
  const props = { Name: round.circuit ?? round.title, Location: round.location ?? round.country ?? "", length: round.realLength ?? Math.round(per / 0.08) };
  return { props, pts: raw.map(([x, z]) => [x - cx, z - cz]) };
}

export function buildCourse(round) {
  const { props, pts } = round.outline ? drawnOutline(round) : loadOutline(new URL(`../data/circuits/${round.geo}.geojson`, import.meta.url));
  const scale = round.outline ? 1 : (round.scale ?? SCALE);
  const relaxed = marbleize(pts, scale);
  // A few gentle smoothing passes take out the last polyline wobble.
  let loop = relaxed.pts;
  for (let pass = 0; pass < 3; pass++) {
    loop = loop.map((p, i) => {
      const a = loop[(i - 1 + loop.length) % loop.length];
      const b = loop[(i + 1) % loop.length];
      return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
    });
  }
  const L = relaxed.length;
  const n = loop.length;
  // Catmull-Rom through the loop points: a continuous tangent, so the barriers
  // have no kinks for marbles to catch on.
  const xzLoop = (u) => {
    const s = ((((u / L) * n) % n) + n) % n;
    const i = Math.floor(s);
    const t = s - i;
    const p0 = loop[(i - 1 + n) % n];
    const p1 = loop[i];
    const p2 = loop[(i + 1) % n];
    const p3 = loop[(i + 2) % n];
    const cr = (a, b, c, d) =>
      0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
  };
  // Where the lap starts. The lift tower and its two bays need ~24 straight
  // units before the start line and the grid's lanes and funnel ~12 after it,
  // so a circuit may move its line (`start`: units along the outline, or
  // "auto": the straightest such stretch of the lap, the nearest one to the
  // real line on a tie). Without `start` it is the outline's own first point.
  const startShift = (() => {
    if (round.start === undefined) return 0;
    if (typeof round.start === "number") return round.start;
    const step = 0.5;
    const pts = [];
    for (let u = 0; u < L; u += step) pts.push(xzLoop(u));
    const N2 = pts.length;
    const head = pts.map((p, k) => {
      const q = pts[(k + 1) % N2];
      return Math.atan2(q[1] - p[1], q[0] - p[0]);
    });
    const turn = head.map((h, k) => {
      let d = head[(k + 2) % N2] - head[(k - 2 + N2) % N2];
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return Math.abs(d) / (4 * step); // curvature
    });
    let best = null;
    for (let k = 0; k < N2; k++) {
      let worst = 0;
      for (let j = Math.round(-26 / step); j <= Math.round(14 / step); j++) worst = Math.max(worst, turn[(k + j + N2) % N2]);
      const u = k * step;
      const dist = Math.min(u, L - u);
      if (best === null || worst < best.worst - 1e-4 || (Math.abs(worst - best.worst) <= 1e-4 && dist < best.dist)) best = { u, worst, dist };
    }
    return best.u;
  })();
  const xzAt = (u) => xzLoop(u + startShift);

  const us = [];
  const END = r3(L - GRID_LENGTH - ELEVATOR.cabin); // where the track ends and the cabin docks
  for (let u = -GRID_LENGTH; u <= END + 1e-6; u += SAMPLE) us.push(r3(u));
  const m = us.length;
  const XZ = us.map(xzAt);
  const up = new Vector3(0, 1, 0);

  // Plan-view tangents and curvature (+ = bending to the right).
  const tPlan = XZ.map((_, k) => {
    const a = XZ[Math.max(k - 1, 0)];
    const b = XZ[Math.min(k + 1, m - 1)];
    return new Vector3(b[0] - a[0], 0, b[1] - a[1]).normalize();
  });
  const curv = tPlan.map((t, k) => {
    const a = tPlan[Math.max(k - 2, 0)];
    const b = tPlan[Math.min(k + 2, m - 1)];
    const right = new Vector3().crossVectors(t, up).normalize();
    return b.clone().sub(a).dot(right) / (4 * SAMPLE);
  });

  // The obstacle layout belongs to the circuit, not the race: same for every seed.
  // The circuit's own layout if it has one (src/gp/circuits/), else the planner's.
  const features = Array.isArray(round.layout) ? placeLayout(round.layout, curv, L, round.id) : planFeatures(us, curv, L, mulberry32(hashString(round.id)));
  // Crests at the apex of the sharp bends, wherever the layout leaves room (CREST).
  {
    const k0 = Math.round(GRID_LENGTH / SAMPLE);
    const peaks = [];
    for (let k = k0 + 2; k < m - 2; k++) {
      const c = Math.abs(curv[k]);
      if (c < CREST.minCurv || c > CREST.maxCurv || c < Math.abs(curv[k - 1]) || c < Math.abs(curv[k + 1])) continue;
      // Medium bends only, turning one way for ±6 units: in hairpins and S-bends marbles are slow and a lip stalls them.
      let ok = true;
      for (let j = -12; j <= 12 && ok; j++) {
        const q = Math.max(0, Math.min(m - 1, k + j));
        if (Math.sign(curv[q]) === -Math.sign(curv[k]) && Math.abs(curv[q]) > 0.02) ok = false;
        if (Math.abs(curv[q]) > CREST.maxCurv) ok = false;
      }
      if (ok) peaks.push({ u: us[k], c });
    }
    peaks.sort((a, b) => b.c - a.c);
    const crests = [];
    for (const p of peaks) {
      if (crests.length >= CREST.max) break;
      if (p.u < 30 || p.u > L - 26) continue;
      if (features.some((g) => p.u + 5 + 4 > g.u - g.span[0] && p.u - 4 - 4 < g.u + g.span[1])) continue;
      if (crests.some((q) => Math.abs(q - p.u) < CREST.spacing)) continue;
      crests.push(p.u);
    }
    for (const u of crests) features.push({ type: "crest", u: r3(u), label: "THE CREST", span: [4, 5] });
    features.sort((a, b) => a.u - b.u);
  }
  // Tubes round the tightest bends (TUBES): high guards and hoops, banking kept.
  {
    const runs = [];
    let a = null;
    for (let k = Math.round(GRID_LENGTH / SAMPLE) + 40; k < m; k++) {
      const u = us[k];
      const tight = Math.abs(curv[k]) > TUBES.minCurv && u < END - 20;
      if (tight && a === null) a = u;
      if ((!tight || k === m - 1) && a !== null) {
        if (u - a >= 2) runs.push([a - 2, u + 2]);
        a = null;
      }
    }
    for (const [u0, u1] of runs) {
      if (features.some((g) => u1 + 2 > g.u - g.span[0] && u0 - 2 < g.u + g.span[1])) continue;
      features.push({ type: "tube", u: r3(u0), label: "THE TUBE", span: [0, r3(u1 - u0)] });
    }
    features.sort((a, b) => a.u - b.u);
  }
  // Launches: a booster, then a kicker (BIG AIR), wherever a long enough straight is free (LAUNCHES).
  {
    const jump = featureRule("jump");
    const boost = featureRule("booster");
    const { clear } = placementRules(curv);
    let added = 0;
    for (let u = 40; u <= L - 30 && added < LAUNCHES.max; u += 1) {
      const ub = u - LAUNCHES.gap;
      if (!clear(u, jump) || !clear(ub, boost)) continue;
      if (features.some((g) => u + jump.after + 4 > g.u - g.span[0] && ub - boost.before - 4 < g.u + g.span[1])) continue;
      features.push({ type: "booster", u: r3(ub), label: "BOOSTER", span: [boost.before, boost.after] });
      features.push({ type: "jump", u: r3(u), label: jump.label, span: [jump.before, jump.after] });
      features.sort((a, b) => a.u - b.u);
      added++;
      u += 40;
    }
  }
  // Slingshot rollers on every circuit that has none.
  if (!features.some((g) => g.type === "rollers")) {
    const rule = featureRule("rollers");
    const { clear } = placementRules(curv);
    for (let u = 40; u <= L - 30; u += 1) {
      if (!clear(u, rule) || features.some((g) => u + rule.after + 4 > g.u - g.span[0] && u - rule.before - 4 < g.u + g.span[1])) continue;
      features.push({ type: "rollers", u: r3(u), label: rule.label, span: [rule.before, rule.after] });
      features.sort((a, b) => a.u - b.u);
      break;
    }
  }
  // Fans: a few more wherever a straight is free (FANS), spread over the lap.
  {
    const rule = featureRule("fan");
    const { clear } = placementRules(curv);
    let added = 0;
    for (let u = 30; u <= L - 30 && added < FANS.extra; u += 1) {
      if (!clear(u, rule)) continue;
      if (features.some((g) => u + rule.after + 6 > g.u - g.span[0] && u - rule.before - 6 < g.u + g.span[1])) continue;
      if (features.some((g) => g.type === "fan" && Math.abs(g.u - u) < FANS.spacing)) continue;
      features.push({ type: "fan", u: r3(u), label: rule.label, span: [rule.before, rule.after] });
      features.sort((a, b) => a.u - b.u);
      added++;
      u += FANS.spacing;
    }
  }
  // Boosters on the straights just after the bends, where the pack has slowed (BOOSTERS).
  {
    const straight = (u0, u1) => {
      for (let u = u0; u <= u1; u += SAMPLE) if (Math.abs(curv[Math.max(0, Math.min(m - 1, Math.round((u + GRID_LENGTH) / SAMPLE)))]) > 0.04) return false;
      return true;
    };
    const bendBefore = (u) => {
      for (let x = u - 10; x < u; x += SAMPLE) if (Math.abs(curv[Math.max(0, Math.min(m - 1, Math.round((x + GRID_LENGTH) / SAMPLE)))]) > 0.07) return true;
      return false;
    };
    const placed = [];
    for (let u = 26; u <= L - 30 && placed.length < BOOSTERS.max; u += 1) {
      if (!bendBefore(u) || !straight(u - 1, u + 6)) continue;
      if (placed.some((q) => Math.abs(q - u) < BOOSTERS.spacing)) continue;
      if (features.some((g) => u + 6 + 3 > g.u - g.span[0] && u - 1 - 3 < g.u + g.span[1])) continue;
      placed.push(u);
    }
    for (const u of placed) features.push({ type: "booster", u: r3(u), label: "BOOSTER", span: [1, 5] });
    features.sort((a, b) => a.u - b.u);
  }

  // Elevation: a steady descent with sudden drops and rumble strips, then a
  // run-off that levels out and climbs so finished marbles stop. The grid sits
  // above the start.
  const tanS = Math.tan(SLOPE);
  const hs = [];
  for (let k = 0; k < m; k++) {
    const u = us[k];
    if (k === 0) {
      hs.push(0);
      continue;
    }
    let slope = tanS;
    if (u < START_STEEP.until) slope = START_STEEP.slope + (tanS - START_STEEP.slope) * Math.max(0, (u - START_STEEP.until + 6) / 6);
    if (u > L) slope = tanS + (-Math.tan((5 * Math.PI) / 180) - tanS) * Math.min((u - L) / 6, 1);
    let h = hs[k - 1] - slope * SAMPLE;
    for (const f of features) {
      if (f.type === "drop" && us[k - 1] < f.u && u >= f.u) h -= DROP_HEIGHT;
      if (f.type === "vortex" && u > f.u + VORTEX.entry - VORTEX.ramp && u <= f.u + VORTEX.entry) h -= (VORTEX.rampSlope - slope) * SAMPLE;
      // Vortex: the hidden samples inside the bowl step down to the lower track.
      if (f.type === "vortex" && u > f.u + VORTEX.entry + SAMPLE / 2 && u <= f.u + VORTEX.resume + 1e-6) {
        const steps = Math.max(1, Math.round((VORTEX.resume - VORTEX.entry) / SAMPLE) - 1); // at least the one hidden sample
        h -= (VORTEX.depth + VORTEX.throat + VORTEX.fall) / steps;
      }
      // Lift: the belt climbs steeply (cancelling the usual descent too).
      if (f.type === "lift" && u > f.u && u <= f.u + LIFT.len) h += (Math.tan(LIFT.angle) + slope) * SAMPLE;
      // Crest: a mini kicker in the bend. A steeper run-up, a lip that stays below where the run-up
      // began (a hump above the line stalled the slow marbles), then a small step down.
      if (f.type === "crest") {
        if (u > f.u - CREST.ramp - CREST.runup && u <= f.u - CREST.ramp) h -= (CREST.runupSlope - slope) * SAMPLE;
        if (u > f.u - CREST.ramp && u <= f.u) h += (CREST.lip / CREST.ramp) * SAMPLE;
        if (us[k - 1] <= f.u && u > f.u) h -= CREST.lip + CREST.drop;
      }
      // Jump: the floor kicks up into a lip, then falls away — marbles take off.
      if (f.type === "jump") {
        if (u > f.u - JUMP.ramp - JUMP.runup && u <= f.u - JUMP.ramp) h -= (JUMP.runupSlope - slope) * SAMPLE;
        if (u > f.u - JUMP.ramp && u <= f.u) h += (JUMP.lip / JUMP.ramp) * SAMPLE;
        if (us[k - 1] <= f.u && u > f.u) h -= JUMP.lip + JUMP.drop;
      }
    }
    hs.push(h);
  }
  const bumpAt = (u) => {
    let b = 0;
    for (const f of features) {

      if (f.type !== "bumps") continue;
      const x = u - f.u;
      if (x >= 0 && x <= BUMP.length * BUMP.count) b += (BUMP.amp * (1 - Math.cos((2 * Math.PI * x) / BUMP.length))) / 2;
    }
    return b;
  };
  const P = us.map((u, k) => new Vector3(XZ[k][0], hs[k] + bumpAt(u), XZ[k][1]));
  const H = P[Math.round(GRID_LENGTH / SAMPLE)].y - P[P.length - 1].y; // the lap's descent, start line to track end

  // The frame follows the plan view and the base slope only, so cross sections
  // stay upright through drops and bumps (the floor between them becomes the
  // drop face).
  const tangent = tPlan.map((t) => new Vector3(t.x, -tanS, t.z).normalize());
  const bankRaw = curv.map((c) => -Math.sign(c) * Math.min(MAX_BANK, Math.atan((DESIGN_SPEED ** 2 * Math.abs(c)) / GRAVITY)));
  const bank = bankRaw.map((_, k) => {
    let s = 0;
    let c = 0;
    for (let j = -8; j <= 8; j++) {
      const q = k + j;
      if (q < 0 || q >= m) continue;
      s += bankRaw[q];
      c++;
    }
    // No banking on the grid or in the run-off, at the obstacles (they need a level floor, and a steep
    // bank running into one left a ridge that stopped the pack) or on the run into the lift bays.
    const u = us[k];
    if (u < 2 || u > L || u > END - 18) return 0;
    if (features.some((g) => g.type !== "crest" && g.type !== "booster" && g.type !== "tube" && u > g.u - g.span[0] - 3 && u < g.u + g.span[1] + 3)) return 0;
    return s / c;
  });
  const maxStep = BANK_RATE * SAMPLE;
  for (let k = 1; k < m; k++) bank[k] = Math.max(bank[k - 1] - maxStep, Math.min(bank[k - 1] + maxStep, bank[k]));
  for (let k = m - 2; k >= 0; k--) bank[k] = Math.max(bank[k + 1] - maxStep, Math.min(bank[k + 1] + maxStep, bank[k]));
  // Smooth the plan-view tangent over ±3 samples: the Catmull-Rom centreline
  // still has a faint per-sample wobble, which the stripes and the physics
  // would otherwise follow as tiny ridges.
  const tangentS = tangent.map((_, k) => {
    const acc = new Vector3();
    for (let j = -3; j <= 3; j++) acc.add(tangent[Math.max(0, Math.min(m - 1, k + j))]);
    return acc.normalize();
  });
  const samples = P.map((p, k) => {
    const t = tangentS[k];
    const r0 = new Vector3().crossVectors(t, up).normalize();
    const n0 = new Vector3().crossVectors(r0, t).normalize();
    const phi = bank[k];
    const r = r0.clone().multiplyScalar(Math.cos(phi)).addScaledVector(n0, Math.sin(phi));
    const nn = n0.clone().multiplyScalar(Math.cos(phi)).addScaledVector(r0, -Math.sin(phi));
    // Rotate about the pivot (centre of the round sides), not the bottom.
    const pivot = p.clone().addScaledVector(n0, BANK_PIVOT);
    const bottom = pivot.addScaledVector(nn, -BANK_PIVOT);
    // Half-width: wide start lanes, a smooth funnel, then the normal track.
    const x = Math.min(Math.max((us[k] - 0.5) / START.funnel, 0), 1);
    let w = START.half + (TRACK.width / 2 - START.half) * x * x * (3 - 2 * x);
    // And out again into the two lift bays at the end of the lap.
    const xe = Math.min(Math.max((us[k] - (END - ELEVATOR.funnel)) / ELEVATOR.funnel, 0), 1);
    w = Math.max(w, TRACK.width / 2 + (START.half - TRACK.width / 2) * xe * xe * (3 - 2 * xe));
    const gap = features.some((f) => f.type === "vortex" && us[k] > f.u + VORTEX.entry && us[k] <= f.u + VORTEX.resume + 1e-6);
    return { u: us[k], p: arr(bottom), t: arr(t), r: arr(r), n: arr(nn), curv: r3(curv[k]), bank: r3(phi), w: r3(w), ...(gap ? { gap: true } : {}) };
  });

  const sampleAt = (u) => samples[Math.max(0, Math.min(m - 1, Math.round((u + GRID_LENGTH) / SAMPLE)))];
  /** Track frame interpolated at any u (cameras need this to move smoothly). */
  const frameAt = (u) => {
    const x = Math.max(0, Math.min(m - 1.001, (u + GRID_LENGTH) / SAMPLE));
    const k = Math.floor(x);
    const a = x - k;
    const A = samples[k];
    const B = samples[k + 1];
    const mix = (key) => A[key].map((v, j) => v + (B[key][j] - v) * a);
    return { u, p: mix("p"), t: mix("t"), r: mix("r"), n: mix("n"), curv: A.curv, w: A.w + (B.w - A.w) * a };
  };
  // The lift tower: the cabin's frame at the bottom dock (centre of its
  // floor, which continues the track's slope; local x forward), and how far
  // it rises so its front edge meets the grid's start.
  const cabinC = xzAt(END + ELEVATOR.cabin / 2);
  const cA = xzAt(END + ELEVATOR.cabin / 2 - 0.2);
  const cB = xzAt(END + ELEVATOR.cabin / 2 + 0.2);
  const fwd = new Vector3(cB[0] - cA[0], 0, cB[1] - cA[1]).normalize();
  const slope = START_STEEP.slope; // the grid's own slope: the cabin unloads straight onto it
  const endY = samples[samples.length - 1].p[1];
  const topY = samples[0].p[1];
  const bottomCentreY = endY - (ELEVATOR.cabin / 2) * slope;
  const topCentreY = topY + (ELEVATOR.cabin / 2) * slope;
  const right = new Vector3(-fwd.z, 0, fwd.x);
  const bayLat = START.half / ELEVATOR.bays; // bay centres at ±2.35 for two bays
  const elevators = Array.from({ length: ELEVATOR.bays }, (_, k) => {
    const lat = (k - (ELEVATOR.bays - 1) / 2) * 2 * bayLat;
    return {
      bay: k,
      lat: r3(lat),
      center: [r3(cabinC[0] + right.x * lat), r3(bottomCentreY), r3(cabinC[1] + right.z * lat)],
      fwd: [r3(fwd.x), 0, r3(fwd.z)],
      slope: r3(slope),
      length: ELEVATOR.cabin,
      width: ELEVATOR.width,
      bayWidth: r3(2 * bayLat),
      wall: ELEVATOR.wall,
      lift: r3(topCentreY - bottomCentreY),
      u: END,
    };
  });
  features.push({ type: "elevator", u: END, label: "THE STAIRWAY", span: [6, 0.5] });
  return { props, L, H, loop, samples, sampleAt, frameAt, features, END, uFinish: r3(END - 1.4), elevators, xzAt, startShift: r3(startShift) };
}

// --- Obstacles -----------------------------------------------------------------------
const rot = (a) => ({ x: a[0], y: a[1], z: a[2], w: a[3] });
const quatArr2 = (q) => [q.x, q.y, q.z, q.w].map(r3);
const mod = (x, m) => ((x % m) + m) % m;
/** Orientation with local x along the track, y out of the trough, z across it. */
const frameQuat = (s) => new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(v3(s.t), v3(s.n), v3(s.r)));

/** A hammer's orientation at time t: its frame swung about the track direction. */
function buildObstacles(course, sync = {}) {
  const { frameAt, features } = course;
  const statics = [];
  const out = Object.fromEntries(OBSTACLES.filter((o) => o.collection).map((o) => [o.collection, []]));
  const quatArr = (q) => [q.x, q.y, q.z, q.w].map(r3);
  const cylinder = (kind, u, lat, radius, height, restitution) => {
    const s = frameAt(u);
    // Sunk a little into the floor so it sits flush on the curved surface.
    statics.push({
      kind,
      shape: "cylinder",
      pos: pointOnTrack(s, lat, height / 2 - 0.12).map(r3),
      quat: quatArr(frameQuat(s)),
      radius,
      height,
      restitution,
    });
  };
  // Every obstacle builds itself (src/gp/obstacles/). The trough funnels marbles
  // to its centre line, so nothing sits exactly on it: a marble meeting an
  // obstacle head-on there would stop balanced. Every hit is a glancing one.
  const ctx = { frameAt, statics, out, sync, cylinder };
  for (const f of features) BY_TYPE[f.type]?.build?.(f, ctx);
  // Clear guard panels along both walls over every jump, in short segments
  // that follow the floor (over the kicker, the drop and the landing), so a
  // marble that drifts sideways in the air stays on the track.
  for (const f of features) {
    const zone = f.type === "tube" ? [-1, f.span[1] + 1, TUBES.height] : GUARD_ZONES[f.type];
    if (!zone) continue;
    const height = zone[2] ?? GUARD.height;
    for (let u = f.u + zone[0]; u < f.u + zone[1]; u += GUARD.segment) {
      const s = frameAt(u + GUARD.segment / 2);
      const W2 = s.w ?? TRACK.width / 2;
      for (const side of [-1, 1]) {
        statics.push({
          kind: "guard",
          shape: "box",
          pos: pointInFrame(s, side * (W2 + TRACK.wall / 2), TRACK_DEPTH + height / 2 - 0.05).map(r3),
          quat: quatArr(frameQuat(s)),
          size: [GUARD.segment + 0.04, height, 0.05],
          side,
          depth: 0.3, // collider depth, outward: a pile cannot pop a marble through the thin panel
          restitution: 0.3,
        });
      }
    }
  }
  // Disqualification pads: beside every machine, at the foot of alternate walls.
  features
    .filter((f) => DQ.types.includes(f.type))
    .filter((_, k) => k % DQ.every === 0)
    .forEach((f, k) => {
      const side = k % 2 ? -1 : 1;
      const u = f.u + DQ.offset;
      const s = frameAt(u);
      const w = s.w ?? TRACK.width / 2;
      statics.push({
        kind: "dq",
        shape: "box",
        pos: pointOnTrack(s, side * (w - 0.04 - DQ.width / 2), 0.01).map(r3),
        quat: quatArr(frameQuat(s)),
        size: [DQ.len, 0.02, DQ.width],
        u: r3(u),
        side,
        feature: f.type,
        restitution: 0,
      });
    });
  // The divider between the two lift bays at the end of the lap, with a rounded nose.
  if (course.END) {
    const s = frameAt(course.END - ELEVATOR.funnel / 2 + 0.6);
    statics.push({ kind: "divider", shape: "box", pos: pointInFrame(s, 0, 0.45).map(r3), quat: quatArr(frameQuat(s)), size: [ELEVATOR.funnel - 1.2, 0.9, 0.1], restitution: 0.3 });
    cylinder("divider", course.END - ELEVATOR.funnel + 1.0, 0, 0.12, 0.9, 0.3);
  }
  // Lane dividers in the start area: thin walls between the ten lanes.
  const laneW = (2 * START.half) / GRID.lanes;
  for (let k = 1; k < GRID.lanes; k++) {
    const lat = -START.half + k * laneW;
    const um = (START.lanesFrom + START.lanesTo) / 2;
    const s = frameAt(um);
    statics.push({
      kind: "divider",
      shape: "box",
      pos: pointInFrame(s, lat, 0.24).map(r3),
      quat: quatArr(frameQuat(s)),
      size: [START.lanesTo - START.lanesFrom, 0.48, 0.05],
      restitution: 0.3,
    });
  }
  const lifts = features
    .filter((f) => f.type === "lift")
    .map((f) => ({ u0: r3(f.u), len: LIFT.len, lead: LIFT.lead, rise: LIFT.rise, speed: LIFT.speed, spacing: LIFT.spacing, count: LIFT.count, half: TRACK.width / 2 - 0.16 }));
  return { statics, ...out, lifts };
}

// --- Race ----------------------------------------------------------------------------
/** Runs the race, then re-runs it with the machines timed to the pack it produced. */
export async function runRound(round, seed, opts) {
  let sync = {};
  let dqReach = DQ.reach;
  for (let pass = 0; pass < 2; pass++) {
    const r = await runRoundOnce(round, seed, { ...opts, quiet: true, sync, dqReach });
    sync = r.arrivals;
    // A circuit can ask for a number of disqualifications per race (`dq: { target }`).
    // There a marble is out if it crosses a pad's line within `dqReach` of the
    // wall; the trial pass recorded how close to the wall every marble crossed,
    // so the reach is set to catch about that many (the closest wall-huggers).
    if (round.dq?.target !== undefined && pass === 1) {
      const gaps = [...r.dqGaps].sort((a, b) => a - b);
      const k = Math.max(1, Math.round(round.dq.target));
      dqReach = gaps.length >= k ? (gaps[k - 1] + (gaps[k] ?? gaps[k - 1] + 0.02)) / 2 : DQ.reach;
    }
  }
  return runRoundOnce(round, seed, { ...opts, sync, dqReach });
}

async function runRoundOnce(round, seed, { quiet, sync = {}, dqReach = DQ.reach }) {
  const dqCrossing = round.dq?.target !== undefined; // calibrated pads: a crossing test with a tuned reach
  const rand = mulberry32(seed * 1000 + round.id.length);
  const course = buildCourse(round);
  const { L, samples, sampleAt } = course;
  if (process.env.GP_FEATURES) console.log(course.features.map((f) => `${f.type}@${f.u.toFixed(0)}`).join("  "));
  if (process.env.GP_GEOM) {
    const [a, b] = process.env.GP_GEOM.split(",").map(Number);
    for (const s of samples) {
      if (s.u < a || s.u > b) continue;
      const bankDeg = (Math.asin(Math.max(-1, Math.min(1, s.r[1]))) * 180) / Math.PI;
      console.log(`u=${s.u.toFixed(1)} y=${s.p[1].toFixed(2)} curv=${s.curv.toFixed(3)} R=${(1 / Math.abs(s.curv || 1e-9)).toFixed(2)} bank=${((s.bank * 180) / Math.PI).toFixed(1)}°`);
    }
  }

  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = DT;
  const mesh = buildTrackMesh(samples, { endCaps: false });
  const trackBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(mesh.physics.vertices, mesh.physics.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setFriction(0.35)
      .setRestitution(TRACK_RESTITUTION)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setCollisionGroups(GROUP_TRACK),
    trackBody,
  );

  const obstacles = buildObstacles(course, sync);
  // Every machine creates its own bodies (src/gp/obstacles/), in a fixed order:
  // the order colliders are created in is part of every bake's result.
  const pctx = { RAPIER, groups: { track: GROUP_TRACK, clear: GROUP_CLEAR }, trackBody, samples, GRID_LENGTH, SAMPLE, FPS };
  const machines = {};
  const createMachines = (types) => {
    for (const type of types) {
      const o = BY_TYPE[type];
      if (o.physics) machines[type] = o.physics(world, obstacles[o.collection], pctx);
    }
  };
  createMachines(PHYSICS_ORDER.beforeLifts);
  // Inside the drain a marble keeps almost all its speed (little air drag, no rolling resistance worth the name).
  const inVortex = (p) => machines.vortex.inside(p);
  const vortexDamping = MARBLES.map(() => false);

  // The endless stair (src/gp/stair.js): per bay a column of kinematic platforms
  // rising continuously from below the dock to above the grid, and the shaft's
  // static walls. No doors, no cabin, no waiting.
  const lifts = course.elevators.map((EV) => {
    const evFwd = new Vector3(...EV.fwd);
    const evRight = new Vector3(-EV.fwd[2], 0, EV.fwd[0]);
    const evTilt = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.atan(EV.slope)); // floor falls toward +x
    const evYaw = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(evFwd, new Vector3(0, 1, 0), evRight));
    const evQuat = evYaw.clone().multiply(evTilt);
    const evCentre = new Vector3(...EV.center);
    // The platforms tilt forward more than the floor, so riders roll off promptly at the top.
    const plateQ = evYaw.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -STAIR.tilt));
    const q = rot([plateQ.x, plateQ.y, plateQ.z, plateQ.w]);
    const yawQ = rot([evYaw.x, evYaw.y, evYaw.z, evYaw.w]);
    const loop = stairLoop(EV);
    const at = (x, y, z) => evCentre.clone().addScaledVector(evFwd, x).add(new Vector3(0, y, 0)).addScaledVector(evRight, z);
    // Platforms: thin plates, their top at the loop point, tilted forward like the grid.
    const plates = Array.from({ length: loop.count }, (_, k) => {
      const [x, y, z] = stairLocal(EV, loop, k, 0);
      const p = at(x, y, z);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z).setRotation(q));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(EV.length / 2 - 0.03, STAIR.plate / 2, EV.width / 2 - 0.03).setTranslation(0, -STAIR.plate / 2, 0).setFriction(0.6).setRestitution(0.1).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min).setCollisionGroups(GROUP_TRACK),
        body,
      );
      return body;
    });
    // The shaft: a wall in front up to grid level (riders roll out over its top), a wall behind
    // above the entrance, the outer wall (open below and above for the platforms' return), and
    // the wall between the bays (full height).
    const side = EV.lat < 0 ? -1 : 1;
    const wall = (x, y0, y1, z, hx, hz) => {
      const c = at(x, (y0 + y1) / 2, z);
      const b = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, c.y, c.z).setRotation(yawQ));
      world.createCollider(RAPIER.ColliderDesc.cuboid(hx, (y1 - y0) / 2, hz).setFriction(0.05).setRestitution(0.1).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min).setCollisionGroups(GROUP_TRACK), b);
    };
    const frontTop = EV.lift - EV.slope * (EV.length / 2) - 0.02;
    wall(EV.length / 2 + 0.15, loop.yb - 0.4, frontTop, 0, 0.15, EV.width / 2 + 0.1);
    wall(-EV.length / 2 - 0.15, 1.1, loop.yt + 1.2, 0, 0.15, EV.width / 2 + 0.1);
    wall(0, -1.1, EV.lift + 0.6, side * (EV.width / 2 + 0.1), EV.length / 2 + 0.3, 0.07);
    wall(0, loop.yb - 0.4, loop.yt + 1.2, -side * (EV.width / 2 + 0.1), EV.length / 2 + 0.3, 0.07);
    const ev = { cycles: [], cabinY: [], doors: [], rides: [] };
    return { EV, evFwd, evRight, evQuat, evCentre, loop, plates, at, ev };
  });
  let stairStop = null; // the stairs stop when everyone still racing is on the last lap
  const riding = MARBLES.map(() => null); // the bay a marble is riding up, and since when
  createMachines(PHYSICS_ORDER.beforeStatics);
  for (const o of obstacles.statics) {
    if (o.kind === "dq") continue; // a sensor in the bake loop, not a collider
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...o.pos).setRotation(rot(o.quat)));
    const desc =
      o.shape === "box"
        ? o.depth
          ? RAPIER.ColliderDesc.cuboid(o.size[0] / 2, o.size[1] / 2, o.depth / 2).setTranslation(0, 0, o.side * (o.depth / 2 - o.size[2] / 2))
          : RAPIER.ColliderDesc.cuboid(o.size[0] / 2, o.size[1] / 2, o.size[2] / 2)
        : RAPIER.ColliderDesc.cylinder(o.height / 2, o.radius);
    desc
      .setFriction(0.2)
      .setRestitution(OBSTACLE_RESTITUTION[o.kind] ?? 0.3)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setCollisionGroups(o.kind === "guard" ? GROUP_CLEAR : GROUP_TRACK); // cameras see through the clear guard panels
    world.createCollider(desc, body);
  }
  createMachines(PHYSICS_ORDER.afterStatics);

  const cleats = [];
  for (const lift of obstacles.lifts)
    for (let k = 0; k < lift.count; k++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.06, 0.17, lift.half)
          .setFriction(0.5)
          .setRestitution(OBSTACLE_RESTITUTION.cleat)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setCollisionGroups(GROUP_TRACK),
        body,
      );
      const pose = liftCleatPose(lift, k, 0, course.frameAt);
      body.setTranslation({ x: pose.pos[0], y: pose.pos[1], z: pose.pos[2] }, true);
      body.setRotation(rot(pose.quat), true);
      cleats.push({ body, lift, k });
    }

  if (process.env.GP_PROBE) {
    // Drop one marble at u = GP_PROBE and print where it goes.
    const [u0, lat0 = 0] = process.env.GP_PROBE.split(",").map(Number);
    const p0 = pointOnTrack(sampleAt(u0), lat0, R + 0.05);
    const b = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...p0).setLinearDamping(DAMPING));
    world.createCollider(RAPIER.ColliderDesc.ball(R).setFriction(0.15).setRestitution(MARBLE_RESTITUTION).setDensity(2).setCollisionGroups(GROUP_MARBLE), b);
    let k = Math.round((u0 + GRID_LENGTH) / SAMPLE);
    for (let st = 0; st <= 12 * 120; st++) {
      if (st % 60 === 0) {
        const p = b.translation();
        let best = k, bd = Infinity;
        for (let j = Math.max(0, k - 30); j < Math.min(samples.length, k + 30); j++) {
          const q = samples[j].p; const d = (q[0]-p.x)**2 + (q[1]-p.y)**2 + (q[2]-p.z)**2;
          if (d < bd) { bd = d; best = j; }
        }
        k = best;
        const v = b.linvel();
        const av = b.angvel(); console.log(`t=${(st / 120).toFixed(1)} u=${samples[k].u.toFixed(1)} p=${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} v=${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)} w=${Math.hypot(av.x,av.y,av.z).toFixed(1)} sleep=${b.isSleeping()}`);
      }
      world.step();
    }
    process.exit(0);
  }

  // Start gate: a flap cut to the trough's U profile, hinged along its top
  // edge. At lights out it swings forward and up, away from the marbles.
  const lightsOut = LIGHT_TIMES[4] + 0.5 + rand() * 0.8;
  const raceStart = Math.round(lightsOut * FPS);
  const gs = sampleAt(0.3);
  const gateQuat = frameQuat(gs);
  const GATE_HEIGHT = TRACK_DEPTH + 0.05;
  const hinge = v3(pointInFrame(gs, 0, GATE_HEIGHT));
  const gateBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(hinge.x, hinge.y, hinge.z).setRotation(gateQuat),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.05, GATE_HEIGHT / 2, START.half)
      .setTranslation(0, -GATE_HEIGHT / 2, 0)
      .setCollisionGroups(GROUP_TRACK),
    gateBody,
  );
  const gateRotation = (t) => {
    const k = Math.min(Math.max((t - lightsOut) / GATE.time, 0), 1);
    const angle = GATE.swing * (1 - (1 - k) ** 3);
    const q = gateQuat.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle));
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  };

  // Qualifying: a random grid. Two staggered columns like a real starting grid.
  const grid = MARBLES.map((_, i) => i);
  for (let i = grid.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [grid[i], grid[j]] = [grid[j], grid[i]];
  }
  const gridSlot = MARBLES.map((_, i) => grid.indexOf(i));
  const bodies = MARBLES.map((_, i) => {
    // One marble per lane and row: slot 0-9 on the front row, 10-19 behind.
    const slot = gridSlot[i];
    const laneW = (2 * START.half) / GRID.lanes;
    const lat = -START.half + laneW * ((slot % GRID.lanes) + 0.5);
    const s = sampleAt(-0.8 - Math.floor(slot / GRID.lanes) * GRID.rowGap);
    const p = pointOnTrack(s, lat, R + 0.05);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p[0], p[1], p[2])
        // No CCD: at 120 Hz a marble moves ~0.05 per step, far below its radius,
        // and CCD against the trimesh makes marbles stick in place.
        .setLinearDamping(DAMPING)
        // Marbles settle on the grid for seconds; asleep, they'd ignore the gate lifting.
        .setCanSleep(false),
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(R).setFriction(0.15).setRestitution(MARBLE_RESTITUTION).setDensity(2).setCollisionGroups(GROUP_MARBLE),
      body,
    );
    return body;
  });

  // Progress: nearest centreline sample, searched near last frame's answer so a
  // marble is never confused with a part of the track passing above or below it.
  const idx = bodies.map((b) => Math.round((-0.8 + GRID_LENGTH) / SAMPLE));
  /** Lap-local u from the stored progress (lap * L + u). */
  const uLocal = (P) => ((((P + GRID_LENGTH) % L) + L) % L) - GRID_LENGTH;
  const progressOf = (i, p) => {
    let best = idx[i];
    let bd = Infinity;
    for (let k = Math.max(0, idx[i] - 30); k <= Math.min(samples.length - 1, idx[i] + 30); k++) {
      const s = samples[k].p;
      const d = (s[0] - p.x) ** 2 + (s[1] - p.y) ** 2 + (s[2] - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    idx[i] = best;
    // Continuous along the track: project onto the tangent at the nearest sample.
    const s = samples[best];
    const along = (p.x - s.p[0]) * s.t[0] + (p.y - s.p[1]) * s.t[1] + (p.z - s.p[2]) * s.t[2];
    return s.u + Math.max(-SAMPLE, Math.min(SAMPLE, along));
  };

  const frames = [];
  const fellReported = new Set();
  const finishFrame = MARBLES.map(() => null);
  const dqFrame = MARBLES.map(() => null);
  const lap = MARBLES.map(() => 0);
  const lapStartFrame = MARBLES.map(() => null);
  const lapEndFrame = MARBLES.map(() => null);
  const laps = []; // completed descents: { marble, lap, start, end }
  const lapEnd = (i, f) => {
    lapEndFrame[i] = f;
    if (lapStartFrame[i] !== null) laps.push({ marble: i, lap: lap[i], start: lapStartFrame[i], end: f });
  };
  const dqZones = obstacles.statics.filter((o) => o.kind === "dq").map((o) => ({ ...o, s: course.frameAt(o.u) }));
  const dqEvents = [];
  const dqGaps = [];
  const prevU = MARBLES.map(() => null);
  const impacts = [];
  const prevVel = bodies.map(() => null);
  const lastImpact = bodies.map(() => -99);
  const maxFrames = Math.round((LAPS * (L / 3 + 30) + 40) * FPS);
  let allDone = null;
  let step = 0;

  for (let f = 0; f < maxFrames; f++) {
    frames.push(
      bodies.map((b, i) => {
        if (dqFrame[i] !== null) return frames[dqFrame[i]][i]; // parked where it was caught
        const p = b.translation();
        const q = b.rotation();
        const u = progressOf(i, p);
        if (finishFrame[i] === null) {
          const inside = inVortex(p);
          if (inside !== vortexDamping[i]) {
            b.setLinearDamping(inside ? 0.008 : DAMPING);
            vortexDamping[i] = inside;
          }
        }
        if (finishFrame[i] === null && f > raceStart && lap[i] === LAPS - 1 && u >= course.uFinish) {
          finishFrame[i] = f;
          b.setLinearDamping(BRAKE_DAMPING);
          lapEnd(i, f);
        } else if (lap[i] < LAPS - 1 && u >= course.uFinish && lapEndFrame[i] === null) lapEnd(i, f);
        if (lapStartFrame[i] === null && f > raceStart && u >= 0) lapStartFrame[i] = f;
        if (finishFrame[i] === null && f > raceStart) {
          for (const z of dqZones) {
            const rel = [p.x - z.s.p[0], p.y - z.s.p[1], p.z - z.s.p[2]];
            const lat = rel[0] * z.s.r[0] + rel[1] * z.s.r[1] + rel[2] * z.s.r[2];
            const up = rel[0] * z.s.n[0] + rel[1] * z.s.n[1] + rel[2] * z.s.n[2] - R;
            const w = z.s.w ?? TRACK.width / 2;
            if (dqCrossing) {
              // Crossed the pad's line this frame (same lap): how close to the wall?
              const crossed = prevU[i] !== null && prevU[i] < z.u && u >= z.u && u - prevU[i] < 2 && up < 0.6 && up > -0.5; // on the floor (a marble falling past is no drain)
              if (!crossed) continue;
              const gap = w - lat * z.side;
              dqGaps.push(gap);
              if (gap >= dqReach) continue;
            } else {
              if (Math.abs(u - z.u) > DQ.len / 2) continue; // u is lap-local here
              if (!(lat * z.side > w - DQ.reach && up < 0.6)) continue;
            }
            {
              dqFrame[i] = f;
              dqEvents.push({ frame: f, kind: "dq", a: i, b: i, pos: 0, feature: z.feature, zone: z });
              b.setEnabled(false);
              break;
            }
          }
        }
        prevU[i] = u;
        return [r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), r3(lap[i] * L + u)];
      }),
    );
    // The stairs: who is riding in each bay; a marble starts its next lap at the top.
    {
      const racingIdx = MARBLES.map((_, i) => i).filter((i) => finishFrame[i] === null && dqFrame[i] === null);
      // The stairs stop when everyone still racing is on the last lap (nobody needs them any more).
      if (stairStop === null && racingIdx.length && racingIdx.every((i) => lap[i] === LAPS - 1)) stairStop = step * DT;
      for (const [bay, lift] of lifts.entries()) {
        const { EV, ev, evCentre, evFwd, evRight } = lift;
        let top = 0;
        for (const i of MARBLES.keys()) {
          if (dqFrame[i] !== null) continue;
          const p = bodies[i].translation();
          const rel = new Vector3(p.x, p.y, p.z).sub(evCentre);
          const inside = Math.abs(rel.dot(evFwd)) < EV.length / 2 + 0.1 && Math.abs(rel.dot(evRight)) < EV.width / 2 + 0.05 && rel.y > -STAIR.below - 0.5 && rel.y < EV.lift + 1;
          if (!inside) continue;
          // A finisher that rolls into a shaft is parked there (it must not ride up for a fourth lap).
          if (finishFrame[i] !== null) {
            if (bodies[i].isEnabled()) bodies[i].setEnabled(false);
            continue;
          }
          if (rel.y > 0.4) top = Math.max(top, Math.min(EV.lift, rel.y - 0.35));
          if (riding[i] === null && finishFrame[i] === null && rel.y < 1) riding[i] = { bay, start: f };
          if (riding[i] && riding[i].bay === bay && rel.y > EV.lift - 0.5) {
            ev.rides.push({ marble: i, start: riding[i].start, top: f });
            riding[i] = null;
            lap[i]++;
            idx[i] = 0;
            lapStartFrame[i] = null;
            lapEndFrame[i] = null;
          }
        }
        if (process.env.GP_STAIR && f % 30 === 0) {
          const i = MARBLES.findIndex((m) => m.abbr === process.env.GP_STAIR);
          const p = bodies[i].translation();
          const rel = new Vector3(p.x, p.y, p.z).sub(evCentre);
          if (Math.abs(rel.dot(evRight)) < 6 && Math.abs(rel.dot(evFwd)) < 8 && bay === 0) console.log(`f=${f} bay${bay} x=${rel.dot(evFwd).toFixed(2)} y=${rel.y.toFixed(2)} z=${rel.dot(evRight).toFixed(2)} lap=${lap[i]} riding=${JSON.stringify(riding[i])} stop=${stairStop}`);
        }
        ev.cabinY.push(r3(top));
        ev.doors.push([0, 0]);
      }
    }
    if (process.env.GP_FALL) {
      // Report the first marbles that go through the floor (well below any
      // track within 20 units of where they were), with their last second.
      bodies.forEach((b, i) => {
        if (fellReported.has(i)) return;
        const m = frames[f][i];
        let floor = Infinity;
        for (let k = Math.max(0, idx[i] - 40); k <= Math.min(samples.length - 1, idx[i] + 40); k++) floor = Math.min(floor, samples[k].p[1]);
        if (m[1] > floor - 1.5) return;
        fellReported.add(i);
        console.log(`FELL ${MARBLES[i].abbr} at frame ${f} (${(f / FPS).toFixed(2)}s) u=${m[7].toFixed(2)} y=${m[1].toFixed(2)} floor=${floor.toFixed(2)}`);
        const win = +(process.env.GP_FALLWIN ?? 1); // seconds of history to print
        for (let g = Math.max(0, f - FPS * win); g <= f; g += 3 * win) {
          const q = frames[g][i];
          // True nearest sample (not the progress index, which lags in the air).
          let best = 0;
          let bd = Infinity;
          for (let k = 0; k < samples.length; k++) {
            const sp = samples[k].p;
            const dd = (sp[0] - q[0]) ** 2 + (sp[1] - q[1]) ** 2 + (sp[2] - q[2]) ** 2;
            if (dd < bd) { bd = dd; best = k; }
          }
          const sq = samples[best];
          const rel = [q[0] - sq.p[0], q[1] - sq.p[1], q[2] - sq.p[2]];
          const lat = rel[0] * sq.r[0] + rel[1] * sq.r[1] + rel[2] * sq.r[2];
          const upq = rel[0] * sq.n[0] + rel[1] * sq.n[1] + rel[2] * sq.n[2] - R;
          const prev = frames[Math.max(0, g - 3)][i];
          const v = (Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]) * FPS) / 3;
          const near = frames[g].map((o, j) => (j === i ? 99 : Math.hypot(o[0] - q[0], o[1] - q[1], o[2] - q[2]))).reduce((x, y) => Math.min(x, y));
          const cl = cleats.map((c) => { const pose = liftCleatPose(c.lift, c.k, g / FPS, course.frameAt); return pose.visible ? Math.hypot(pose.pos[0] - q[0], pose.pos[1] - q[1], pose.pos[2] - q[2]) : 99; }).reduce((x, y) => Math.min(x, y), 99);
          console.log(`  ${((g - f) / FPS).toFixed(2)}s nearestU=${sq.u.toFixed(1)} lat=${lat.toFixed(2)} up=${upq.toFixed(2)} v=${v.toFixed(1)} nearestMarble=${near.toFixed(2)} nearestCleat=${cl.toFixed(2)}`);
        }
      });
    }
    // The race is over once the top ten (or everyone) are home or out; the rest are classified where they are.
    if (allDone === null && finishFrame.filter((x, i) => x !== null || dqFrame[i] !== null).length >= Math.min(MARBLES.length, 10)) allDone = f;
    // Then up to 20 s more for the rest to come home (the last cabin-load), or until they all have.
    if (allDone !== null && (f - allDone >= 20 * FPS || finishFrame.every((x, i) => x !== null || dqFrame[i] !== null))) break;

    // Regroup gates: count who has reached the bar; open on quorum or timeout.
    // Machines with per-frame logic (the regroup gates count arrivals and open).
    for (const m of Object.values(machines)) m.frame?.(f, { frames, finishFrame, dqFrame, uLocal, nMarbles: MARBLES.length });

    for (let s = 0; s < SUBSTEPS; s++) {
      const t = (step + 1) * DT;
      gateBody.setNextKinematicRotation(gateRotation(t));
      const st = stairStop === null ? t : Math.min(t, stairStop);
      for (const lift of lifts)
        lift.plates.forEach((body, k) => {
          const [x, y, z] = stairLocal(lift.EV, lift.loop, k, st);
          const p = lift.at(x, y, z);
          body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
        });
      for (const m of Object.values(machines)) m.kinematics?.(t);
      for (const c of cleats) {
        const pose = liftCleatPose(c.lift, c.k, t, course.frameAt);
        c.body.setNextKinematicTranslation({ x: pose.pos[0], y: pose.pos[1], z: pose.pos[2] });
        c.body.setNextKinematicRotation(rot(pose.quat));
      }
      // Fans: a lateral force on every marble in their stretch. Boosters: a forward
      // force along the track, up to their target speed.
      if (obstacles.fans.length || obstacles.boosters.length || obstacles.vortices.length) {
        const mass = bodies[0].mass();
        bodies.forEach((b, i) => {
          b.resetForces(true);
          if (finishFrame[i] !== null || dqFrame[i] !== null) return;
          const u = uLocal(frames[f][i][7]);
          for (const fan of obstacles.fans) {
            if (u < fan.u0 || u > fan.u1) continue;
            const g = fan.accel * fanGust(fan, t) * mass;
            b.addForce({ x: fan.dir[0] * g, y: 0, z: fan.dir[2] * g }, true);
          }
          // The vortex's current: inside the bowl every marble is pushed round (counter to the
          // entry's sense) up to just under the orbit speed sqrt(g·k/r), so all of them circle and
          // spiral down instead of sliding straight into the hole (most made a fifth of a turn).
          for (const vx of obstacles.vortices) {
            const p = b.translation();
            const rx = p.x - vx.center[0];
            const rz = p.z - vx.center[2];
            const r = Math.hypot(rx, rz);
            if (r > vx.radius || r < vx.hole * 1.15 || p.y > vx.center[1] + 0.6 || p.y < vx.center[1] - vx.depth - 0.2) continue;
            const tx = rz / r;
            const tz = -rx / r;
            const v = b.linvel();
            const vt = v.x * tx + v.z * tz;
            const want = VORTEX_SWIRL.share * Math.sqrt((GRAVITY * vx.k) / r);
            if (vt >= want) continue;
            const g = VORTEX_SWIRL.accel * mass;
            b.addForce({ x: tx * g, y: 0, z: tz * g }, true);
          }
          for (const bo of obstacles.boosters) {
            if (u < bo.u0 || u > bo.u1) continue;
            const tg = course.frameAt(u).t;
            const v = b.linvel();
            if (v.x * tg[0] + v.y * tg[1] + v.z * tg[2] >= bo.target) continue;
            const g = bo.accel * mass;
            b.addForce({ x: tg[0] * g, y: tg[1] * g, z: tg[2] * g }, true);
          }
        });
      }
      world.step();
      step++;
      bodies.forEach((b, i) => {
        const v = b.linvel();
        const pv = prevVel[i];
        prevVel[i] = v;
        if (!pv) return;
        const dv = Math.hypot(v.x - pv.x, v.y - pv.y + GRAVITY * DT, v.z - pv.z);
        if (dv > 1.0 && step - lastImpact[i] > 3) {
          lastImpact[i] = step;
          const p = b.translation();
          const glass = bodies.some((o, j) => {
            if (j === i) return false;
            const q = o.translation();
            return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < 2 * R + 0.08;
          });
          impacts.push({ t: step * DT, f: Math.floor(step / SUBSTEPS), i, strength: dv, glass });
        }
      });
    }
  }

  const lastFrame = frames.length - 1;
  // Finishers by time, then those still rolling by progress, then the disqualified (first out, last).
  const rankKey = (i, f) => {
    if (finishFrame[i] !== null && finishFrame[i] <= f) return [0, finishFrame[i]];
    if (dqFrame[i] !== null && dqFrame[i] <= f) return [2, -dqFrame[i]];
    return [1, -frames[Math.min(f, lastFrame)][i][7]];
  };
  const rankAt = (f) =>
    MARBLES.map((_, i) => i).sort((a, b) => {
      const ka = rankKey(a, f);
      const kb = rankKey(b, f);
      return ka[0] - kb[0] || ka[1] - kb[1];
    });
  const order = rankAt(lastFrame);
  const winner = order[0];
  const winnerFrame = finishFrame[winner] ?? lastFrame;
  // Unfinished marbles are classified where they are when the top ten are home;
  // a DNF is one that is actually stuck (no progress over the last three seconds).
  // (Only when the race ran out of time: once the top ten are home, a marble waiting at a gate is merely classified.)
  const stuck = (i) => allDone === null && finishFrame[i] === null && dqFrame[i] === null && frames[lastFrame][i][7] - frames[Math.max(0, lastFrame - 3 * FPS)][i][7] < 2;
  const dnf = MARBLES.filter((_, i) => stuck(i)).map((m) => m.name);
  const classified = MARBLES.filter((_, i) => finishFrame[i] === null && dqFrame[i] === null && !stuck(i)).length;
  const dqNames = MARBLES.filter((_, i) => dqFrame[i] !== null).map((m) => m.abbr);
  if (process.env.GP_DNF)
    MARBLES.forEach((m, i) => {
      if (!stuck(i)) return;
      const q = frames[lastFrame][i];
      const z = course.features.find((f) => q[7] >= f.u - f.span[0] && q[7] <= f.u + f.span[1]);
      console.log(`  DNF ${m.abbr}: u=${q[7].toFixed(1)} y=${q[1].toFixed(2)} ${z ? `${z.type}@${z.u}` : "open track"}`);
    });
  const margin = finishFrame[order[1]] !== null ? (finishFrame[order[1]] - winnerFrame) / FPS : null;
  const secs = (f) => ((f - raceStart) / FPS).toFixed(2);

  const summary = `${round.id} seed ${seed}: L=${L.toFixed(0)} race ${secs(winnerFrame)}s, ${MARBLES[winner].name} by ${
    margin === null ? "-" : margin.toFixed(2)
  }s${dnf.length ? `, DNF ${dnf.join(" ")}` : ""}${dqNames.length ? `, DQ ${dqNames.join(" ")}` : ""}${classified ? `, ${classified} classified` : ""}`;
  if (process.env.GP_WATCH) {
    const i = MARBLES.findIndex((m) => m.abbr === process.env.GP_WATCH);
    for (let f = raceStart; f < Math.min(lastFrame, raceStart + 40 * FPS); f += FPS / 2) {
      const a = frames[f][i];
      const b = frames[Math.max(0, f - FPS / 2)][i];
      const near = frames[f]
        .map((o, j) => (j === i ? Infinity : Math.hypot(o[0] - a[0], o[1] - a[1], o[2] - a[2])))
        .reduce((x, y) => Math.min(x, y));
      const sp = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 2;
      console.log(`f=${f} u=${a[7].toFixed(1)} speed=${sp.toFixed(2)} nearest=${near.toFixed(2)} y=${a[1].toFixed(2)}`);
      if (a[7] > 40) break;
    }
  }
  if (process.env.GP_DEBUG) {
    const at = [raceStart, raceStart + 5 * FPS, raceStart + 10 * FPS, raceStart + 20 * FPS, lastFrame];
    MARBLES.forEach((m, i) => {
      const fr = frames[lastFrame][i];
      const s = samples[idx[i]];
      const off = Math.hypot(fr[0] - s.p[0], fr[1] - s.p[1], fr[2] - s.p[2]);
      console.log(
        m.abbr,
        at.map((f) => frames[Math.min(f, lastFrame)][i][7].toFixed(0).padStart(4)).join(" "),
        `| y=${fr[1].toFixed(1)} off-centre=${off.toFixed(2)} trackY=${s.p[1].toFixed(1)}`,
      );
    });
  }
  if (process.env.GP_PACE) {
    // Time the winner takes per 20-unit stretch, to spot slow sections.
    const out = [];
    for (let u0 = 0; u0 < L; u0 += 20) {
      const fa = frames.findIndex((fr) => fr[winner][7] >= u0);
      const fb = frames.findIndex((fr) => fr[winner][7] >= u0 + 20);
      if (fa >= 0 && fb >= 0) out.push(`${u0}:${((fb - fa) / FPS).toFixed(1)}`);
    }
    console.log(out.join(" "));
  }
  // When the leader reaches each machine (seconds of sim time), for syncing.
  const arrivals = {};
  for (const f of course.features) {
    if (f.type !== "hammer" && f.type !== "spinner" && f.type !== "pusher") continue;
    const target = f.type === "spinner" ? f.u : f.u + 1;
    const fr = frames.findIndex((fr) => fr.some((m) => m[7] >= target));
    if (fr >= 0) arrivals[f.u] = fr / FPS;
  }
  if (quiet) return { summary, ok: dnf.length === 0, margin, arrivals, dqGaps };

  const sec = (x) => Math.round(x * FPS);
  // --- Highlights ---------------------------------------------------------------------
  // The biggest hits at obstacles become slow-motion replays, cut into the race
  // just after they happen (like a TV director's instant replay).
  const zoneOf = (u) => course.features.find((f) => u >= f.u - f.span[0] && u <= f.u + f.span[1]);
  const highlights = [];
  const candidates = impacts
    .filter((im) => im.f > raceStart + sec(2.5) && im.f < winnerFrame - sec(5) && im.strength >= 3)
    .map((im) => ({ ...im, zone: zoneOf(uLocal(frames[Math.min(im.f, lastFrame)][im.i][7])) }))
    .filter((im) => im.zone && im.zone.type !== "lift" && im.zone.type !== "bumps")
    .sort((a, b) => b.strength - a.strength);
  // A disqualification is always replayed.
  for (const e of dqEvents) {
    if (e.frame <= raceStart + sec(2.5) || e.frame >= winnerFrame - sec(5)) continue;
    highlights.push({ f: e.frame, marble: e.a, strength: 99, label: `DRAINED · ${MARBLES[e.a].name.toUpperCase()}`, feature: e.feature, dq: true });
  }
  for (const im of candidates) {
    if (highlights.length >= HIGHLIGHTS.count) break;
    if (highlights.some((h) => Math.abs(h.f - im.f) < sec(HIGHLIGHTS.minGap))) continue;
    highlights.push({ f: im.f, marble: im.i, strength: r3(im.strength), label: `${im.zone.label} · ${MARBLES[im.i].name.toUpperCase()}`, feature: im.zone.type });
  }
  highlights.sort((a, b) => a.f - b.f);
  for (const h of highlights) {
    h.from = Math.max(raceStart, h.f - sec(HIGHLIGHTS.before));
    // A drained marble drops down the shaft in 0.7 s: its replay ends just after that.
    h.to = Math.min(lastFrame, h.f + sec(h.dq ? 0.85 : HIGHLIGHTS.after));
    h.speed = HIGHLIGHTS.speed;
    h.frames = Math.ceil((h.to - h.from) / h.speed);
    h.insert = Math.min(lastFrame, h.f + sec(HIGHLIGHTS.after) + sec(0.2)); // live frame after which the replay plays
  }

  // --- TV director -------------------------------------------------------------------
  // The director treats a disqualified marble like a finished one: out of the pack from then on.
  const doneFrame = finishFrame.map((x, i) => x ?? dqFrame[i]);
  // Rides merged into "cycles" (a run of riders in one bay), the shape the director and the overlay read.
  const ridesToCycles = (rides) => {
    const out = [];
    for (const r of [...rides].sort((a, b) => a.start - b.start)) {
      const last = out[out.length - 1];
      // A group: riders who boarded within 2 s of the group's first (a caption, not the whole field).
      if (last && r.start <= last.closeAt + sec(2)) {
        last.riders.push(r.marble);
        last.openAt = Math.max(last.openAt, r.top);
        last.closeTopAt = last.openAt + sec(0.4);
      } else out.push({ riders: [r.marble], closeAt: r.start, riseAt: r.start, topAt: r.top, openAt: r.top, closeTopAt: r.top + sec(0.4) });
    }
    return out;
  };
  const elevatorsData = lifts.map((l) => ({ ...l.EV, stair: true, stopAt: stairStop === null ? null : r3(stairStop), cycles: ridesToCycles(l.ev.rides), cabinY: l.ev.cabinY, doors: l.ev.doors }));
  const director = directRace({ world, course, frames, finishFrame: doneFrame, raceStart, winnerFrame, lastFrame, rand, highlights, elevators: elevatorsData });
  // Fail the bake, not a render an hour later: a NaN camera becomes null in JSON.
  const badCam = director.cams.findIndex((c) => c.slice(0, 7).some((x) => !Number.isFinite(x)));
  if (badCam >= 0) throw new Error(`${round.id}: camera is not finite at frame ${badCam} (${director.cams[badCam][7]})`);

  // --- Overtakes ---------------------------------------------------------------------
  const events = dqEvents.map(({ zone, ...e }) => e);
  // Best lap: every completed descent that beats the fastest so far.
  {
    let best = Infinity;
    for (const l of [...laps].sort((x, y) => x.end - y.end)) {
      const n = l.end - l.start;
      if (n >= best) continue;
      best = n;
      events.push({ frame: l.end, kind: "bestlap", a: l.marble, b: l.marble, pos: 0, lap: l.lap, frames: n });
    }
  }
  const HOLD = Math.round(0.8 * FPS);
  let lastEvent = -999;
  for (let f = raceStart + 3 * FPS; f + HOLD <= winnerFrame; f++) {
    const before = rankAt(f - 1);
    const now = rankAt(f);
    for (let pos = 0; pos < 5; pos++) {
      const a = now[pos];
      const b = before[pos];
      if (a === b) continue;
      if (dqFrame[b] !== null && dqFrame[b] <= f) break; // not an overtake: b was pulled off
      // Only count it if a stays ahead of b for HOLD frames.
      let holds = true;
      for (let k = 1; k <= HOLD; k++) {
        const later = rankAt(f + k);
        if (later.indexOf(a) > later.indexOf(b)) holds = false;
      }
      if (holds && now.indexOf(b) > pos && f - lastEvent > 3 * FPS) {
        events.push({ frame: f, kind: "overtake", a, b, pos: pos + 1 });
        lastEvent = f;
      }
      break;
    }
  }
  events.sort((a, b) => a.frame - b.frame);

  // --- Timeline ----------------------------------------------------------------------
  // The race part of the video is a list of segments: live stretches of the
  // simulation, with slow-motion highlight replays cut in between.
  const segments = [];
  let liveFrom = 0;
  let at = 0;
  // (Highlights no longer interrupt the race: they replay in a split screen beside it.)
  segments.push({ kind: "live", at, from: liveFrom, to: frames.length });
  at += frames.length - liveFrom;
  const replayFrom = Math.max(raceStart, winnerFrame - Math.round(1.5 * FPS));
  const replayTo = Math.min(lastFrame, winnerFrame + Math.round(0.8 * FPS));
  const timeline = {
    lights: LIGHT_TIMES.map((t) => Math.round(t * FPS)),
    raceStart,
    raceFrames: at,
    segments,
    highlights,
    replay: {
      at,
      from: replayFrom,
      to: replayTo,
      speed: REPLAY_SPEED,
      frames: Math.ceil((replayTo - replayFrom) / REPLAY_SPEED),
    },
    resultsFrames: Math.round(4.5 * FPS),
    standingsFrames: Math.round(5 * FPS),
    constructorsFrames: Math.round(4.5 * FPS),
  };
  timeline.results = { at: timeline.replay.at + timeline.replay.frames };
  timeline.standings = { at: timeline.results.at + timeline.resultsFrames };
  timeline.constructors = { at: timeline.standings.at + timeline.standingsFrames };
  timeline.total = timeline.constructors.at + timeline.constructorsFrames;

  const info = {
    gp: round.gp,
    title: round.title,
    country: round.country,
    flag: round.flag,
    location: course.props.Location,
    circuit: course.props.Name,
    realLength: course.props.length,
    length: r3(L),
    laps: LAPS,
    trackEnd: course.END,
    finish: course.uFinish,
    drop: r3(course.H),
    scale: round.outline ? 1 : (round.scale ?? SCALE),
  };

  const data = {
    id: round.id,
    seed,
    fps: FPS,
    info,
    marbleRadius: R,
    timeline,
    marbles: MARBLES.map((m, i) => ({ ...m, grid: gridSlot[i] + 1, finishFrame: finishFrame[i], dqFrame: dqFrame[i] })),
    grid: GRID,
    order,
    samples,
    outline: course.loop.filter((_, k) => k % 2 === 0).map(([x, z]) => [r3(x), r3(z)]),
    gate: { hinge: arr(hinge), quat: [gateQuat.x, gateQuat.y, gateQuat.z, gateQuat.w].map(r3), height: r3(GATE_HEIGHT), lightsOut: r3(lightsOut), ...GATE },
    frames,
    cams: director.cams,
    shots: director.shots,
    replayCam: director.replayCam,
    highlightCams: director.highlightCams,
    splits: director.splits,
    heli: director.heli,
    events,
    features: course.features,
    obstacles: obstacles.statics,
    spinners: obstacles.spinners,
    turntables: obstacles.turntables,
    pushers: obstacles.pushers,
    rollers: obstacles.rollers,
    fans: obstacles.fans,
    boosters: obstacles.boosters,
    switches: obstacles.switches,
    regroups: machines.regroup.export(),
    elevators: elevatorsData,
    laps,
    vortices: obstacles.vortices,
    swings: obstacles.swings,
    lifts: obstacles.lifts,
  };
  return { summary, ok: dnf.length === 0, margin, data, impacts, info };
}

// --- Director -----------------------------------------------------------------------
// One camera per frame, in the style of studio marble-race channels: cameras
// that travel with the marbles (behind the pack, ahead of the leader looking
// back, alongside, overhead, orbiting), shots that wait at each obstacle for
// the pack to arrive, the odd onboard, and the finish-line camera for the win.
// Every shot is smoothed with a zero-lag Gaussian (we can look ahead: it's
// offline), and every candidate shot is raycast against the track first so
// another part of the circuit never blocks the view.
function directRace({ world, course, frames, finishFrame, raceStart, winnerFrame, lastFrame, rand, highlights = [], elevators = [] }) {
  const { L, samples, frameAt, features } = course;
  const N = MARBLES.length;
  const sec = (x) => Math.round(x * FPS);
  const posOf = (f, i) => v3(frames[Math.min(f, lastFrame)][i]);
  const uOf = (f, i) => frames[Math.min(f, lastFrame)][i][7]; // total progress: lap * L + u
  const uLocal = (P) => ((((P + GRID_LENGTH) % L) + L) % L) - GRID_LENGTH;
  const uLoc = (f, i) => uLocal(uOf(f, i));
  const END = course.END;
  const finished = (i, f) => finishFrame[i] !== null && finishFrame[i] <= f;
  const W2 = TRACK.width / 2;

  // Pack focus per frame: leaders still racing, weighted toward P1.
  const rawFocus = [];
  const rawU = [];
  const spread = [];
  const leader = [];
  let sticky = null;
  for (let f = 0; f <= lastFrame; f++) {
    const racing = [...Array(N).keys()]
      .filter((i) => !finished(i, f - LINGER))
      .sort((a, b) => uOf(f, b) - uOf(f, a));
    if (!racing.length) {
      leader.push(0);
      rawFocus.push(v3(pointOnTrack(frameAt(END - 1), 0, 0.3)));
      rawU.push(END - 1);
      spread.push(2);
      continue;
    }
    // The focus is the best battle, not necessarily the leader: the group
    // (within 6 units) with the most marbles, with a bonus for being at the
    // front, and a little loyalty to the group we were already following.
    // Marbles queuing for the lift or riding it are not a battle: on a short lap the queue was
    // always the biggest group, and the cameras stayed on it for minutes while the leaders raced on.
    const running = racing.filter((i) => uLoc(f, i) < END - 8 && uLoc(f, i) > -GRID_LENGTH + 0.5);
    const pool = running.length ? running : racing;
    let best = null;
    pool.forEach((head, rank) => {
      const members = pool.filter((i) => uOf(f, head) - uOf(f, i) >= 0 && uOf(f, head) - uOf(f, i) < 6);
      let score = members.length + (rank === 0 ? 1.2 : 0) - rank * 0.08;
      if (sticky !== null && members.includes(sticky)) score += 1.0;
      if (best === null || score > best.score) best = { head, members, score };
    });
    sticky = best.head;
    leader.push(best.head);
    const pack = best.members.slice(0, 3);
    const w = [0.55, 0.3, 0.15].slice(0, pack.length);
    const ws = w.reduce((a, b) => a + b, 0);
    const p = new Vector3();
    let u = 0;
    pack.forEach((i, k) => {
      p.addScaledVector(posOf(f, i), w[k] / ws);
      u += (uLoc(f, i) * w[k]) / ws;
    });
    rawFocus.push(p);
    rawU.push(u);
    spread.push(Math.max(...pack.map((i) => posOf(f, i).distanceTo(p))));
  }
  const gauss = (values, sigma, a = 0, b = values.length) => {
    const isVec = values[a] instanceof Vector3;
    const out = values.slice();
    const w = Math.ceil(sigma * 3);
    const kern = Array.from({ length: 2 * w + 1 }, (_, j) => Math.exp(-((j - w) ** 2) / (2 * sigma * sigma)));
    for (let f = a; f < b; f++) {
      let ws = 0;
      const acc = isVec ? new Vector3() : [0];
      for (let j = -w; j <= w; j++) {
        const q = f + j;
        if (q < a || q >= b) continue;
        const k = kern[j + w];
        ws += k;
        if (isVec) acc.addScaledVector(values[q], k);
        else acc[0] += values[q] * k;
      }
      out[f] = isVec ? acc.multiplyScalar(1 / ws) : acc[0] / ws;
    }
    return out;
  };
  const focus = gauss(rawFocus, sec(0.35));
  const focusU = gauss(rawU, sec(0.35));

  // The venue buildings (grandstands, pits) aren't in the collider: the
  // director asks src/gp/venue.js where they stand, so no camera sits inside
  // one or looks through one.
  const venue = venueLayout(samples, L);
  // The buildings alone (the lift camera looks into its own tower, so it checks only these).
  const venueGround = { ...venue, buildings: [...venue.buildings] };
  // The lift towers count as buildings too: no camera inside the lattice, none looking through it.
  for (const e of elevators) {
    const fwd = v3(e.fwd);
    venue.buildings.push({
      base: [e.center[0], e.center[1] - 2, e.center[2]],
      yaw: Math.atan2(-fwd.z, fwd.x),
      box: { x: [-e.length / 2 - 1.0, e.length / 2 + 1.0], y: [0, e.lift + 7], z: [-e.width / 2 - 1.0, e.width / 2 + 1.0] },
    });
  }
  const clear = (from, to) => {
    const dir = to.clone().sub(from);
    const d = dir.length();
    if (d < 0.5) return true;
    if (venueBlocks(venue, [from.x, from.y, from.z], [to.x, to.y, to.z])) return false;
    dir.normalize();
    const hit = world.castRay(new RAPIER.Ray(from, dir), d, true, undefined, QUERY_TRACK_ONLY);
    return !hit || hit.timeOfImpact > d - 0.8;
  };
  const trackPts = samples.map((s) => v3(s.p));
  // Room around a camera: distance to the nearest other part of the track and to the venue buildings.
  const roomAt = (pos, uc) => {
    let min = venueClearance(venue, [pos.x, pos.y, pos.z]);
    samples.forEach((s, k) => {
      if (Math.abs(s.u - uc) < 6) return;
      min = Math.min(min, trackPts[k].distanceTo(pos));
    });
    return min;
  };
  const upW = new Vector3(0, 1, 0);
  const flatRight = (fr) => new Vector3(fr.r[0], 0, fr.r[2]).normalize();
  const flatFwd = (fr) => new Vector3(fr.t[0], 0, fr.t[2]).normalize();

  // Field of view for a fixed camera: zoom in until the leader is at least
  // LEADER_MIN of the frame height, but never so far that the pack's spread
  // falls out of the frame.
  const LEADER_MIN = 0.07; // was 0.14: too tight, the viewer lost the race around the marble
  const fovFor = (pos, f) => {
    const d = Math.max(0.5, pos.distanceTo(posOf(f, leader[f])));
    const forLeader = (2 * Math.atan(R / (LEADER_MIN * d)) * 180) / Math.PI;
    const forPack = (2 * Math.atan((spread[f] + 1.6) / pos.distanceTo(focus[f])) * 180) / Math.PI;
    return Math.min(55, Math.max(32, Math.max(forPack, Math.min(forLeader, 55))));
  };

  // Shot recipes: (frame) → { pos, target, fov }. Built from the smoothed focus.
  const liftSpots = {};
  const recipes = {
    chase: (f, sh) => {
      // Set back and up: the pack and the track ahead of it in one frame (closer where the circuit is packed: `near`).
      const nr = sh?.near;
      const fr = frameAt(focusU[f] - (nr ? 4.2 : 6.5));
      return { pos: v3(pointInFrame(fr, 0, nr ? 1.8 : 2.6)).add(upW.clone().multiplyScalar(nr ? 0.9 : 1.6)), target: focus[f].clone().addScaledVector(flatFwd(frameAt(focusU[f])), 3), fov: 54 };
    },
    lead: (f, sh) => {
      const nr = sh?.near;
      const u = uLoc(f, leader[f]) + (nr ? 3.6 : 5.5);
      const fr = frameAt(Math.min(u, END));
      return { pos: v3(pointInFrame(fr, 0, nr ? 1.5 : 2.2)).add(upW.clone().multiplyScalar(nr ? 0.6 : 1.2)), target: focus[f], fov: 50 };
    },
    side: (f, sh) => {
      const fr = frameAt(focusU[f] + 0.6);
      // Close beside the wall, just high enough to look over it.
      const pos = v3(fr.p).addScaledVector(flatRight(fr), sh.side * (W2 + (sh.near ? 2.0 : 3.6))).add(upW.clone().multiplyScalar(sh.near ? 4.0 : 5.5));
      return { pos, target: focus[f], fov: fovFor(pos, f) };
    },
    top: (f, sh) => {
      const fr = frameAt(focusU[f]);
      return { pos: focus[f].clone().add(upW.clone().multiplyScalar(sh?.near ? 7 : 10)).addScaledVector(flatFwd(fr), sh?.near ? -3 : -4), target: focus[f], fov: 48 };
    },
    orbit: (f, sh) => {
      const a = sh.phase + ((f - sh.start) / FPS) * 0.45 * sh.side;
      const rr = sh.near ? 5.5 : 8;
      return { pos: focus[f].clone().add(new Vector3(Math.sin(a) * rr, sh.near ? 3.2 : 4.5, Math.cos(a) * rr)), target: focus[f], fov: 46 };
    },
    // The race in context: high behind the pack, looking down the track ahead (the next obstacle, the chasers).
    wide: (f, sh) => {
      const fr = frameAt(focusU[f] - (sh?.near ? 7 : 11));
      return { pos: v3(fr.p).add(upW.clone().multiplyScalar(sh?.near ? 8 : 11)), target: v3(frameAt(Math.min(focusU[f] + 7, END)).p), fov: 52 };
    },
    feature: (f, sh) => ({ pos: sh.cam, target: focus[f], fov: fovFor(sh.cam, f) }),
    // Wide and steady at the line: zooming in on whoever leads made a mess of the last metres.
    finish: (f, sh) => ({ pos: sh.cam, target: focus[f], fov: Math.max(40, Math.min(50, fovFor(sh.cam, f))) }),
    // The run into the lift: one fixed wide camera over the bays, aimed between the bays and the pack.
    approach: (f, sh) => ({ pos: sh.cam, target: v3(sh.aim).lerp(focus[f], 0.35), fov: 50 }),
    elevator: (f, sh) => {
      // Beside the tower, riding up with whichever cabin is moving (the higher one if both are).
      const at = (e, fr) => e.cabinY[Math.max(0, Math.min(fr, e.cabinY.length - 1))] ?? 0;
      let elevator = elevators[sh.cabin ?? 0];
      let bestScore = -Infinity;
      for (const e of sh.fixed ? [] : elevators) {
        const y = at(e, f);
        const dy = at(e, f + 2) - at(e, f - 2);
        // Rising first, then one unloading at the top; never the empty cabin coming back down.
        const score = (dy > 0.02 ? 3 : dy < -0.02 ? -3 : 0) + y / Math.max(1, e.lift);
        if (score > bestScore) {
          bestScore = score;
          elevator = e;
        }
      }
      const c = v3(elevator.center).add(new Vector3(0, elevator.cabinY[Math.min(f, elevator.cabinY.length - 1)] ?? 0, 0));
      const fwd = v3(elevator.fwd);
      const right = new Vector3(-fwd.z, 0, fwd.x);
      // The camera stays on one side of the tower for the whole shot (the side of the cabin the shot began with)
      // and only pans and rises to the cabin that is moving: switching sides mid-shot dragged it through the tower.
      const home = elevators[sh.cabin ?? 0];
      const side = home.lat < 0 ? -1 : 1;
      const towerCentre = elevators.reduce((acc, e) => acc.add(v3(e.center)), new Vector3()).multiplyScalar(1 / elevators.length);
      const halfSpan = Math.max(...elevators.map((e) => Math.abs(e.lat) + e.width / 2));
      // Square to the tower's outer face, midway between its fore and aft columns, so no column blocks the cabin.
      // Where along the tower to stand: square to it unless a building would block the view
      // of a cabin at the bottom (a pit building beside the tower filled half the frame);
      // chosen once per side so it never jumps during a shot.
      const key = `${side}`;
      if (!liftSpots[key]) {
        const bottom = v3(home.center).add(new Vector3(0, 0.7, 0));
        const spots = [];
        for (const rise of [2.3, 4.5, 7, 9]) for (const out of [8.5, 7.0, 5.0, 3.6]) for (const along of [0, 4, -4, 8, -8]) spots.push({ rise, out, along });
        const at = ({ rise, out, along }) => new Vector3(towerCentre.x, bottom.y + rise, towerCentre.z).addScaledVector(right, side * (halfSpan + out)).addScaledVector(fwd, along);
        liftSpots[key] =
          spots.find((sp) => {
            const p = at(sp);
            if (venueClearance(venueGround, [p.x, p.y, p.z]) < 0.8) return false;
            // The cabin and the frame below it (down to 1.4 under its floor) must be in clear view.
            return [0, -0.6, -1.4].every((dy) => !venueBlocks(venueGround, [p.x, p.y, p.z], [bottom.x, bottom.y + dy, bottom.z]));
          }) ?? spots[0];
      }
      const spot = liftSpots[key];
      const pos = new Vector3(towerCentre.x, c.y + 0.7 + spot.rise, towerCentre.z).addScaledVector(right, side * (halfSpan + spot.out)).addScaledVector(fwd, spot.along);
      const target = c.clone().add(new Vector3(0, 0.7, 0));
      return { pos, target, fov: 44 };
    },
    onboard: (f, sh) => {
      const i = sh.marble;
      const u = uLoc(f, i);
      const p = posOf(f, i);
      const fr = frameAt(u);
      const lat = v3(fr.r).dot(p.clone().sub(v3(fr.p)));
      return {
        pos: v3(pointInFrame(frameAt(u - 2.2), lat * 0.7, 0.95 + surfaceY(lat))),
        target: v3(pointInFrame(frameAt(u + 3), lat * 0.4, 0.3 + surfaceY(lat * 0.4))),
        fov: 64,
      };
    },
  };
  const surfaceY = (lat) => surfaceHeightAt(lat);
  // A shot is usable only if, at most moments in it, the leading marble is in
  // the frame (not at the very edge), not hidden behind the trough's own wall
  // or another part of the circuit, and big enough to read.
  const lens = new PerspectiveCamera(40, 16 / 9, 0.05, 1500);
  const lvWhy = {};
  const leaderVisible = (c, f) => {
    const i = leader[f];
    const p = posOf(f, i);
    lens.fov = c.fov;
    lens.updateProjectionMatrix();
    lens.position.copy(c.pos);
    lens.lookAt(c.target);
    lens.updateMatrixWorld();
    const ndc = p.clone().project(lens);
    const tally = (k) => (lvWhy[k] = (lvWhy[k] ?? 0) + 1);
    if (ndc.z >= 1 || Math.abs(ndc.x) > 0.8 || Math.abs(ndc.y) > 0.8) return tally(ndc.z >= 1 ? "behind" : "edge"), false;
    const d = c.pos.distanceTo(p);
    const apparent = (2 * R) / (2 * d * Math.tan((c.fov * Math.PI) / 360)); // fraction of frame height
    if (apparent < 0.025) return tally("small"), false;
    const ok = clear(c.pos, p);
    if (!ok) tally("blocked");
    return ok;
  };
  const why = {};
  const usable = (kind, sh, f0, f1) => {
    let ok = 0;
    const n = 5;
    for (let k = 0; k < n; k++) {
      const f = Math.min(lastFrame, Math.round(f0 + ((f1 - 1 - f0) * k) / (n - 1)));
      const c = recipes[kind](f, sh);
      if (roomAt(c.pos, focusU[f]) < 1.6) {
        why[kind + ":room"] = (why[kind + ":room"] ?? 0) + 1;
        return false;
      }
      if (leaderVisible(c, f)) ok++;
    }
    if (ok < 4) why[kind + ":view"] = (why[kind + ":view"] ?? 0) + 1;
    return ok >= 4;
  };
  if (process.env.GP_SHOTS) process.on("exit", () => console.log("rejected shots:", JSON.stringify(why), "leader not visible:", JSON.stringify(lvWhy)));

  // One locked camera per obstacle, chosen from candidates on both sides,
  // upstream and downstream, low and high: the one that sees the leader best
  // over the frames the pack actually spends there (we know them all).
  // Every obstacle, every lap: the window is each pass of the focus through its zone.
  const windows = [];
  for (const f of features) {
    if (f.type === "elevator") continue;
    const zoneA = f.u - f.span[0];
    const zoneB = f.u + f.span[1];
    let from = 0;
    for (let pass = 0; pass < LAPS; pass++) {
      let start = -1;
      for (let fr = from; fr <= lastFrame; fr++) {
        if (focusU[fr] >= zoneA - 2 && focusU[fr] < zoneA + 2) {
          start = fr;
          break;
        }
      }
      if (start < 0) break;
      let end = start + sec(1.5);
      while (end < start + sec(6.5) && end <= lastFrame && focusU[end] < zoneB + 1 && focusU[end] >= zoneA - 3) end++;
      windows.push({ f, start, end });
      from = end + sec(8);
    }
  }
  const featureCams = windows
    .map(({ f, start, end }) => {
      const zoneA = f.u - f.span[0];
      const zoneB = f.u + f.span[1];
      const mid = (zoneA + zoneB) / 2;
      const cands = [];
      for (const side of [1, -1])
        for (const du of [-4, 4])
          for (const [lat, lift] of [[W2 + 2.2, 3.0], [W2 + 3.2, 5.0], [W2 + 1.4, 2.4]]) {
            const fr = frameAt(mid + du);
            cands.push(v3(fr.p).addScaledVector(flatRight(fr), side * lat).add(new Vector3(0, lift, 0)));
          }
      let best = null;
      for (const pos of cands) {
        if (roomAt(pos, mid) < 1.6) continue;
        let score = 0;
        const n = 8;
        for (let k = 0; k < n; k++) {
          const fr = Math.min(lastFrame, Math.round(start + ((end - 1 - start) * k) / (n - 1)));
          if (leaderVisible({ pos, target: focus[fr], fov: fovFor(pos, fr) }, fr)) score++;
        }
        if (score >= 6 && (best === null || score > best.score)) best = { pos, score };
      }
      if (process.env.GP_SHOTS) console.log(`  cam ${f.type}@${f.u.toFixed(0)}: window ${start}-${end}, best score ${best ? best.score : "none"}/8`);
      return best ? { ...f, cam: best.pos, start, end: Math.min(end, lastFrame + 1), used: false } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  // The lift: a crane shot beside the tower for every ride.
  const elevatorShots = elevators
    .flatMap((e, k) =>
      e.cycles
        .filter((c) => c.riseAt !== undefined && c.openAt !== undefined)
        // From just before the doors close to just after the riders have rolled out (the top door closing again).
        .map((c) => ({ kind: "elevator", cabin: k, start: Math.max(0, c.closeAt - sec(0.6)), end: Math.min(lastFrame + 1, c.closeTopAt !== undefined ? c.closeTopAt + sec(0.4) : c.openAt + sec(2.4)), used: false })),
    )
    .sort((a, b) => a.start - b.start);
  const fs = frameAt(course.uFinish);
  const finishCam = v3(fs.p).addScaledVector(flatRight(fs), W2 + 3).add(new Vector3(0, 5.6, 0)).addScaledVector(flatFwd(fs), 2.5);
  const replayCam = v3(fs.p).addScaledVector(flatRight(fs), W2 + 0.9).add(new Vector3(0, 4.2, 0));
  // The approach to the lift: high and set back beside the funnel, on whichever side has room and a clear view.
  const approach = (() => {
    if (!course.END) return null;
    const at = frameAt(course.END - 12);
    const aim = v3(frameAt(course.END - 3).p).add(new Vector3(0, 1.2, 0));
    let best = null;
    for (const side of [1, -1])
      for (const [out, up, back] of [[W2 + 7, 7, 4], [W2 + 9, 9, 6], [W2 + 5, 6, 2]]) {
        const cam = v3(at.p).addScaledVector(flatRight(at), side * out).add(new Vector3(0, up, 0)).addScaledVector(flatFwd(at), -back);
        if (roomAt(cam, course.END - 12) < 1.5) continue;
        let score = 0;
        for (let u = course.END - 22; u <= course.END; u += 2) if (clear(cam, v3(frameAt(u).p).add(new Vector3(0, 0.4, 0)))) score++;
        if (best === null || score > best.score) best = { cam, score };
      }
    return best ? { cam: best.cam, aim } : null;
  })();
  // The finish line sits at the lift's door: from beside it the camera looked into the tower's
  // lattice. The wide approach camera sees the run-in, the line and the bays.
  if (approach) finishCam.copy(approach.cam);

  // Drone reveal of the whole circuit.
  const box = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
  for (const p of trackPts) {
    box.min.min(p);
    box.max.max(p);
  }
  const center = box.min.clone().add(box.max).multiplyScalar(0.5);
  const extent = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  const heli = { center: arr(center), extent: r3(extent) };

  // --- Shot list -------------------------------------------------------------------
  const shots = [];
  const REVEAL = sec(2);
  shots.push({ kind: "drone", start: 0, end: REVEAL });
  const gridEnd = raceStart + sec(2.0); // hold until the ten lanes have funnelled into the track
  shots.push({ kind: "grid", start: REVEAL, end: gridEnd });
  const cycle = ["wide", "chase", "side", "lead", "wide", "top", "orbit", "side", "chase", "wide", "onboard", "lead", "side", "orbit"];
  let ci = 0;
  let f = gridEnd;
  let finishUsed = false;
  const approachLaps = new Set();
  while (f <= lastFrame) {
    let sh = null;
    if (!finishUsed && winnerFrame - f <= sec(3.5)) {
      sh = { kind: "finish", cam: finishCam, start: f, end: Math.max(winnerFrame + sec(2), f + sec(2)) };
      finishUsed = true;
    } else if (finishUsed) {
      // After the win: follow the rest home, then hold on the finish.
      const allIn = finishFrame.every((x) => x !== null && x < f - LINGER);
      const nextU = uLoc(f, leader[f]);
      if (allIn) sh = { kind: "finish", cam: finishCam, start: f, end: lastFrame + 1 };
      else if (nextU > course.uFinish - 7 && uOf(f, leader[f]) > (LAPS - 1) * L) {
        // Someone is about to cross: the finish camera, until they have.
        let end = f + sec(1);
        while (end <= lastFrame && end < f + sec(4) && !finished(leader[f], end - LINGER)) end++;
        sh = { kind: "finish", cam: finishCam, start: f, end };
      } else {
        // Follow the rest home, with the same framing check as during the race.
        for (const kind of ["side", "chase", "lead", "top", "side"]) {
          const cand = { kind, side: rand() < 0.5 ? 1 : -1, phase: rand() * Math.PI * 2, start: f, end: f + sec(3) };
          if (usable(kind, cand, f, Math.min(cand.end, lastFrame + 1))) {
            sh = cand;
            break;
          }
        }
        sh ??= { kind: "top", start: f, end: f + sec(2.5) };
      }
      ci++;
    } else {
      // An obstacle coming up: its locked camera takes over at the planned moment.
      // (Up to 1.5 s early, so two obstacles close together both get their shot.)
      const es = elevatorShots.find((c) => !c.used && f >= c.start && f < c.end - sec(1));
      // The leader running into the lift bays: the wide approach camera until the lift's own shot.
      // Once per lap, following the real leader (P1): the director's focus can sit in the lift queue
      // for minutes, and the shot used to fire again and again (2 min of one view).
      let top = -1;
      for (let i = 0; i < N; i++) if (!finished(i, f) && (top < 0 || uOf(f, i) > uOf(f, top))) top = i;
      const lu = top >= 0 ? uLoc(f, top) : -1;
      const lap = top >= 0 ? Math.floor((uOf(f, top) + GRID_LENGTH) / L) : -1;
      if (!es && approach && top >= 0 && !approachLaps.has(lap) && lu > course.END - 22 && lu < course.END - 2) {
        approachLaps.add(lap);
        let end = f + sec(1.5);
        while (end < f + sec(4) && end <= lastFrame && uLoc(end, top) < course.END - 0.3 && uLoc(end, top) > course.END - 30) end++;
        if (!finishUsed && winnerFrame - sec(3.5) > f) end = Math.min(end, winnerFrame - sec(3.5));
        if (end > f + sec(0.8)) sh = { kind: "approach", cam: approach.cam, aim: arr(approach.aim), start: f, end: Math.min(end, lastFrame + 1) };
      }
      if (es && !sh) {
        es.used = true;
        sh = { kind: "elevator", cabin: es.cabin, label: "THE STAIRWAY", feature: "elevator", start: f, end: es.end };
        // A ride in the other cabin that starts during this shot is covered by it: the shot runs to the later top.
        for (const o of elevatorShots)
          if (!o.used && o.start < sh.end - sec(1)) {
            o.used = true;
            sh.end = Math.min(lastFrame + 1, Math.max(sh.end, o.end));
          }
      }
      // Calmer cutting: an obstacle's camera takes over only once the current shot has run ~3.5 s
      // (and only for the big obstacles: see CAM_FEATURES), so cuts never come every second or two.
      const settled = shots.length === 0 || f - shots[shots.length - 1].start >= sec(3.5);
      const fc = sh || !settled ? null : featureCams.find((c) => !c.used && CAM_FEATURES.includes(c.type) && f >= c.start - sec(1.5) && f < c.end - sec(1));
      if (fc) {
        fc.used = true;
        const nextRide = elevatorShots.find((c) => !c.used && c.start > f);
        sh = { kind: "feature", cam: fc.cam, label: fc.label, feature: fc.type, start: f, end: Math.max(f + sec(3), nextRide ? Math.min(fc.end, Math.max(f + sec(2.5), nextRide.start)) : fc.end) };
      }
      // Don't start a long shot that would cut into the next obstacle's or the lift's camera.
      const nextFc = featureCams.find((c) => !c.used && c.start > f);
      const nextEs = elevatorShots.find((c) => !c.used && c.start > f);
      const capAt = Math.min(nextFc ? Math.max(f + sec(3.5), nextFc.start - sec(0.2)) : Infinity, nextEs ? Math.max(f + sec(3), nextEs.start) : Infinity);
      for (let tries = 0; !sh && tries < cycle.length; tries++) {
        const kind = cycle[ci % cycle.length];
        ci++;
        const len = sec(kind === "onboard" ? 4.5 : kind === "top" ? 5 : 5.5 + rand() * 2.5);
        const cand = { kind, start: f, end: f + len, side: rand() < 0.5 ? 1 : -1, phase: rand() * Math.PI * 2 };
        if (kind === "onboard") {
          const ld = leader[f];
          const chaser = [...Array(N).keys()]
            .filter((i) => i !== ld && !finished(i, f))
            .sort((a, b) => uOf(f, b) - uOf(f, a))[0];
          cand.marble = chaser !== undefined && uOf(f, ld) - uOf(f, chaser) < 2.5 ? chaser : ld;
        }
        cand.end = Math.min(cand.end, capAt);
        if (usable(kind, cand, f, Math.min(cand.end, lastFrame + 1))) sh = cand;
        else if (kind !== "onboard") {
          // The circuit is packed here: the same shot, closer in.
          cand.near = true;
          if (usable(kind, cand, f, Math.min(cand.end, lastFrame + 1))) sh = cand;
        }
      }
      if (!sh) sh = { kind: "top", start: f, end: Math.min(f + sec(4), capAt) };
      // Don't run into the finish shot.
      if (!finishUsed) sh.end = Math.min(sh.end, Math.max(f + sec(2), winnerFrame - sec(3.5)));
    }
    sh.end = Math.min(Math.max(sh.end, f + 1), lastFrame + 1);
    shots.push(sh);
    f = sh.end;
  }

  // --- Frames ------------------------------------------------------------------------
  const pos = [];
  const target = [];
  const fov = [];
  const kind = [];
  const marble = [];
  const droneAt = (k) => {
    const a = -0.5 + k * 0.6;
    return center.clone().add(new Vector3(Math.sin(a) * extent * 0.62, extent * 0.55, Math.cos(a) * extent * 0.62));
  };
  // Behind the grid, looking past the marbles to the start gantry.
  const gridPos = v3(pointInFrame(frameAt(-11.5), 0, 4.6));
  const gridTarget = v3(pointOnTrack(frameAt(0.5), 0, 0.4));
  for (const sh of shots) {
    for (let fr = sh.start; fr < sh.end; fr++) {
      let c;
      if (sh.kind === "drone") c = { pos: droneAt((fr - sh.start) / (sh.end - sh.start)), target: center, fov: 40 };
      else if (sh.kind === "grid") c = { pos: gridPos, target: gridTarget, fov: 36 };
      else c = recipes[sh.kind](fr, sh);
      pos.push(c.pos.clone());
      target.push(c.target.clone());
      fov.push(c.fov);
      kind.push(sh.kind);
      marble.push(sh.marble ?? null);
    }
  }
  // Smooth inside each shot (cuts stay hard).
  let sp = pos;
  let st = target;
  let sf = fov;
  for (const sh of shots) {
    const sigma = sh.kind === "onboard" ? sec(0.12) : sec(0.3);
    sp = gauss(sp, sigma, sh.start, sh.end);
    st = gauss(st, sigma, sh.start, sh.end);
    sf = gauss(sf, sec(0.5), sh.start, sh.end);
  }
  const cams = sp.map((p, k) => [...arr(p), ...arr(st[k]), r3(sf[k]), kind[k], marble[k]]);
  const origCams = cams.map((c) => c.slice());

  // Replay cameras for the highlights: a fixed camera beside the impact, low
  // and close, tracking the marble that was hit with a tight field of view.
  const highlightCams = highlights.map((h) => {
    // A drained marble is moved out of the world on its DQ frame: frame it where it last was.
    const until = (g) => (h.dq ? Math.min(g, h.f - 1) : g);
    const hit = posOf(until(h.f), h.marble);
    const u = uOf(until(h.f), h.marble);
    const fr = frameAt(u + 0.8);
    let best = null;
    for (const side of [1, -1])
      for (const [lat, lift] of [[W2 + 1.6, 2.2], [W2 + 2.6, 3.4]]) {
        const pos = v3(fr.p).addScaledVector(flatRight(fr), side * lat).add(new Vector3(0, lift, 0));
        if (roomAt(pos, u) < 1.4) continue;
        let score = 0;
        for (let g = h.from; g <= h.to; g += 6) if (clear(pos, posOf(until(g), h.marble))) score++;
        if (best === null || score > best.score) best = { pos, score };
      }
    const pos = best ? best.pos : v3(fr.p).add(new Vector3(0, 6, 0));
    const path = [];
    for (let g = h.from; g <= h.to; g++) path.push(posOf(until(g), h.marble));
    const sm = gauss(path, sec(0.15));
    // At a machine, the machine is in the shot too (a tight frame on the marble
    // showed "THE HAMMER" with no hammer): aim between them and open the lens to fit both.
    const machine = course.features
      .filter((g) => g.type === h.feature && !["drop", "jump", "bumps", "crest", "lift", "elevator", "regroup"].includes(g.type))
      .sort((a, b) => Math.abs(a.u - uLoc(h.f, h.marble)) - Math.abs(b.u - uLoc(h.f, h.marble)))[0];
    const anchor = machine && Math.abs(machine.u - uLoc(h.f, h.marble)) < 12 ? v3(frameAt(machine.u + 1).p).add(new Vector3(0, 1.0, 0)) : null;
    return sm.map((t) => {
      const d = Math.max(0.5, pos.distanceTo(t));
      let fov = Math.min(40, Math.max(18, (2 * Math.atan(R / (0.2 * d)) * 180) / Math.PI));
      let target = t;
      if (anchor && anchor.distanceTo(t) < 9) {
        target = t.clone().lerp(anchor, 0.4);
        const a = pos.clone().sub(t).normalize().angleTo(pos.clone().sub(anchor).normalize());
        fov = Math.min(58, Math.max(fov, (a * 180) / Math.PI * 1.5 + 12));
      }
      return [...arr(pos), ...arr(target), r3(fov)];
    });
  });
  // --- Split screen ----------------------------------------------------------------
  // At moments that would otherwise cost us the head of the race, the screen
  // splits 50:50: the left half always follows P1, live; the right half shows
  // (in order of priority) a slow-motion replay of a highlight or blooper, the
  // lift tower carrying riders (always split), or the action the director was
  // showing elsewhere while P1 was out of shot. Mid-race replays are no longer
  // cut into the race: they play here, beside it.
  const p1 = [];
  for (let f = 0; f <= lastFrame; f++) {
    let best = -1;
    for (let i = 0; i < N; i++) if (!finished(i, f) && (best < 0 || uOf(f, i) > uOf(f, best))) best = i;
    p1.push(best < 0 ? 0 : best);
  }
  // Which cabin is carrying marble i at frame f (null if none).
  const cabinOf = (i, f) => {
    for (const [k, e] of elevators.entries())
      for (const c of e.cycles) if (c.riders.includes(i) && f >= c.closeAt - sec(0.6) && f < (c.closeTopAt ?? c.openAt + sec(2)) + sec(0.4)) return k;
    return null;
  };
  // What the left half follows at f: P1's cabin while it rides the lift ("c0"/"c1"), else P1 ("m7").
  const leaderKey = (f) => {
    const cab = cabinOf(p1[f], f);
    return cab !== null ? `c${cab}` : `m${p1[f]}`;
  };
  const camForKey = (key, f) => {
    // P1 riding the lift: the crane on its cabin (a chase camera would sit in the tower's frame).
    if (key[0] === "c") return recipes.elevator(f, { cabin: Number(key.slice(1)), fixed: true });
    const i = Number(key.slice(1));
    const p = posOf(f, i);
    const fr = frameAt(uLoc(f, i));
    const pos = v3(pointInFrame(frameAt(uLoc(f, i) - 3.6), 0, 1.5)).add(upW.clone().multiplyScalar(0.7));
    return { pos, target: p.clone().addScaledVector(flatFwd(fr), 1.2), fov: 52 };
  };
  // A camera that follows one subject per stretch: subjects held for less than
  // `min` frames are folded into their neighbour (at the lift P1 changes every
  // few frames), and smoothing never blends two subjects (that swung the
  // camera through empty air between two cabins): cuts stay hard.
  const subjectCams = (keys, start, min, camOf) => {
    const k = keys.slice();
    for (let pass = 0; pass < 3; pass++) {
      let a = 0;
      while (a < k.length) {
        let b = a;
        while (b < k.length && k[b] === k[a]) b++;
        if (b - a < min && (a > 0 || b < k.length)) {
          const fill = a > 0 ? k[a - 1] : k[b];
          for (let q = a; q < b; q++) k[q] = fill;
        }
        a = b;
      }
    }
    const pos = [];
    const tgt = [];
    const fov = [];
    k.forEach((key, j) => {
      const c = camOf(key, start + j);
      pos.push(c.pos);
      tgt.push(c.target);
      fov.push(c.fov);
    });
    let a = 0;
    let ps = pos;
    let ts = tgt;
    while (a < k.length) {
      let b = a;
      while (b < k.length && k[b] === k[a]) b++;
      ps = gauss(ps, sec(0.3), a, b);
      ts = gauss(ts, sec(0.25), a, b);
      a = b;
    }
    return { pos: ps, target: ts, fov, keys: k };
  };
  const raw = [];
  // Replays of the highlights and bloopers, starting just after each one.
  highlights.forEach((h, k) => raw.push({ kind: "replay", start: h.insert, end: h.insert + h.frames, highlight: k, prio: 3 }));
  // Every lift ride, both cabins: one split while either is moving.
  const rides = elevators
    .flatMap((e, k) => e.cycles.filter((c) => c.riseAt !== undefined && c.openAt !== undefined).map((c) => ({ cabin: k, start: Math.max(0, c.closeAt - sec(0.6)), end: c.closeTopAt !== undefined ? c.closeTopAt + sec(0.4) : c.openAt + sec(2), riders: c.riders })))
    .sort((a, b) => a.start - b.start);
  for (const r of rides) {
    const last = raw.length ? raw[raw.length - 1] : null;
    if (last && last.kind === "lift" && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      last.cabins.push({ cabin: r.cabin, riders: r.riders, start: r.start, end: r.end });
    } else raw.push({ kind: "lift", start: r.start, end: r.end, cabin: r.cabin, cabins: [{ cabin: r.cabin, riders: r.riders, start: r.start, end: r.end }], prio: 2 });
  }
  // The stair runs without pause, so its rides merge into long stretches: show it in looks of
  // at most 8 s, at least 12 s apart (a 30-second split screen was too much).
  for (let k = raw.length - 1; k >= 0; k--) {
    const r = raw[k];
    if (r.kind !== "lift" || r.end - r.start <= sec(8)) continue;
    const pieces = [];
    for (let a = r.start; a < r.end - sec(2); a += sec(20)) pieces.push({ ...r, start: a, end: Math.min(r.end, a + sec(8)), cabins: r.cabins.filter((c) => c.end > a && c.start < a + sec(8)) });
    raw.splice(k, 1, ...pieces);
  }
  // Action away from P1: the director cut to an obstacle while P1 is well clear of it (15+ units ahead).
  for (const sh of shots) {
    if (sh.kind !== "feature" || sh.start < raceStart + sec(3) || sh.end - sh.start < sec(1.5)) continue;
    let away = 0;
    let n = 0;
    for (let f = sh.start; f < sh.end; f += 6) {
      n++;
      if (p1[f] !== leader[f] && uOf(f, p1[f]) - uOf(f, leader[f]) > 15) away++;
    }
    if (away >= n * 0.7) raw.push({ kind: "action", start: sh.start, end: sh.end, label: sh.label ?? null, feature: sh.feature ?? null, prio: 1 });
  }
  // Resolve overlaps by priority; nothing shorter than 1.5 s, nothing after the win.
  const taken = new Array(lastFrame + 2).fill(null);
  for (const sp of [...raw].sort((a, b) => b.prio - a.prio || a.start - b.start)) {
    const a = Math.max(sp.start, raceStart + sec(2));
    const b = Math.min(sp.end, winnerFrame - sec(1), lastFrame + 1);
    if (b - a < sec(1.5)) continue;
    let free = true;
    for (let f = a; f < b; f++) if (taken[f]) free = false;
    if (!free) {
      if (sp.kind !== "replay") continue;
      // A replay waits for the slot to clear, keeping its length.
      const len = b - a;
      let s0 = a;
      while (s0 + len < winnerFrame - sec(1) && taken.slice(s0, s0 + len).some(Boolean)) s0 += sec(0.5);
      if (s0 + len >= winnerFrame - sec(1)) continue;
      sp.start = s0;
      sp.end = s0 + len;
    } else {
      sp.start = a;
      sp.end = b;
    }
    for (let f = sp.start; f < sp.end; f++) taken[f] = sp;
  }
  const splits = [...new Set(taken.filter(Boolean))].sort((a, b) => a.start - b.start);
  // Cameras: P1 on the left (overriding the main stream), the right half's own.
  for (const sp of splits) {
    const span = Array.from({ length: sp.end - sp.start }, (_, j) => sp.start + j);
    const left = subjectCams(span.map(leaderKey), sp.start, sec(2.5), camForKey);
    for (const f of span) cams[f] = [...arr(left.pos[f - sp.start]), ...arr(left.target[f - sp.start]), 52, "leader", p1[f]];
    if (sp.kind === "lift") {
      // The cabin P1 isn't in (the left half already shows P1's), or the one the split is about.
      const want = span.map((f, j) => {
        const lk = left.keys[j];
        return lk[0] === "c" ? `c${1 - Number(lk.slice(1))}` : `c${sp.cabin}`;
      });
      const right = subjectCams(want, sp.start, sec(2.5), camForKey);
      sp.cams = right.pos.map((p, k) => [...arr(p), ...arr(right.target[k]), r3(right.fov[k])]);
    } else if (sp.kind === "action") {
      sp.cams = [];
      for (let f = sp.start; f < sp.end; f++) sp.cams.push(origCams[f].slice(0, 7));
    }
    delete sp.prio;
  }
  return {
    cams,
    highlightCams,
    splits,
    shots: shots.map(({ kind, start, end, marble, label, feature }) => ({ kind, start, end, marble: marble ?? null, label: label ?? null, feature: feature ?? null })),
    replayCam: arr(replayCam),
    heli,
  };
}

// --- Audio ---------------------------------------------------------------------------
function soundtrack(result, rand) {
  const { data, impacts } = result;
  const { timeline, cams, frames, fps } = data;
  const RATE = 44100;
  const total = Math.ceil((timeline.total / fps) * RATE);
  // Everything that happens during the race is written in simulation time
  // (Ls/Rs), then cut into video time (Lc/Rc) segment by segment, since the
  // video replays parts of the race in slow motion.
  const simTotal = Math.ceil((frames.length / fps) * RATE);
  const Ls = new Float32Array(simTotal);
  const Rs = new Float32Array(simTotal);
  const Lc = new Float32Array(total);
  const Rc = new Float32Array(total);
  let target = { L: Ls, R: Rs, n: simTotal };
  const add = (i, s, pan) => {
    if (i < 0 || i >= target.n) return;
    target.L[i] += s * Math.cos(((pan + 1) * Math.PI) / 4);
    target.R[i] += s * Math.sin(((pan + 1) * Math.PI) / 4);
  };
  const camAt = (f) => cams[Math.min(f, cams.length - 1)];
  // Distance gain and pan of a world point as heard from the active camera.
  const hear = (f, p) => {
    const c = camAt(f);
    const pos = new Vector3(c[0], c[1], c[2]);
    const fwd = new Vector3(c[3] - c[0], c[4] - c[1], c[5] - c[2]).normalize();
    const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize();
    const rel = new Vector3(p[0], p[1], p[2]).sub(pos);
    const d = rel.length();
    return { gain: Math.max(0.06, 1 / (1 + (d * d) / 30)), pan: Math.max(-0.85, Math.min(0.85, rel.dot(right) / (d * 0.7 + 0.01))) };
  };

  const tone = (t, freq, dur, amp, pan = 0, decay = null) => {
    const start = Math.round(t * RATE);
    for (let k = 0; k < dur * RATE; k++) {
      const tt = k / RATE;
      const env = decay ? Math.exp(-tt / decay) : Math.min(1, k / 200) * Math.min(1, (dur * RATE - k) / 600);
      add(start + k, amp * env * Math.sin(2 * Math.PI * freq * tt), pan);
    }
  };
  const bell = (t, freq, amp, pan = 0, length = 1.6) => {
    const start = Math.round(t * RATE);
    for (let k = 0; k < length * RATE; k++) {
      const tt = k / RATE;
      let s = 0;
      for (const [mul, a] of [[1, 1], [2.76, 0.45], [5.4, 0.2], [8.9, 0.08]])
        s += a * Math.exp((-tt * (1 + mul)) / length) * Math.sin(2 * Math.PI * freq * mul * tt);
      add(start + k, amp * s * Math.min(1, k / 40), pan);
    }
  };
  // Crowd: band-limited noise with a slow swell.
  const crowd = (t, dur, amp) => {
    const start = Math.round(t * RATE);
    let a = 0;
    let b = 0;
    for (let k = 0; k < dur * RATE; k++) {
      const p = k / (dur * RATE);
      a += 0.08 * (rand() * 2 - 1 - a);
      b += 0.5 * (a - b);
      const env = Math.sin(Math.PI * Math.min(1, p * 2.2)) ** 0.7 * (1 - p) ** 0.6;
      const s = (a - b * 0.6) * env * amp;
      add(start + k, s, Math.sin(k / 9000) * 0.5);
    }
  };

  // Start lights: a low tick per light, then crowd roar at lights out.
  timeline.lights.forEach((lf) => tone(lf / fps, 220, 0.25, 0.18, 0, 0.08));
  crowd(timeline.raceStart / fps, 4, 1.4);

  // Rolling rumble of every marble, heard from the camera.
  let lp1 = 0;
  let lp2 = 0;
  const raceSamples = simTotal;
  const rumble = frames.map((fr, f) => {
    const prev = frames[Math.max(0, f - 1)];
    let sum = 0;
    fr.forEach((m, i) => {
      const speed = Math.hypot(m[0] - prev[i][0], m[1] - prev[i][1], m[2] - prev[i][2]) * fps;
      sum += Math.min(speed, 7) * hear(f, m).gain;
    });
    return sum;
  });
  for (let k = 0; k < raceSamples; k++) {
    const f = Math.min(frames.length - 1, Math.floor((k / RATE) * fps));
    lp1 += 0.04 * (rand() * 2 - 1 - lp1);
    lp2 += 0.04 * (lp1 - lp2);
    const s = lp2 * rumble[f] * 0.22;
    Ls[k] += s;
    Rs[k] += s;
  }

  // Impacts, heard from the camera: glass for marble-on-marble, a duller knock otherwise.
  for (const im of impacts) {
    const { gain, pan } = hear(im.f, frames[Math.min(im.f, frames.length - 1)][im.i]);
    const amp = Math.min(1, (im.strength - 0.5) / 4) ** 0.7 * 0.4 * gain;
    if (amp < 0.004) continue;
    const start = Math.round(im.t * RATE);
    const freq = im.glass ? 2800 + rand() * 1600 : 600 + rand() * 600;
    const decay = im.glass ? 0.018 : 0.028;
    for (let k = 0; k < decay * 6 * RATE; k++) {
      const tt = k / RATE;
      const noise = k < 100 ? (rand() * 2 - 1) * (1 - k / 100) * 0.6 : 0;
      add(start + k, amp * Math.exp(-tt / decay) * (0.8 * Math.sin(2 * Math.PI * freq * tt) + noise), pan);
    }
  }

  // Disqualification: a harsh two-tone buzzer, and a groan from the crowd.
  for (const e of data.events) {
    if (e.kind !== "dq") continue;
    const t0 = e.frame / fps;
    for (let k = 0; k < 3; k++) {
      tone(t0 + k * 0.22, 196, 0.16, 0.32, 0);
      tone(t0 + k * 0.22, 207, 0.16, 0.22, 0);
      tone(t0 + k * 0.22, 392, 0.16, 0.1, 0);
    }
  }
  // Machines, heard from the camera: the agitator's slow motor, the rollers'
  // buzz, the fan's rush of air. Each is a steady source at its position,
  // with the camera's distance gain and pan per frame.
  const lastF = frames.length - 1;
  const hum = (pos, make, amp) => {
    let ph = 0;
    let lp = 0;
    for (let f = timeline.raceStart; f <= lastF; f++) {
      const { gain, pan } = hear(f, pos);
      const g = gain * amp;
      if (g < 0.002) continue;
      const s0 = Math.round((f / fps) * RATE);
      const s1 = Math.round(((f + 1) / fps) * RATE);
      for (let k = s0; k < s1; k++) {
        const tt = k / RATE;
        const out = make(tt, () => (lp += 0.08 * (rand() * 2 - 1 - lp)));
        add(k, out * g, pan);
        ph++;
      }
    }
    void ph;
  };
  for (const v of data.vortices ?? [])
    hum(v.center, (tt, noise) => 0.6 * Math.sin(2 * Math.PI * 48 * tt) + 0.3 * Math.sin(2 * Math.PI * 96 * tt + 0.4 * Math.sin(2 * Math.PI * 1.1 * tt)) + 0.5 * noise(), 0.22);
  for (const r of data.rollers ?? []) hum(r.pos, (tt) => 0.5 * Math.sin(2 * Math.PI * 110 * tt) + 0.25 * Math.sin(2 * Math.PI * 221 * tt) + 0.15 * Math.sin(2 * Math.PI * 330 * tt), 0.08);
  for (const fan of data.fans ?? []) hum(fan.pos, (tt, noise) => noise() * (0.5 + 0.5 * fanGust(fan, tt)) * 4, 0.3);
  // The regroup gate: a buzzer while it holds (the last two seconds), a clunk as it lifts.
  for (const g of data.regroups ?? []) {
    if (g.openFrame === null) continue;
    for (let k = 0; k < 3; k++) tone(g.openFrame / fps - 1.6 + k * 0.5, 880, 0.12, 0.12, 0);
    tone(g.openFrame / fps, 140, 0.25, 0.3, 0, 0.09);
  }
  // The crowd reacts: a swell on every overtake for a top-five place, a groan on a disqualification.
  for (const e of data.events) {
    if (e.kind === "overtake" && e.pos <= 5) crowd(e.frame / fps + 0.1, 1.6, 0.45 + (5 - e.pos) * 0.08);
    if (e.kind === "dq") crowd(e.frame / fps + 0.25, 2.4, 0.7);
  }

  // Chequered flag: chime per finisher, a big cheer for the winner.
  data.order.forEach((i, k) => {
    const ff = data.marbles[i].finishFrame;
    if (ff === null) return;
    bell(ff / fps, k === 0 ? 1046.5 : k < 3 ? 880 : 784, k === 0 ? 0.35 : 0.14, 0);
  });
  const wf = data.marbles[data.order[0]].finishFrame ?? frames.length - 1;
  crowd(wf / fps - 0.2, 5, 1.8);

  // Cut the race into video time: live segments copy the simulation's sound;
  // replays get a whoosh, a low drone and the hits re-timed into slow motion.
  target = { L: Lc, R: Rc, n: total };
  const whoosh = (t) => {
    const start = Math.round(t * RATE);
    const n = Math.round(0.9 * RATE);
    let lp = 0;
    for (let k = 0; k < n; k++) {
      const p = k / n;
      lp += (0.02 + 0.25 * p) * (rand() * 2 - 1 - lp);
      add(start + k, lp * Math.sin(Math.PI * p) * 0.9, 0);
    }
  };
  for (const seg of timeline.segments) {
    const at = Math.round((seg.at / fps) * RATE);
    if (seg.kind === "live") {
      const a = Math.round((seg.from / fps) * RATE);
      const b = Math.min(simTotal, Math.round((seg.to / fps) * RATE));
      for (let k = a; k < b; k++) {
        if (at + k - a >= total) break;
        Lc[at + k - a] += Ls[k];
        Rc[at + k - a] += Rs[k];
      }
    } else {
      whoosh(seg.at / fps);
      const dur = seg.frames / fps;
      // Low drone under the slow motion.
      const start = at;
      for (let k = 0; k < dur * RATE; k++) {
        const tt = k / RATE;
        const env = Math.min(1, tt / 0.3) * Math.min(1, (dur - tt) / 0.4);
        add(start + k, 0.08 * env * (Math.sin(2 * Math.PI * 55 * tt) + 0.5 * Math.sin(2 * Math.PI * 82.5 * tt)), 0);
      }
      // Each hit in the window, slowed down: later, lower and louder.
      for (const im of impacts) {
        if (im.f < seg.from || im.f > seg.to) continue;
        const t = seg.at / fps + (im.t - seg.from / fps) / seg.speed;
        const amp = Math.min(1, (im.strength - 0.5) / 4) ** 0.7 * 0.35;
        const freq = (im.glass ? 2800 + rand() * 1600 : 600 + rand() * 600) * 0.55;
        const decay = (im.glass ? 0.018 : 0.028) * 2.2;
        const s0 = Math.round(t * RATE);
        for (let k = 0; k < decay * 6 * RATE; k++) {
          const tt = k / RATE;
          const noise = k < 200 ? (rand() * 2 - 1) * (1 - k / 200) * 0.6 : 0;
          add(s0 + k, amp * Math.exp(-tt / decay) * (0.8 * Math.sin(2 * Math.PI * freq * tt) + noise), 0);
        }
      }
    }
  }
  // A music bed under the whole race in video time: 124 bpm kick and hat, a
  // minor-key bass line, quiet enough to sit under the sound of the marbles,
  // fading out into the finish replay.
  {
    const bpm = 124;
    const beat = 60 / bpm;
    const t0 = timeline.raceStart / fps - 0.2;
    const t1 = timeline.replay.at / fps + 1.5;
    const bass = [55, 55, 65.41, 73.42, 55, 55, 87.31, 82.41]; // A A C D A A F E
    const amp = 0.065;
    const env = (t) => Math.min(1, Math.max(0, (t - t0) / 2)) * Math.min(1, Math.max(0, (t1 - t) / 2.5));
    for (let n = 0; t0 + n * beat < t1; n++) {
      const t = t0 + n * beat;
      const e = env(t) * amp;
      // Kick on every beat.
      const k0 = Math.round(t * RATE);
      for (let k = 0; k < 0.25 * RATE; k++) {
        const tt = k / RATE;
        add(k0 + k, e * 1.6 * Math.exp(-tt / 0.07) * Math.sin(2 * Math.PI * (60 + 80 * Math.exp(-tt / 0.02)) * tt), 0);
      }
      // Hat on the off-beat.
      const h0 = Math.round((t + beat / 2) * RATE);
      for (let k = 0; k < 0.05 * RATE; k++) add(h0 + k, e * 0.25 * Math.exp(-k / RATE / 0.012) * (rand() * 2 - 1), 0.2);
      // Bass: eighth notes, a plucked tone.
      for (let half = 0; half < 2; half++) {
        const fq = bass[(n * 2 + half) % bass.length];
        const b0 = Math.round((t + (half * beat) / 2) * RATE);
        for (let k = 0; k < 0.22 * RATE; k++) {
          const tt = k / RATE;
          const sh = Math.sin(2 * Math.PI * fq * tt) + 0.4 * Math.sin(2 * Math.PI * fq * 2 * tt) + 0.15 * Math.sin(2 * Math.PI * fq * 3 * tt);
          add(b0 + k, e * 0.5 * Math.exp(-tt / 0.12) * Math.min(1, k / 60) * sh, -0.1);
        }
      }
    }
  }
  // Finish replay whoosh, results fanfare, standings chord.
  whoosh(timeline.replay.at / fps);
  [523.25, 659.25, 783.99, 1046.5].forEach((fq, k) =>
    bell(timeline.results.at / fps + 0.15 + k * 0.14, fq, 0.2, (k - 1.5) * 0.3, 2.2),
  );
  [392, 493.88, 587.33].forEach((fq, k) => bell(timeline.standings.at / fps + 0.1 + k * 0.08, fq, 0.12, 0, 2));

  let peak = 0;
  for (let k = 0; k < total; k++) peak = Math.max(peak, Math.abs(Lc[k]), Math.abs(Rc[k]));
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
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Lc[k] * gain)) * 32767), 44 + k * 4);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Rc[k] * gain)) * 32767), 46 + k * 4);
  }
  return wav;
}

// --- Intro soundtrack -------------------------------------------------------------------
// Its own file (public/gp/<id>-intro.wav), played before the race's: a drone
// and slowed hits under the cold open, an impact on the title, then a music
// bed (the race's key and tempo) with a whoosh per team and per obstacle card,
// thinning to a heartbeat over the grid.
export function introTrack(plan, data, rand) {
  const fps = data.fps;
  const RATE = 44100;
  const total = Math.ceil((plan.total / fps) * RATE) + RATE; // a second of tail
  const Lc = new Float32Array(total);
  const Rc = new Float32Array(total);
  const add = (i, s, pan = 0) => {
    if (i < 0 || i >= total) return;
    Lc[i] += s * Math.cos(((pan + 1) * Math.PI) / 4);
    Rc[i] += s * Math.sin(((pan + 1) * Math.PI) / 4);
  };
  const scene = Object.fromEntries(plan.scenes.map((sc) => [sc.id, sc]));
  const secOf = (f) => f / fps;
  const whoosh = (t, dur = 0.9, amp = 0.9, pan = 0) => {
    const start = Math.round(t * RATE);
    const n = Math.round(dur * RATE);
    let lp = 0;
    for (let k = 0; k < n; k++) {
      const p = k / n;
      lp += (0.02 + 0.25 * p) * (rand() * 2 - 1 - lp);
      add(start + k, lp * Math.sin(Math.PI * p) * amp, pan * (2 * p - 1));
    }
  };
  const bell = (t, freq, amp, pan = 0, length = 1.6) => {
    const start = Math.round(t * RATE);
    for (let k = 0; k < length * RATE; k++) {
      const tt = k / RATE;
      let s = 0;
      for (const [mul, a] of [[1, 1], [2.76, 0.45], [5.4, 0.2], [8.9, 0.08]]) s += a * Math.exp((-tt * (1 + mul)) / length) * Math.sin(2 * Math.PI * freq * mul * tt);
      add(start + k, amp * s * Math.min(1, k / 40), pan);
    }
  };
  const boom = (t, amp) => {
    const start = Math.round(t * RATE);
    let lp = 0;
    for (let k = 0; k < 2.5 * RATE; k++) {
      const tt = k / RATE;
      lp += 0.1 * (rand() * 2 - 1 - lp);
      add(start + k, amp * (Math.exp(-tt / 0.6) * Math.sin(2 * Math.PI * (38 + 50 * Math.exp(-tt / 0.08)) * tt) + Math.exp(-tt / 0.15) * lp * 1.5));
    }
  };
  const pad = (t0, t1, freqs, amp) => {
    const a = Math.round(t0 * RATE);
    const b = Math.round(t1 * RATE);
    for (let k = a; k < b; k++) {
      const tt = (k - a) / RATE;
      const env = Math.min(1, tt / 1.2) * Math.min(1, (b - k) / RATE / 1.2);
      let s = 0;
      for (const f of freqs) s += Math.sin(2 * Math.PI * f * tt + 0.3 * Math.sin(2 * Math.PI * 0.2 * tt)) + 0.3 * Math.sin(2 * Math.PI * f * 2.003 * tt);
      add(k, (amp * env * s) / freqs.length);
    }
  };

  // Cold open: the moment in slow motion, a low drone and its hits slowed down.
  if (scene.cold) {
    const sc = scene.cold;
    const dur = secOf(sc.frames);
    whoosh(0, 0.7, 0.6);
    pad(0, dur + 0.4, [55, 82.41, 110], 0.12);
    const h = data.timeline.highlights[plan.highlight];
    const hitAt = secOf((h.f - plan.coldFrom) / h.speed);
    for (let k = 0; k < 3; k++) boom(hitAt + k * 0.18, 0.35 / (k + 1));
    // A riser into the title.
    const r0 = Math.round((dur - 1.4) * RATE);
    let lp = 0;
    for (let k = 0; k < 1.4 * RATE; k++) {
      const p = k / (1.4 * RATE);
      lp += (0.02 + 0.3 * p) * (rand() * 2 - 1 - lp);
      add(r0 + k, lp * p * p * 0.9);
    }
  }
  // Title: the impact and a bright chord.
  const t0 = secOf(scene.title.at);
  boom(t0, 0.9);
  [440, 523.25, 659.25, 880].forEach((f, k) => bell(t0 + 0.05 + k * 0.09, f, 0.16, (k - 1.5) * 0.35, 2.6));
  // The bed: 124 bpm kick and hat, the race's bass line, from the title to the lineup.
  const bedFrom = t0 + 0.9;
  const lineAt = secOf(scene.lineup.at);
  const end = secOf(plan.total);
  {
    const beat = 60 / 124;
    const bass = [55, 55, 65.41, 73.42, 55, 55, 87.31, 82.41];
    for (let n = 0; bedFrom + n * beat < end; n++) {
      const t = bedFrom + n * beat;
      const inLine = t >= lineAt;
      const e = Math.min(1, (t - bedFrom) / 1.5) * (inLine ? 0.55 : 1) * 0.11;
      // Kick on every beat; over the grid only every other, a heartbeat.
      if (!inLine || n % 2 === 0) {
        const k0 = Math.round(t * RATE);
        for (let k = 0; k < 0.25 * RATE; k++) {
          const tt = k / RATE;
          add(k0 + k, e * 1.6 * Math.exp(-tt / 0.07) * Math.sin(2 * Math.PI * (60 + 80 * Math.exp(-tt / 0.02)) * tt));
        }
      }
      if (inLine) continue;
      const h0 = Math.round((t + beat / 2) * RATE);
      for (let k = 0; k < 0.05 * RATE; k++) add(h0 + k, e * 0.25 * Math.exp(-k / RATE / 0.012) * (rand() * 2 - 1), 0.2);
      for (let half = 0; half < 2; half++) {
        const fq = bass[(n * 2 + half) % bass.length];
        const b0 = Math.round((t + (half * beat) / 2) * RATE);
        for (let k = 0; k < 0.22 * RATE; k++) {
          const tt = k / RATE;
          const sh = Math.sin(2 * Math.PI * fq * tt) + 0.4 * Math.sin(2 * Math.PI * fq * 2 * tt) + 0.15 * Math.sin(2 * Math.PI * fq * 3 * tt);
          add(b0 + k, e * 0.5 * Math.exp(-tt / 0.12) * Math.min(1, k / 60) * sh, -0.1);
        }
      }
    }
    pad(bedFrom, lineAt + 0.6, [110, 130.81, 164.81], 0.05);
  }
  // Teams: a whoosh and a chime per team; stakes: a chord.
  if (scene.teams) {
    const notes = [523.25, 587.33, 659.25, 783.99, 880];
    for (let k = 0; k * TEAM_FRAMES < scene.teams.frames; k++) {
      const t = secOf(scene.teams.at + k * TEAM_FRAMES);
      whoosh(t - 0.25, 0.6, 0.5, k % 2 ? 0.6 : -0.6);
      bell(t + 0.1, notes[k % notes.length], 0.1, 0, 1.4);
    }
  }
  if (scene.stakes) [392, 493.88, 587.33].forEach((f, k) => bell(secOf(scene.stakes.at) + 0.2 + k * 0.08, f, 0.12, 0, 2));
  // Flyover: a whoosh as the drone takes off, a soft one per obstacle card.
  whoosh(secOf(scene.flyover.at) - 0.2, 1.2, 0.8);
  for (const c of plan.cards) {
    const t = secOf(scene.flyover.at + c.from);
    whoosh(t - 0.15, 0.5, 0.35);
    bell(t + 0.05, 1318.5, 0.05, 0, 0.8);
  }
  // Lineup: a rising tension drone that stops dead for the lights.
  {
    const a = Math.round(lineAt * RATE);
    const b = Math.round(end * RATE);
    for (let k = a; k < b; k++) {
      const p = (k - a) / (b - a);
      const tt = (k - a) / RATE;
      const f = 55 * (1 + 0.5 * p);
      add(k, 0.07 * Math.min(1, tt / 0.8) * (0.4 + p) * (Math.sin(2 * Math.PI * f * tt) + 0.5 * Math.sin(2 * Math.PI * f * 1.5 * tt)) * Math.min(1, (b - k) / (0.05 * RATE)));
    }
  }

  let peak = 0;
  for (let k = 0; k < total; k++) peak = Math.max(peak, Math.abs(Lc[k]), Math.abs(Rc[k]));
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
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Lc[k] * gain)) * 32767), 44 + k * 4);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Rc[k] * gain)) * 32767), 46 + k * 4);
  }
  return wav;
}

/** The intro's plan for a baked round: the obstacle cards (each type once, in lap order) and the cold open's moment. */
export function introFor(data, round) {
  const cards = [];
  for (const f of data.features) {
    const c = cards.find((x) => x.type === f.type);
    if (c) c.count++;
    else cards.push({ type: f.type, u: r3(f.u), label: f.label, count: 1 });
  }
  const dq = data.obstacles.filter((o) => o.kind === "dq");
  if (dq.length) {
    const first = dq.reduce((a, o) => (o.u < a.u ? o : a));
    cards.push({ type: "dq", u: r3(first.u), label: "DQ ZONES", count: dq.length });
    cards.sort((a, b) => a.u - b.u);
  }
  const hs = data.timeline.highlights;
  let highlight = null;
  hs.forEach((h, k) => {
    if (highlight === null || (h.strength ?? 0) > (hs[highlight].strength ?? 0)) highlight = k;
  });
  const plan = introPlan({ round, L: (data.info.trackEnd ?? data.info.length) + 4, highlight, cards, teams: TEAMS.length });
  // The cold open starts so that the hit lands just past the middle.
  if (highlight !== null) {
    const h = hs[highlight];
    plan.coldFrom = Math.max(h.from, Math.round(h.f - 0.55 * 180 * h.speed));
  }
  return plan;
}

// --- Main ----------------------------------------------------------------------------
// Imported (by scripts/design.mjs): stop here. Run directly: bake the season.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);
if (!isMain) {
  // nothing more
} else {
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
await RAPIER.init();

if (opt("--round")) {
  // Seed sweep for one round.
  // A season round, or any design file in src/gp/circuits/ (e.g. one saved by the designer).
  const base = ROUNDS.find((r) => r.id === opt("--round")) ?? (await import(`../src/gp/circuits/${opt("--round")}.js`).then((m) => m.default).catch(() => null));
  if (!base) throw new Error(`unknown round; one of ${ROUNDS.map((r) => r.id).join(", ")} or a file in src/gp/circuits/`);
  // --layout '<json>': try another layout without touching the design file.
  // --set '<json>': override any other field of the design file (e.g. {"dq":{"target":1.5}}).
  const round = { ...base, ...(opt("--layout") ? { layout: JSON.parse(opt("--layout")) } : {}), ...(opt("--set") ? JSON.parse(opt("--set")) : {}) };
  const [a, b] = (opt("--seeds") ?? "1-8").split("-").map(Number);
  for (let s = a; s <= (b ?? a); s++) console.log((await runRound(round, s, { quiet: true })).summary);
  process.exit(0);
}

const outDir = new URL("../src/gp/races/", import.meta.url);
const audioDir = new URL("../public/gp/", import.meta.url);
mkdirSync(outDir, { recursive: true });
mkdirSync(audioDir, { recursive: true });

const totals = MARBLES.map(() => 0);
const seasonRounds = [];
const standings = [];
let prevStanding = null;
const teamTotals = {};
let prevTeams = null;
for (const [k, round] of ROUNDS.entries()) {
  const standingsBefore = MARBLES.map((_, i) => ({ marble: i, points: totals[i] })).sort((a, b) => b.points - a.points).map((r, pos) => ({ ...r, pos: pos + 1 }));
  const constructorsBefore = TEAMS.map((tm) => ({ team: tm.id, points: teamTotals[tm.id] ?? 0 })).sort((a, b) => b.points - a.points).map((r, pos) => ({ ...r, pos: pos + 1 }));
  const res = await runRound(round, round.seed, { quiet: false });
  console.log(res.summary);
  const { data } = res;
  data.round = k + 1;
  data.rounds = ROUNDS.length;
  const results = data.order.map((i, pos) => {
    const ff = data.marbles[i].finishFrame;
    const dq = data.marbles[i].dqFrame !== null;
    const pts = ff === null ? 0 : POINTS[pos] ?? 0;
    totals[i] += pts;
    return { marble: i, pos: pos + 1, points: pts, time: ff === null ? null : r3((ff - data.timeline.raceStart) / FPS), dq };
  });
  const table = MARBLES.map((_, i) => i)
    .sort((a, b) => totals[b] - totals[a] || results.findIndex((r) => r.marble === a) - results.findIndex((r) => r.marble === b))
    .map((i, pos) => ({ marble: i, pos: pos + 1, points: totals[i], prevPos: prevStanding ? prevStanding.indexOf(i) + 1 : null }));
  prevStanding = table.map((t) => t.marble);
  // Constructors: each team scores both its marbles' points.
  for (const r of results) {
    const team = teamOf(MARBLES[r.marble].abbr);
    if (team) teamTotals[team.id] = (teamTotals[team.id] ?? 0) + r.points;
  }
  const teamTable = TEAMS.map((tm) => ({ team: tm.id, points: teamTotals[tm.id] ?? 0, round: results.filter((r) => tm.drivers.includes(MARBLES[r.marble].abbr)).reduce((a, r) => a + r.points, 0) }))
    .sort((a, b) => b.points - a.points)
    .map((row, pos) => ({ ...row, pos: pos + 1, prevPos: prevTeams ? prevTeams.indexOf(row.team) + 1 : null }));
  prevTeams = teamTable.map((r) => r.team);
  data.results = results;
  data.standings = table;
  data.constructors = teamTable;
  data.teams = TEAMS;
  // Before this round (for the intro's "what's at stake").
  data.standingsBefore = standingsBefore;
  data.constructorsBefore = constructorsBefore;
  data.intro = introFor(data, k + 1);
  standings.push(table);
  seasonRounds.push({ id: round.id, round: k + 1, gp: round.gp, title: round.title, country: round.country, circuit: data.info.circuit, winner: data.order[0] });

  writeFileSync(new URL(`${round.id}.json`, outDir), JSON.stringify(data));
  writeFileSync(new URL(`${round.id}.wav`, audioDir), soundtrack(res, mulberry32(round.seed + 99)));
  writeFileSync(new URL(`${round.id}-intro.wav`, audioDir), introTrack(data.intro, data, mulberry32(round.seed + 7)));
}

writeFileSync(new URL("season.json", outDir), JSON.stringify({ marbles: MARBLES, rounds: seasonRounds, standings }));
writeFileSync(
  new URL("index.ts", outDir),
  `// Generated by scripts/season.mjs.\n${ROUNDS.map((r, k) => `import r${k} from "./${r.id}.json";`).join("\n")}\n` +
    `export { default as season } from "./season.json";\nexport const rounds = [${ROUNDS.map((_, k) => `r${k}`).join(", ")}];\n`,
);
console.log("champion so far:", MARBLES[standings.at(-1)[0].marble].name, standings.at(-1)[0].points, "pts");
}
