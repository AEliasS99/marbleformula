import { Matrix4, Quaternion, Vector3 } from "three";
import { frameQuat, pointInFrame, quatArr, r3, surfaceHeight } from "./kit.js";

// Split lanes + Guided Shortcut Channel:
// A physical divider wall with an upstream angled guide rail ("fin") that funnels cars on the inside line
// into an Express Shortcut Booster Chute, while the wider main lane contains bumper/peg obstacles!
export default {
  type: "splitter",
  label: "SHORTCUT SPLIT",
  place: { before: 3, after: 9, maxCurv: 0.035 },
  dq: false,
  card: { difficulty: 2, chaos: 3, seconds: 2, summary: "Guided shortcut chute with a speed booster on one side and obstacle bumpers on the other." },
  build(f, { frameAt, statics, cylinder, out }) {
    const side = Math.round(f.u) % 2 === 0 ? 1 : -1; // +1 = left/right staggered switchback
    if (process.env.GP_CARS === "1") {
      // In Car Mode: ZERO mid-track walls or pinball posts!
      // Instead, build a Staggered Dual-Lane Switchback Boost Zone:
      // 1) Early Inside Entry Attack Strip (u + 0.2 .. u + 5.0) on -side
      // 2) Late Outside Exit Slingshot Strip (u + 4.0 .. u + 9.2) on +side
      // This splits the pack into two high-speed racing lines that trade the lead side-by-side!
      const inLat = r3(side * -1.08);
      const sIn = frameAt(f.u + 2.6);
      out?.boosters?.push({
        kind: "booster",
        u0: r3(f.u + 0.2),
        u1: r3(f.u + 5.0),
        pos: pointInFrame(sIn, inLat, 0.008).map(r3),
        quat: quatArr(frameQuat(sIn)),
        length: 4.8,
        width: 1.38,
        target: 19.4,
        accel: 68,
        latCenter: inLat,
        latHalf: 0.88,
      });

      const outLat = r3(side * 1.08);
      const sOut = frameAt(f.u + 6.6);
      out?.boosters?.push({
        kind: "booster",
        u0: r3(f.u + 4.0),
        u1: r3(f.u + 9.2),
        pos: pointInFrame(sOut, outLat, 0.008).map(r3),
        quat: quatArr(frameQuat(sOut)),
        length: 5.2,
        width: 1.38,
        target: 20.4,
        accel: 76,
        latCenter: outLat,
        latHalf: 0.88,
      });
      return;
    }

    const wallLat = side * -0.18;
    const s = frameAt(f.u + 3.8);
    statics.push({
      kind: "splitter",
      shape: "box",
      pos: pointInFrame(s, wallLat, surfaceHeight(wallLat) + 0.42).map(r3),
      quat: quatArr(frameQuat(s)),
      size: [7.2, 0.95, 0.22],
      restitution: 0.35,
    });
    cylinder("splitter", f.u + 0.2, wallLat, 0.18, 0.95, 0.35); // rounded entry nose

    // Upstream angled TCR Guide Rail ("fin") that funnels cars on the shortcut side into the shortcut lane
    const sA = frameAt(f.u - 2.4);
    const sB = frameAt(f.u - 0.2);
    const pA = new Vector3(...pointInFrame(sA, wallLat + side * 0.48, 0.38));
    const pB = new Vector3(...pointInFrame(sB, wallLat, 0.38));
    const mid = pA.clone().add(pB).multiplyScalar(0.5);
    const dir = pB.clone().sub(pA);
    const len = dir.length();
    dir.normalize();
    const up = new Vector3(...sA.n).normalize();
    const z = new Vector3().crossVectors(dir, up).normalize();
    const y = new Vector3().crossVectors(z, dir).normalize();
    const qFin = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(dir, y, z));
    statics.push({
      kind: "fin",
      shape: "box",
      pos: [r3(mid.x), r3(mid.y), r3(mid.z)],
      quat: quatArr(qFin),
      size: [r3(len), 0.85, 0.14],
      restitution: 0.3,
    });

    // Express Shortcut Booster Pad inside the shortcut lane
    const shortLat = side * -1.12;
    const sBoost = frameAt(f.u + 3.8);
    out?.boosters?.push({
      kind: "booster",
      u0: r3(f.u + 1.2),
      u1: r3(f.u + 6.4),
      pos: pointInFrame(sBoost, shortLat, 0.008).map(r3),
      quat: quatArr(frameQuat(sBoost)),
      length: 5.2,
      width: 1.45,
      target: 18.5,
      accel: 62,
      latCenter: r3(shortLat),
      latHalf: 0.95,
    });

    if (process.env.GP_CARS === "1") {
      // In Car Mode: zero pinball bumpers! Instead, place a staggered late-exit slingshot boost pad
      // on the outer main lane so both split lanes are 100% clean and create side-by-side exit drag races!
      const mainLat = side * 0.96;
      const sMainBoost = frameAt(f.u + 5.6);
      out?.boosters?.push({
        kind: "booster",
        u0: r3(f.u + 3.6),
        u1: r3(f.u + 7.6),
        pos: pointInFrame(sMainBoost, mainLat, 0.008).map(r3),
        quat: quatArr(frameQuat(sMainBoost)),
        length: 4.0,
        width: 1.35,
        target: 18.0,
        accel: 54,
        latCenter: r3(mainLat),
        latHalf: 0.85,
      });
    } else {
      // Main Hazard Lane Obstacles for Marbles
      cylinder("bumper", f.u + 2.3, side * 0.92, 0.34, 0.85, 0.45);
      cylinder("bumper", f.u + 5.2, side * 1.28, 0.32, 0.85, 0.45);
      cylinder("peg", f.u + 3.8, side * 0.55, 0.14, 0.85, 0.38);
    }
  },
};
