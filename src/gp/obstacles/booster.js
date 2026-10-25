import { frameQuat, pointInFrame, quatArr, r3, TRACK } from "./kit.js";

// The booster: a glowing pad across the track that pushes every marble on it
// forward (a force along the track in the bake) up to `target` speed. Placed
// by the bake on the straights after the bends, where the pack has slowed.
export const BOOSTER = { length: 4, target: 16, accel: 50 };

export default {
  type: "booster",
  label: "BOOSTER",
  place: { before: 1, after: 5, maxCurv: 0.04 },
  dq: false,
  collection: "boosters",
  card: { difficulty: 1, chaos: 2, seconds: 0.5, summary: "A speed pad: every marble on it is shot forward." },
  build(f, { frameAt, out }) {
    if (process.env.GP_CARS === "1") {
      // Asymmetric DRS / Overtake Attack Strip on one side of the track (-1.12 or +1.12):
      // Trailing cars dive into the Attack Lane to slingshot past cars on the standard racing line!
      const side = Math.round(f.u * 1.3) % 2 === 0 ? -1 : 1;
      const latCenter = r3(side * 1.08);
      const len = 6.2;
      const s = frameAt(f.u + len / 2);
      out.boosters.push({
        kind: "booster",
        u0: r3(f.u),
        u1: r3(f.u + len),
        pos: pointInFrame(s, latCenter, 0.008).map(r3),
        quat: quatArr(frameQuat(s)),
        length: len,
        width: 1.42,
        target: 19.8,
        accel: 72,
        latCenter,
        latHalf: 0.88,
      });
      return;
    }
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
