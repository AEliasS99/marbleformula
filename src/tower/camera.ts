import * as THREE from "three";
import {
  bounds,
  finishedBy,
  lastFrame,
  marblePos,
  ranking,
  simAt,
  timeline,
  winner,
  type Layout,
  type Vec3,
} from "./race";

// Camera direction for the whole video, precomputed once per layout:
//   intro    wide shot of the tower, pushing in to the start gate
//   race     chase cam on the leading pack, leading their motion a little
//   replay   tight, low tracking shot on the winner, slowed down
//   results  slow drift over the basin
// Every shot is smoothed over the timeline in advance, so a frame's camera
// never depends on which frames were rendered before it.

export type Shot = { pos: Vec3; target: Vec3; fov: number };

const LAYOUT = {
  landscape: { fov: 38, chase: new THREE.Vector3(0, 2.4, 15), wideDist: 52, replay: new THREE.Vector3(3.2, 1.0, 6.5) },
  portrait: { fov: 55, chase: new THREE.Vector3(0, 2.0, 13.5), wideDist: 44, replay: new THREE.Vector3(1.8, 1.2, 7.5) },
} as const;

/** How long a finisher stays in the chase shot after crossing the line. */
const LINGER_FRAMES = 30;
const PACK_WEIGHTS = [0.55, 0.3, 0.15];
const midY = (bounds.yMin + bounds.yMax) / 2;

const smooth = (path: Vec3[], k: number) => {
  const out: Vec3[] = [];
  let cur = path[0];
  for (const p of path) {
    cur = cur.map((c, j) => c + (p[j] - c) * k) as Vec3;
    out.push(cur);
  }
  return out;
};

function buildRaceFocus(): Vec3[] {
  const raw: Vec3[] = [];
  for (let f = 0; f <= lastFrame; f++) {
    const order = ranking(f);
    const racing = order.filter((i) => !finishedBy(i, f - LINGER_FRAMES));
    let target: Vec3;
    if (racing.length === 0) {
      target = [0, bounds.yMin + 1.5, 0]; // everyone's in: look at the basin
    } else {
      const pack = racing.slice(0, 3);
      const w = PACK_WEIGHTS.slice(0, pack.length);
      const wsum = w.reduce((a, b) => a + b, 0);
      target = [0, 0, 0];
      pack.forEach((i, k) => {
        const p = marblePos(i, f);
        // Lead the motion by ~0.4 s so the camera isn't always catching up.
        const prev = marblePos(i, Math.max(0, f - 4));
        for (let j = 0; j < 3; j++) target[j] += ((p[j] + (p[j] - prev[j]) * 3) * w[k]) / wsum;
      });
    }
    target[2] = 0; // stay centred in depth; marbles sit between back wall and glass
    raw.push(target);
  }
  return smooth(raw, 0.06);
}

function buildWinnerPath(): Vec3[] {
  const raw: Vec3[] = [];
  for (let f = 0; f <= lastFrame; f++) raw.push(marblePos(winner, f));
  // Centred moving average: the winner bounces, the camera shouldn't.
  return raw.map((_, f) => {
    const acc: Vec3 = [0, 0, 0];
    let n = 0;
    for (let k = -8; k <= 8; k++) {
      const p = raw[Math.min(lastFrame, Math.max(0, f + k))];
      for (let j = 0; j < 3; j++) acc[j] += p[j];
      n++;
    }
    return acc.map((a) => a / n) as Vec3;
  });
}

const cache = new Map<Layout, (frame: number) => Shot>();

export function cameraFor(layout: Layout) {
  const hit = cache.get(layout);
  if (hit) return hit;

  const L = LAYOUT[layout];
  const focus = buildRaceFocus();
  const winnerPath = buildWinnerPath();
  const chase = (f: number) => {
    const t = focus[Math.min(f, lastFrame)];
    return { pos: [t[0] + L.chase.x, t[1] + L.chase.y, L.chase.z] as Vec3, target: t };
  };
  const wide = { pos: [0, midY + 2, L.wideDist] as Vec3, target: [0, midY, 0] as Vec3 };
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  const mix = (a: Vec3, b: Vec3, k: number) => a.map((v, j) => v + (b[j] - v) * k) as Vec3;

  const shot = (frame: number): Shot => {
    const { section, t } = simAt(frame);
    if (section === "race") {
      const c = chase(Math.round(t));
      // Hold wide for the first second, then push in to the start by "GO".
      const k = ease(Math.min(Math.max((t - 20) / (timeline.raceStart - 20), 0), 1));
      return { pos: mix(wide.pos, c.pos, k), target: mix(wide.target, c.target, k), fov: L.fov };
    }
    if (section === "replay") {
      const f0 = Math.floor(t);
      const a = t - f0;
      const w = mix(winnerPath[f0], winnerPath[Math.min(f0 + 1, lastFrame)], a);
      const drift = (frame - timeline.replay.at) / timeline.replay.frames; // slow orbit
      return {
        pos: [w[0] + L.replay.x * (1 - 2 * drift), w[1] + L.replay.y, w[2] + L.replay.z],
        target: w,
        fov: L.fov - 4,
      };
    }
    const k = (frame - timeline.results.at) / timeline.resultsFrames;
    const basin: Vec3 = [0, bounds.yMin + 1, 0];
    return {
      pos: [Math.sin(k * 1.2) * 3, bounds.yMin + 4.5, layout === "portrait" ? 20 : 15],
      target: basin,
      fov: L.fov,
    };
  };

  cache.set(layout, shot);
  return shot;
}

/** Projects a world point to pixel coordinates for 2D overlays. */
export function project(shot: Shot, p: Vec3, width: number, height: number) {
  const cam = new THREE.PerspectiveCamera(shot.fov, width / height, 0.1, 500);
  cam.position.set(...shot.pos);
  cam.lookAt(...shot.target);
  cam.updateMatrixWorld();
  const v = new THREE.Vector3(...p).project(cam);
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, visible: v.z < 1 };
}
