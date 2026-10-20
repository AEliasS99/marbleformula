import * as THREE from "three";
import { rounds, season } from "./races";

// One baked Grand Prix (from scripts/season.mjs) plus everything derived from
// it. All of it is a pure function of the frame number.

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type Layout = "landscape" | "portrait";
export type Section = "race" | "replay" | "results" | "standings" | "constructors";
export type RoundData = (typeof rounds)[number];
export type Shot = { pos: Vec3; target: Vec3; fov: number; kind: string; marble: number | null };
/** One half of the picture (or the whole of it): its own clock (video frame → simulation frame) and camera. */
export type View = { tAt: (videoFrame: number) => number; shotAt: (videoFrame: number) => Shot };
export type Split = {
  kind: "replay" | "lift" | "action";
  start: number;
  end: number;
  highlight?: number;
  cabin?: number;
  cabins?: { cabin: number; riders: number[]; start: number; end: number }[];
  label?: string | null;
  feature?: string | null;
  cams?: number[][];
};
export type IntroCard = { type: string; u: number; label: string; count: number; from: number; to: number };
export type IntroPlan = { scenes: { id: string; frames: number; at: number }[]; total: number; highlight: number | null; coldFrom?: number; L: number; cards: IntroCard[] };
/** A highlight (or a drain blooper): replayed in slow motion in a split screen from the live frame `insert`. */
export type Highlight = { f: number; marble: number; label: string; feature: string; from: number; to: number; speed: number; frames: number; insert: number; dq?: boolean };

/**
 * A camera move faster than this (world units between two consecutive frames)
 * is a cut, not a move: in the split screens' P1 camera the leader can change,
 * and the camera then jumps to the new one.
 */
const CUT_JUMP = 1.5;
const jump = (A: ArrayLike<unknown>, B: ArrayLike<unknown>) =>
  Math.hypot((A[0] as number) - (B[0] as number), (A[1] as number) - (B[1] as number), (A[2] as number) - (B[2] as number));

export { rounds, season };

const cache = new Map<string, ReturnType<typeof build>>();
export const getRace = (id: string) => {
  let r = cache.get(id);
  if (!r) {
    const data = rounds.find((d) => d.id === id);
    if (!data) throw new Error(`No round ${id}`);
    r = build(data);
    cache.set(id, r);
  }
  return r;
};
export type Race = ReturnType<typeof getRace>;

