import * as THREE from "three";
import sim from "./sim.json";

// Typed access to the baked simulation, plus everything derived from it that
// needs the whole race at once (rankings, smoothing). All of it is a pure
// function of the frame number, which is what Remotion needs.

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Layout = "landscape" | "portrait";

export const fps = sim.fps;
export const timeline = sim.timeline;
export const marbles = sim.marbles;
export const statics = sim.statics;
export const movers = sim.movers;
export const finishLine = sim.finishLine;
export const bounds = sim.bounds;
export const marbleRadius = sim.marbleRadius;
export const seed = sim.seed;

const frames = sim.frames as number[][][]; // [frame][marble] = x,y,z,qx,qy,qz,qw,progress
export const lastFrame = frames.length - 1;

export type Section = "race" | "replay" | "results";

/** Maps a video frame to a section and a (possibly fractional) simulation frame. */
export function simAt(videoFrame: number): { section: Section; t: number } {
  const { replay, results } = timeline;
  if (videoFrame < replay.at) return { section: "race", t: Math.min(videoFrame, lastFrame) };
  if (videoFrame < results.at)
    return { section: "replay", t: replay.from + (videoFrame - replay.at) * replay.speed };
  return { section: "results", t: lastFrame };
}

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

/** Interpolated pose from a per-frame [x,y,z,qx,qy,qz,qw,...] track. */
function samplePose(get: (f: number) => number[], t: number) {
  const f0 = Math.max(0, Math.min(Math.floor(t), lastFrame));
  const f1 = Math.min(f0 + 1, lastFrame);
  const a = Math.min(Math.max(t - f0, 0), 1);
  const A = get(f0);
  const B = get(f1);
  const pos = [0, 1, 2].map((k) => A[k] + (B[k] - A[k]) * a) as Vec3;
  qa.set(A[3], A[4], A[5], A[6]);
  qb.set(B[3], B[4], B[5], B[6]);
  qa.slerp(qb, a);
  return { pos, quat: [qa.x, qa.y, qa.z, qa.w] as Quat };
}

export const marblePose = (i: number, t: number) => samplePose((f) => frames[f][i], t);
export const moverPose = (m: number, t: number) => samplePose((f) => movers[m].poses[f], t);
export const marblePos = (i: number, f: number) => frames[f][i].slice(0, 3) as Vec3;
const progress = (i: number, f: number) => frames[f][i][7];

export const finishedBy = (i: number, f: number) => {
  const ff = marbles[i].finishFrame;
  return ff !== null && ff <= f;
};

/** Race order at frame f: finishers by finish time, then by distance travelled. */
export function ranking(f: number) {
  return marbles
    .map((_, i) => i)
    .sort((a, b) => {
      const fa = finishedBy(a, f) ? marbles[a].finishFrame! : Infinity;
      const fb = finishedBy(b, f) ? marbles[b].finishFrame! : Infinity;
      if (fa !== fb) return fa - fb;
      return progress(b, f) - progress(a, f);
    });
}

export const finalOrder = ranking(lastFrame);
export const winner = finalOrder[0];
export const winnerFrame = marbles[winner].finishFrame ?? lastFrame;
export const lastFinishFrame = Math.max(...marbles.map((m) => m.finishFrame ?? lastFrame));

/** Race clock in seconds: starts at the gate, stops when the last marble finishes. */
export const raceSeconds = (f: number) =>
  Math.max(0, Math.min(f, lastFinishFrame) - timeline.raceStart) / fps;
export const finishSeconds = (i: number) =>
  marbles[i].finishFrame === null ? null : (marbles[i].finishFrame! - timeline.raceStart) / fps;

// Leaderboard slots, eased so rows slide instead of jumping. Ranks are only
// re-read every few frames so near-ties don't make rows flicker back and forth.
const RERANK_EVERY = 12;
export const rowSlots: number[][] = (() => {
  const out: number[][] = [];
  let rank = marbles.map((_, i) => i);
  let slots = rank.slice();
  for (let f = 0; f <= lastFrame; f++) {
    const someoneFinished = marbles.some((m) => m.finishFrame === f);
    if (f % RERANK_EVERY === 0 || someoneFinished) {
      const order = ranking(f);
      rank = marbles.map((_, i) => order.indexOf(i));
    }
    slots = slots.map((s, i) => s + (rank[i] - s) * 0.3);
    out.push(slots);
  }
  return out;
})();
