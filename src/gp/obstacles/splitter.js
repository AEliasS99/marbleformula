import { frameQuat, pointInFrame, quatArr, r3, surfaceHeight } from "./kit.js";

// Split lanes: a long wall down the middle (just off-centre, so nothing meets
// its round nose head-on) that splits the field into two lanes.
export default {
  type: "splitter",
  label: "SPLIT LANES",
  place: { before: 1, after: 8, maxCurv: 0.035 },
  dq: false,
  card: { difficulty: 1, chaos: 2, seconds: 2, summary: "Two lanes for 6.5 units: who chose the faster side?" },
  build(f, { frameAt, statics, cylinder }) {
    const s = frameAt(f.u + 3.5);
    const lat = 0.15;
    statics.push({
      kind: "splitter",
      shape: "box",
      pos: pointInFrame(s, lat, surfaceHeight(lat) + 0.4).map(r3),
      quat: quatArr(frameQuat(s)),
      size: [6.5, 0.95, 0.24],
      restitution: 0.4,
    });
    cylinder("splitter", f.u + 0.25, lat, 0.2, 0.95, 0.4); // round nose
  },
};
