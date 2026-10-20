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
export type Highlight = { f: number; marble: number; label: string; feature: string; from: number; to: number; speed: number; frames: number; at: number };

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

  const segments = timeline.segments as { kind: string; at: number; from: number; to: number; speed?: number; frames?: number; highlight?: number }[];
  const highlights = timeline.highlights as unknown as Highlight[];
  /** Maps a video frame to a section and a (possibly fractional) simulation frame; `highlight` during a mid-race replay. */
  const simAt = (videoFrame: number): { section: Section; t: number; highlight: number | null } => {
    const { replay, results, standings } = timeline;
    if (videoFrame < replay.at) {
      let seg = segments[0];
      for (const s of segments) if (videoFrame >= s.at) seg = s;
      if (seg.kind === "replay") return { section: "replay", t: Math.min(seg.to, seg.from + (videoFrame - seg.at) * seg.speed!), highlight: seg.highlight! };
      return { section: "race", t: Math.min(seg.to - 1, seg.from + (videoFrame - seg.at)), highlight: null };
    }
    if (videoFrame < results.at) return { section: "replay", t: replay.from + (videoFrame - replay.at) * replay.speed, highlight: null };
    if (videoFrame < standings.at) return { section: "results", t: lastFrame, highlight: null };
    const cons = (timeline as unknown as { constructors?: { at: number } }).constructors;
    if (cons && videoFrame >= cons.at) return { section: "constructors", t: lastFrame, highlight: null };
    return { section: "standings", t: lastFrame, highlight: null };
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
  /** Two baked camera rows blended (only within one shot; cuts stay hard). */
  const blendCams = (A: (number | string | null)[], B: (number | string | null)[], a: number, sameShot: boolean): Shot => {
    const k = sameShot ? a : 0;
    const mix = (i: number) => (A[i] as number) + ((B[i] as number) - (A[i] as number)) * k;
    return { pos: [mix(0), mix(1), mix(2)], target: [mix(3), mix(4), mix(5)], fov: mix(6), kind: A[7] as string, marble: A[8] as number | null };
  };
  /** Camera for a video frame; fractional frames interpolate, for motion blur. */
  const shotAt = (videoFrame: number): Shot => {
    const { section, t, highlight } = simAt(videoFrame);
    if (section === "replay" && highlight !== null) {
      const h = highlights[highlight];
      const hc = (data.highlightCams as number[][][])[highlight];
      const x = Math.max(0, Math.min(hc.length - 1.001, t - h.from));
      const k = Math.floor(x);
      const s = blendCams(hc[k], hc[k + 1], x - k, true);
      return { ...s, kind: "highlight", marble: h.marble };
    }
    if (section === "race") {
      const x = Math.max(0, Math.min(cams.length - 1.001, t));
      const f0 = Math.floor(x);
      return blendCams(cams[f0], cams[f0 + 1], x - f0, shotInfo(f0) === shotInfo(f0 + 1));
    }
    if (section === "replay") {
      const f0 = Math.floor(t);
      const a = t - f0;
      const A = winnerPath[Math.min(f0, lastFrame)];
      const B = winnerPath[Math.min(f0 + 1, lastFrame)];
      const target = A.map((v, k) => v + (B[k] - v) * a) as Vec3;
      return { pos: data.replayCam as Vec3, target, fov: 30, kind: "replay", marble: winner };
    }
    // Slow drone orbit of the whole circuit behind the result cards.
    const k = (videoFrame - timeline.results.at) / (timeline.total - timeline.results.at);
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
  const splits = ((data as unknown as { splits?: Split[] }).splits ?? []) as Split[];
  /** The split showing at a video frame (live race only), if any. */
  const splitAt = (videoFrame: number): Split | null => {
    const { section, t } = simAt(videoFrame);
    if (section !== "race") return null;
    return splits.find((sp) => t >= sp.start && t < sp.end) ?? null;
  };
  const mainView: View = { tAt: (vf) => simAt(vf).t, shotAt: (vf) => shotAt(vf) };
  /** The right half of a split: a replay runs its own slow clock in the past; the lift and the action are live. */
  const splitView = (sp: Split): View => {
    const live = (vf: number) => simAt(vf).t;
    if (sp.kind === "replay" && sp.highlight !== undefined) {
      const h = highlights[sp.highlight];
      const hc = (data.highlightCams as number[][][])[sp.highlight];
      const tAt = (vf: number) => Math.min(h.to, h.from + (live(vf) - sp.start) * h.speed);
      return {
        tAt,
        shotAt: (vf) => {
          const x = Math.max(0, Math.min(hc.length - 1.001, tAt(vf) - h.from));
          const k = Math.floor(x);
          return { ...blendCams(hc[k], hc[k + 1], x - k, true), kind: "highlight", marble: h.marble };
        },
      };
    }
    const cs = sp.cams ?? [];
    return {
      tAt: live,
      shotAt: (vf) => {
        const x = Math.max(0, Math.min(cs.length - 1.001, live(vf) - sp.start));
        const k = Math.floor(x);
        return { ...blendCams(cs[k], cs[k + 1] ?? cs[k], x - k, true), kind: sp.kind, marble: null };
      },
    };
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
    segments,
  };
}

/** Portrait frames are narrow: widen the vertical FOV so roughly the same scene fits. */
export const fovFor = (fov: number, layout: Layout) =>
  layout === "landscape" ? fov : (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * 1.9) * 180) / Math.PI;

/** Projects a world point to pixels for overlays. */
export function project(shot: Shot, fov: number, p: Vec3, width: number, height: number) {
  const cam = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1000);
  cam.position.set(...shot.pos);
  cam.lookAt(...shot.target);
  cam.updateMatrixWorld();
  const v = new THREE.Vector3(...p).project(cam);
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
}
