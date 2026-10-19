import { Quaternion, Vector3 } from "three";
import { frameQuat, pointInFrame, quatArr, r3, TRACK } from "./kit.js";

// Slalom: deflector fins from alternate walls, angled 24° toward the inside and
// bouncy, so marbles ricochet through instead of sliding and stalling. A marble
// hugging the wall slides along the fin to its tip; the corner at the fin's root
// is obtuse, so there is no pocket to get pinned in. The tip leaves a wide
// opening (> 3 marbles) on the other side.
export default {
  type: "pegs",
  label: "SLALOM",
  place: { before: 1, after: 13, maxCurv: 0.035 },
  dq: false,
  card: { difficulty: 2, chaos: 2, seconds: 2.5, summary: "Three angled fins from alternate walls: the field zig-zags and bunches." },
  build(f, { frameAt, statics }) {
    const W2 = TRACK.width / 2;
    [1, -1, 1].forEach((side, row) => {
      const dl = W2 - 0.04 - 0.55; // from the wall in to lateral ±0.55
      const du = dl / Math.tan((24 * Math.PI) / 180);
      const u0 = f.u + row * 4.2;
      const s = frameAt(u0 + du / 2);
      const yaw = Math.atan2(side * dl, du); // rotate the fin from along-track toward the centre
      const q = frameQuat(s).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
      statics.push({
        kind: "fin",
        shape: "box",
        pos: pointInFrame(s, side * (W2 - 0.04 - dl / 2), 0.3).map(r3),
        quat: quatArr(q),
        size: [Math.hypot(du, dl), 0.6, 0.08],
        restitution: 0.6,
      });
    });
  },
};
