import { Quaternion, Vector3 } from "three";
import { frameQuat, pointInFrame, quatArr, r3, rot, TRACK } from "./kit.js";
import { agitatorArm, agitatorQuat, vortexSoup } from "../vortex.js";

// The vortex, a drain: a bowl with a hyperbolic profile y = -k (1/r - 1/R)
// (geometry in src/gp/vortex.js), on which a marble orbits at sqrt(g·k/r). A
// steep run-up and a long gentle guide bring the field in fast along the right
// wall, which runs on as a chute to the rim's tangent point, so marbles enter
// along the rim and circle round the wall, the fast ones riding high and
// crashing into the slow ones below, before they drop through the throat onto
// the lower track. Polished: frictionless walls and almost no rolling
// resistance inside. No paddles: anything slower than the orbit brakes it.
//
// The bowl is level, its rim at the floor of the upper track where that ends
// (`entry` past the feature's u), its axis `centre` past it and `offset` to the
// left (-(R - half-width): the track's right wall lies on the rim's tangent);
// the lower track resumes `resume` past it. A steep run-up (`ramp` units at
// `rampSlope`) so the field arrives faster than the rim's orbit speed, and a
// guide at `guide`° that eases it right instead of braking it.
export const VORTEX = { radius: 3.4, hole: 0.85, k: 2.9, lip: 2.2, throat: 0.4, fall: 0.6, entry: 0.4, centre: 2.4, resume: 1.8, offset: -1.3, ramp: 8, rampSlope: Math.tan((15 * Math.PI) / 180), guide: 13 };
VORTEX.depth = Math.round(VORTEX.k * (1 / VORTEX.hole - 1 / VORTEX.radius) * 1000) / 1000;
// Paddles: none. Any paddle slower than the orbit brakes it (a drain needs a free bowl);
// the parameters stay for the day a faster agitator earns its place.
export const AGITATOR = { arms: 0, rIn: 1.8, rOut: 2.9, clearance: 0.05, height: 0.4, thickness: 0.1, speed: -1.2 };

export default {
  type: "vortex",
  label: "THE VORTEX",
  place: { before: 11, after: 10, maxCurv: 0.025, once: true, always: true }, // a straight run-up
  guard: [2.6, 11, 2.0], // the lower track: marbles leave the throat at swirl speed
  dq: false,
  restitution: 0.2,
  collection: "vortices",
  card: { difficulty: 4, chaos: 5, seconds: 4, summary: "A drain: the field swirls round the wall, the fast ones ride high and crash into the slow ones, then down the hole." },
  build(f, { frameAt, statics, out }) {
    const W2 = TRACK.width / 2;
    // A long, gentle guide from the left wall to the centre line: the field drifts right without losing speed,
    // and the opening it leaves (2.1, three marbles) cannot clog.
    {
      const side = -1;
      const dl = W2 - 0.04;
      const du = dl / Math.tan((VORTEX.guide * Math.PI) / 180);
      const s = frameAt(f.u + VORTEX.entry - 0.6 - du / 2);
      const yaw = Math.atan2(side * dl, du);
      const q = frameQuat(s).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
      statics.push({ kind: "fin", shape: "box", pos: pointInFrame(s, side * (W2 - 0.04 - dl / 2), 0.3).map(r3), quat: quatArr(q), size: [Math.hypot(du, dl), 0.6, 0.08], restitution: 0.6 });
    }
    const se = frameAt(f.u + VORTEX.entry);
    const sc = frameAt(f.u + VORTEX.centre);
    const fl = Math.hypot(sc.t[0], sc.t[2]);
    const rgt = [-sc.t[2] / fl, sc.t[0] / fl]; // same "right" as src/gp/vortex.js
    // In the bowl's frame the track runs along x at z = -offset; its walls bound the opening in the lip.
    const zc = -VORTEX.offset;
    out.vortices.push({
      u: f.u,
      center: [sc.p[0] + rgt[0] * VORTEX.offset, se.p[1] - 0.02, sc.p[2] + rgt[1] * VORTEX.offset].map(r3),
      fwd: [sc.t[0], 0, sc.t[2]].map(r3),
      radius: VORTEX.radius,
      hole: VORTEX.hole,
      depth: VORTEX.depth,
      lip: VORTEX.lip,
      throat: VORTEX.throat,
      entryLo: r3(zc - W2 - 0.2),
      entryHi: r3(zc + W2 + 0.2),
      chute: { x0: r3(-(VORTEX.centre - VORTEX.entry) - 0.1), z: r3(zc + W2) },
      k: VORTEX.k,
      agitator: { ...AGITATOR, phase: r3((f.u * 0.61) % (Math.PI * 2)) },
    });
  },
  physics(world, list, { RAPIER, groups, trackBody }) {
    // The drain is polished: grip enough on the floor to roll, none on the walls
    // a fast marble rides along (wall friction braked the orbits within a turn).
    for (const v of list)
      for (const [which, friction] of [["floor", 0.25], ["walls", 0]]) {
        const soup = vortexSoup(v, which);
        world.createCollider(
          RAPIER.ColliderDesc.trimesh(soup.vertices, soup.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
            .setFriction(friction)
            .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
            .setRestitution(this.restitution)
            .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
            .setCollisionGroups(groups.clear),
          trackBody,
        );
      }
    const agitators = list.map((v) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...v.center).setRotation(rot(agitatorQuat(v, 0))));
      for (let k = 0; k < v.agitator.arms; k++)
        for (const seg of agitatorArm(v, k))
          world.createCollider(
            RAPIER.ColliderDesc.cuboid(seg.size[0] / 2, seg.size[1] / 2, seg.size[2] / 2)
              .setTranslation(...seg.pos)
              .setRotation(rot(seg.quat))
              .setFriction(0.2)
              .setRestitution(0.4)
              .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
              .setCollisionGroups(groups.track),
            body,
          );
      // The shaft down the throat (only with paddles: alone it leaves a one-marble gap that wedges).
      if (v.agitator.arms > 0) world.createCollider(RAPIER.ColliderDesc.cylinder(v.depth / 2 + v.throat, 0.12).setTranslation(0, -v.depth / 2 - v.throat, 0).setCollisionGroups(groups.track), body);
      return body;
    });
    return {
      kinematics: (t) => list.forEach((v, k) => agitators[k].setNextKinematicRotation(rot(agitatorQuat(v, t)))),
      /** Inside a bowl a marble keeps almost all its speed. */
      inside: (p) => list.some((v) => Math.hypot(p.x - v.center[0], p.z - v.center[2]) < v.radius + 0.05 && p.y < v.center[1] + v.lip && p.y > v.center[1] - v.depth - 0.2),
    };
  },
};
