import { frameQuat, pointInFrame, quatArr, r3, TRACK } from "./kit.js";

// The fan: a pulsing lateral gust over a stretch of track (a force in the
// bake), from a caged fan on a post beside the wall.
// 6 u/s²: at 9 the gust pins marbles against the wall and friction beats the slope.
export const FAN = { length: 5, accel: 6, period: 1.6 };

/** Gust strength at time t, 0..1: pulses, never fully off. */
export function fanGust(fan, t) {
  const s = Math.sin((2 * Math.PI * t) / fan.period + fan.phase);
  return 0.3 + 0.7 * Math.max(0, s) ** 2;
}

export default {
  type: "fan",
  label: "THE FAN",
  place: { before: 1, after: 6, maxCurv: 0.035 },
  dq: false,
  collection: "fans",
  card: { difficulty: 2, chaos: 3, seconds: 1, summary: "A pulsing side wind that blows the light-footed into the wall." },
  build(f, { frameAt, out }) {
    const W2 = TRACK.width / 2;
    const side = out.fans.length % 2 ? -1 : 1; // the gust blows toward this side
    const s = frameAt(f.u + FAN.length / 2);
    out.fans.push({
      kind: "fan",
      u0: r3(f.u),
      u1: r3(f.u + FAN.length),
      side,
      dir: [side * s.r[0], 0, side * s.r[2]].map(r3),
      pos: pointInFrame(s, -side * (W2 + 1.9), 1.1).map(r3),
      quat: quatArr(frameQuat(s)),
      accel: FAN.accel,
      period: FAN.period,
      phase: r3((f.u * 0.29) % (Math.PI * 2)),
    });
  },
};
