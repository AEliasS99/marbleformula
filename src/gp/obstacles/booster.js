import { frameQuat, pointInFrame, quatArr, r3, TRACK } from "./kit.js";

// The booster: a glowing pad across the track that pushes every marble on it
// forward (a force along the track in the bake) up to `target` speed. Placed
// by the bake on the straights after the bends, where the pack has slowed.
export const BOOSTER = { length: 4, target: 14, accel: 45 };

export default {
  type: "booster",
  label: "BOOSTER",
  place: { before: 1, after: 5, maxCurv: 0.04 },
  dq: false,
  collection: "boosters",
  card: { difficulty: 1, chaos: 2, seconds: 0.5, summary: "A speed pad: every marble on it is shot forward." },
  build(f, { frameAt, out }) {
    const s = frameAt(f.u + BOOSTER.length / 2);
    out.boosters.push({
      kind: "booster",
      u0: r3(f.u),
      u1: r3(f.u + BOOSTER.length),
      pos: pointInFrame(s, 0, 0.006).map(r3),
      quat: quatArr(frameQuat(s)),
      length: BOOSTER.length,
      width: r3(2 * (s.w ?? TRACK.width / 2) - 0.1),
      target: BOOSTER.target,
      accel: BOOSTER.accel,
    });
  },
};