function build(data: RoundData) {
  const { fps, timeline, marbles } = data;
  const frames = data.frames as number[][][];
  const lastFrame = frames.length - 1;
  const N = marbles.length;
  const L = data.info.length;

  // The live race as video segments (the bake writes a single one: highlights
  // replay in a split screen beside the race, they no longer interrupt it).
  const segments = timeline.segments as { kind: string; at: number; from: number; to: number }[];
  const highlights = timeline.highlights as unknown as Highlight[];
  /** Maps a video frame to a section and a (possibly fractional) simulation frame. */
  const simAt = (videoFrame: number): { section: Section; t: number } => {
    const { replay, results, standings } = timeline;
    if (videoFrame < replay.at) {
      let seg = segments[0];
      for (const s of segments) if (videoFrame >= s.at) seg = s;
      return { section: "race", t: Math.min(seg.to - 1, seg.from + (videoFrame - seg.at)) };
    }
    if (videoFrame < results.at) return { section: "replay", t: replay.from + (videoFrame - replay.at) * replay.speed };
    if (videoFrame < standings.at) return { section: "results", t: lastFrame };
    const cons = (timeline as unknown as { constructors?: { at: number } }).constructors;
    if (cons && videoFrame >= cons.at) return { section: "constructors", t: lastFrame };
    return { section: "standings", t: lastFrame };
  };

  // Motion blur samples a video frame at fractional moments around it (always
  // within half a frame: see MOTION_BLUR in src/gp/Effects.tsx), so the video
  // frame a sample belongs to is the nearest integer.
  /** The section a video frame shows, for sub-frame clamping (the cards behind the results are one continuous drone shot). */
  const sectionKey = (vf: number) => {
    if (vf < 0) return "intro"; // the intro is its own composition part (src/gp/Intro.tsx)
    const s = simAt(vf).section;
    return s === "standings" || s === "constructors" ? "results" : s;
  };
  /** A sub-frame sample never reaches across a section boundary (intro / race / replay / results): there it takes its own video frame. */
  const clampSample = (vf: number) => {
    const F = Math.round(vf);
    return vf === F || sectionKey(vf) === sectionKey(F) ? vf : F;
  };

  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const marblePose = (i: number, t: number) => {
    const f0 = Math.max(0, Math.min(Math.floor(t), lastFrame));
    const f1 = Math.min(f0 + 1, lastFrame);
    const a = Math.min(Math.max(t - f0, 0), 1);
    const A = frames[f0][i];
    const B = frames[f1][i];
    qa.set(A[3], A[4], A[5], A[6]);
    qb.set(B[3], B[4], B[5], B[6]);
    qa.slerp(qb, a);
    return {
      pos: [0, 1, 2].map((k) => A[k] + (B[k] - A[k]) * a) as Vec3,
      quat: [qa.x, qa.y, qa.z, qa.w] as Quat,
    };
  };
  const progress = (i: number, f: number) => frames[f][i][7]; // total: lap * L + u
  const GRID = 9.5;
  /** Lap index (0-based) and lap-local u of a marble at frame f. */
  const lapOf = (i: number, f: number) => Math.floor((progress(i, f) + GRID) / L);
  const uOf = (i: number, f: number) => progress(i, f) - lapOf(i, f) * L;
  const LAPS = (data.info as { laps?: number }).laps ?? 1;
  const lapsDone = (data as unknown as { laps?: { marble: number; lap: number; start: number; end: number }[] }).laps ?? [];
  /** Best completed descent by frame f: the fastest lap so far. */
  const bestLapBy = (f: number) => {
    let best: { marble: number; lap: number; start: number; end: number } | null = null;
    for (const l of lapsDone) if (l.end <= f && (best === null || l.end - l.start < best.end - best.start)) best = l;
    return best;
  };

  const finishedBy = (i: number, f: number) => {
    const ff = marbles[i].finishFrame;
    return ff !== null && ff <= f;
  };
  /** Disqualified (rolled over a red pad) by frame f. */
  const dqBy = (i: number, f: number) => {
    const df = (marbles[i] as { dqFrame?: number | null }).dqFrame ?? null;
    return df !== null && df <= f;
  };
  // The drain: from its DQ frame a marble slides into the nearest drain slot and drops down the
  // shaft over 0.7 s, then is gone (it used to vanish on the spot).
  const pads = ((data.obstacles as unknown as { kind: string; pos: Vec3 }[]) ?? []).filter((o) => o.kind === "dq");
  const drainOf = marbles.map((m, i) => {
    const df = (m as { dqFrame?: number | null }).dqFrame ?? null;
    if (df === null || !pads.length) return null;
    const at = frames[Math.max(0, Math.min(df - 1, lastFrame))][i]; // on its DQ frame the bake has already moved it out of the world
    let best = pads[0];
    for (const p of pads) if (Math.hypot(p.pos[0] - at[0], p.pos[2] - at[2]) < Math.hypot(best.pos[0] - at[0], best.pos[2] - at[2])) best = p;
    return { frame: df, from: [at[0], at[1], at[2]] as Vec3, pad: best.pos };
  });
  const drainPose = (i: number, t: number): { pos: Vec3; visible: boolean } | null => {
    const d = drainOf[i];
    if (!d || t < d.frame) return null;
    const k = (t - d.frame) / (0.7 * fps);
    if (k >= 1) return { pos: d.pad, visible: false };
    const slide = Math.min(1, k / 0.35);
    const fall = Math.max(0, (k - 0.3) / 0.7);
    const x = d.from[0] + (d.pad[0] - d.from[0]) * slide;
    const z = d.from[2] + (d.pad[2] - d.from[2]) * slide;
    const y = d.from[1] - 1.4 * fall * fall;
    return { pos: [x, y, z], visible: true };
  };

  // Finishers by time, then the rest by progress, then the disqualified (first out, last).
  const rankKey = (i: number, f: number): [number, number] => {
    if (f < timeline.raceStart) return [1, marbles[i].grid]; // on the grid: by grid position
    if (finishedBy(i, f)) return [0, marbles[i].finishFrame!];
    if (dqBy(i, f)) return [2, -((marbles[i] as { dqFrame?: number | null }).dqFrame ?? 0)];
    return [1, -progress(i, f)];
  };
  const ranking = (f: number) =>
    marbles
      .map((_, i) => i)
      .sort((a, b) => {
        const ka = rankKey(a, f);
        const kb = rankKey(b, f);
        return ka[0] - kb[0] || ka[1] - kb[1];
      });

  const order = data.order;
  const winner = order[0];
  const winnerFrame = marbles[winner].finishFrame ?? lastFrame;
  const lastFinishFrame = Math.max(...marbles.map((m) => m.finishFrame ?? lastFrame));
  const raceSeconds = (f: number) => Math.max(0, Math.min(f, lastFinishFrame) - timeline.raceStart) / fps;
  const finishSeconds = (i: number) =>
    marbles[i].finishFrame === null ? null : (marbles[i].finishFrame! - timeline.raceStart) / fps;

  // Gap to the leader, the TV way: how long ago the leader was where you are now.
  const leadU: number[] = [];
  let best = -Infinity;
  for (let f = 0; f <= lastFrame; f++) {
    for (let i = 0; i < N; i++) best = Math.max(best, progress(i, f));
    leadU.push(best);
  }
  const gapAt = (i: number, f: number) => {
    const u = progress(i, f);
    let lo = Math.min(timeline.raceStart, f); // ignore the leader's creep on the grid
    let hi = f;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (leadU[mid] >= u) hi = mid;
      else lo = mid + 1;
    }
    return (f - lo) / fps;
  };

  // Timing tower slots, eased; ranks re-read a few times a second or on a finish.
  // Two marbles still racing only trade rows once one is a clear 0.4 units
  // ahead: in a pile (a gate, the lift) their progress ties within noise and
  // the rows would otherwise shuffle without end.
  const rowSlots: number[][] = [];
  {
    let order = ranking(0);
    const settle = (f: number) => {
      for (let pass = 0; pass < order.length; pass++) {
        let swapped = false;
        for (let k = 0; k + 1 < order.length; k++) {
          const a = order[k];
          const b = order[k + 1];
          const ka = rankKey(a, f);
          const kb = rankKey(b, f);
          const better = kb[0] !== ka[0] ? kb[0] < ka[0] : ka[0] === 1 ? progress(b, f) - progress(a, f) > 0.4 : kb[1] < ka[1];
          if (better) {
            order[k] = b;
            order[k + 1] = a;
            swapped = true;
          }
        }
        if (!swapped) break;
      }
    };
    let rank = marbles.map((_, i) => order.indexOf(i));
    let slots = rank.slice();
    const every = Math.round(fps / 3);
    const ease = 1 - Math.pow(1 - 0.45, 30 / fps);
    for (let f = 0; f <= lastFrame; f++) {
      if (f % every === 0 || marbles.some((m) => m.finishFrame === f || (m as { dqFrame?: number | null }).dqFrame === f)) {
        if (f < timeline.raceStart) order = ranking(f);
        else settle(f);
        rank = marbles.map((_, i) => order.indexOf(i));
      }
      slots = slots.map((s, i) => s + (rank[i] - s) * ease);
      rowSlots.push(slots);
    }
  }

  /** The director's shot covering a race frame (for captions like obstacle names). */
  const shots = data.shots;
  const shotInfo = (f: number) => shots.find((s) => f >= s.start && f < s.end) ?? shots[shots.length - 1];

  // Cameras: the race comes from the baked director; replay and the result
  // cards are framed here.
  const cams = data.cams as (number | string | null)[][];
  const splits = ((data as unknown as { splits?: Split[] }).splits ?? []) as Split[];

  // Where the race camera cuts: between frames f and f + 1 when the director's
  // shot changes, the camera's kind changes, a split screen starts or ends (its
  // left half follows P1 with a camera of its own), or, inside a split's P1
  // camera, the leader changes and the camera jumps. Motion blur never blends
  // across a cut (it would double-expose the first frame of every shot).
  const raceCut = new Uint8Array(cams.length);
  {
    const shotIx = new Int32Array(cams.length);
    for (let f = 0; f < cams.length; f++) {
      const i = shots.findIndex((s) => f >= s.start && f < s.end);
      shotIx[f] = i < 0 ? shots.length - 1 : i; // as shotInfo
    }
    const edges = new Set(splits.flatMap((sp) => [sp.start, sp.end]));
    const inSplit = new Uint8Array(cams.length);
    for (const sp of splits) for (let f = Math.max(0, sp.start); f < Math.min(cams.length, sp.end); f++) inSplit[f] = 1;
    for (let f = 0; f + 1 < cams.length; f++) {
      const A = cams[f];
      const B = cams[f + 1];
      const leader = A[7] === "leader" || B[7] === "leader" || inSplit[f] || inSplit[f + 1];
      raceCut[f] = shotIx[f] !== shotIx[f + 1] || A[7] !== B[7] || edges.has(f + 1) || (leader && jump(A, B) > CUT_JUMP) ? 1 : 0;
    }
  }
  /** Cuts in a list of camera rows that has no shot list (a split's own camera, a highlight's replay camera): only jumps. */
  const jumpCuts = (rows: ArrayLike<unknown>[]) => {
    const out = new Uint8Array(rows.length);
    for (let k = 0; k + 1 < rows.length; k++) out[k] = jump(rows[k], rows[k + 1]) > CUT_JUMP ? 1 : 0;
    return out;
  };
  const winnerPath: Vec3[] = [];
  for (let f = 0; f <= lastFrame; f++) {
    const acc: Vec3 = [0, 0, 0];
    let n = 0;
    const win = Math.round(0.2 * fps);
    for (let k = -win; k <= win; k++) {
      const p = frames[Math.min(lastFrame, Math.max(0, f + k))][winner];
      acc[0] += p[0];
      acc[1] += p[1];
      acc[2] += p[2];
      n++;
    }
    winnerPath.push(acc.map((v) => v / n) as Vec3);
  }
  /** Two baked camera rows blended. */
  const blendCams = (A: (number | string | null)[], B: (number | string | null)[], k: number): Shot => {
    const mix = (i: number) => (A[i] as number) + ((B[i] as number) - (A[i] as number)) * k;
    return { pos: [mix(0), mix(1), mix(2)], target: [mix(3), mix(4), mix(5)], fov: mix(6), kind: A[7] as string, marble: A[8] as number | null };
  };
  /**
   * The camera at row position x (fractional, for motion blur) of baked camera
   * rows. Within a shot it blends the two rows around x; across a cut it takes
   * the row on the side of the video frame being rendered (whose own position
   * is xFrame), so all of that frame's sub-frames see the same shot.
   */
  const camAt = (rows: (number | string | null)[][], cuts: Uint8Array, x: number, xFrame: number): Shot => {
    const xc = Math.max(0, Math.min(rows.length - 1.001, x));
    const k = Math.max(0, Math.floor(xc));
    const next = Math.min(rows.length - 1, k + 1);
    if (cuts[k]) {
      const side = Math.min(next, Math.max(k, Math.round(xFrame)));
      return blendCams(rows[side], rows[side], 0);
    }
    return blendCams(rows[k], rows[next], xc - k);
  };
  /** Camera for a video frame; fractional frames interpolate, for motion blur. */
  const shotAt = (videoFrame: number): Shot => {
    const vf = clampSample(videoFrame);
    const { section, t } = simAt(vf);
    if (section === "race") return camAt(cams, raceCut, t, simAt(Math.round(vf)).t);
    if (section === "replay") {
      const f0 = Math.floor(t);
      const a = t - f0;
      const A = winnerPath[Math.min(f0, lastFrame)];
      const B = winnerPath[Math.min(f0 + 1, lastFrame)];
      const target = A.map((v, k) => v + (B[k] - v) * a) as Vec3;
      return { pos: data.replayCam as Vec3, target, fov: 30, kind: "replay", marble: winner };
    }
    // Slow drone orbit of the whole circuit behind the result cards.
    const k = (vf - timeline.results.at) / (timeline.total - timeline.results.at);
    const c = data.heli.center as Vec3;
    const e = data.heli.extent;
    const a = 0.8 + k * 0.9;
    return {
      pos: [c[0] + Math.sin(a) * e * 0.7, c[1] + e * 0.5, c[2] + Math.cos(a) * e * 0.7],
      target: c,
      fov: 40,
      kind: "drone",
      marble: null,
    };
  };

  const events = data.events;
  /** Seconds → frames at this round's frame rate. */
  const sec = (x: number) => Math.round(x * fps);
  const margin =
    marbles[order[1]].finishFrame !== null ? (marbles[order[1]].finishFrame! - winnerFrame) / fps : null;

  // --- Split screen --------------------------------------------------------------
  /** The split showing at a video frame (live race only), if any. */
  const splitAt = (videoFrame: number): Split | null => {
    const { section, t } = simAt(videoFrame);
    if (section !== "race") return null;
    return splits.find((sp) => t >= sp.start && t < sp.end) ?? null;
  };
  const mainView: View = { tAt: (vf) => simAt(clampSample(vf)).t, shotAt };
  /** The right half of a split: a replay runs its own slow clock in the past; the lift and the action are live. */
  const makeSplitView = (sp: Split): View => {
    const live = (vf: number) => simAt(clampSample(vf)).t;
    const hc = sp.kind === "replay" && sp.highlight !== undefined ? (data.highlightCams as number[][][])[sp.highlight] : undefined;
    if (sp.kind === "replay" && sp.highlight !== undefined && highlights[sp.highlight] && hc?.length) {
      const h = highlights[sp.highlight];
      const cuts = jumpCuts(hc);
      const tAt = (vf: number) => Math.min(h.to, h.from + (live(vf) - sp.start) * h.speed);
      return {
        tAt,
        shotAt: (vf) => ({ ...camAt(hc, cuts, tAt(vf) - h.from, tAt(Math.round(vf)) - h.from), kind: "highlight", marble: h.marble }),
      };
    }
    const cs = sp.cams ?? [];
    // No camera of its own (an older bake): show the race's camera rather than nothing.
    if (!cs.length) return { tAt: live, shotAt };
    const cuts = jumpCuts(cs);
    return {
      tAt: live,
      shotAt: (vf) => ({ ...camAt(cs, cuts, live(vf) - sp.start, live(Math.round(vf)) - sp.start), kind: sp.kind, marble: null }),
    };
  };
  // One View per split for the race's lifetime: the right half's canvas and
  // everything in it that subscribes to its view keep the same object.
  const splitViews = new Map<Split, View>();
  const splitView = (sp: Split): View => {
    let v = splitViews.get(sp);
    if (!v) splitViews.set(sp, (v = makeSplitView(sp)));
    return v;
  };
  /** P1 at a simulation frame (the left half of every split follows it). */
  const leaderAt = (f: number) => ranking(Math.max(0, Math.min(lastFrame, Math.round(f))))[0];

  const intro = ((data as unknown as { intro?: IntroPlan }).intro ?? null) as IntroPlan | null;

  return {
    data,
    intro,
    fps,
    timeline,
    splits,
    splitAt,
    mainView,
    splitView,
    leaderAt,
    marbles,
    N,
    L,
    lastFrame,
    simAt,
    marblePose,
    drainPose,
    progress,
    lapOf,
    uOf,
    LAPS,
    lapsDone,
    bestLapBy,
    finishedBy,
    dqBy,
    ranking,
    order,
    winner,
    winnerFrame,
    margin,
    raceSeconds,
    finishSeconds,
    gapAt,
    rowSlots,
    shotAt,
    shotInfo,
    sec,
    events,
    highlights,
  };
}

/**
 * The lens for a canvas of a given aspect (width / height): narrower frames (a
 * portrait video, a landscape half of a split screen) widen the vertical FOV so
 * about as much of the scene fits; the near-square halves of a portrait split
 * keep the director's lens. The camera rig (src/gp/Scene.tsx) and every overlay
 * that projects onto the picture use this, so labels land on what they label.
 */
export function lensFov(fov: number, aspect: number, layout: Layout) {
  if (layout !== "landscape" && aspect >= 0.9) return fov;
  const k = Math.min(1.9, Math.max(1, Math.sqrt(16 / 9 / Math.max(0.3, aspect))));
  return (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * k) * 180) / Math.PI;
}

/** Projects a world point to pixels for overlays. */
export function project(shot: Shot, fov: number, p: Vec3, width: number, height: number) {
  const cam = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);
  cam.position.set(...shot.pos);
  cam.lookAt(...shot.target);
  cam.updateMatrixWorld();
  const v = new THREE.Vector3(...p).project(cam);
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
}
