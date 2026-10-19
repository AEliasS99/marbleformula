import { Quaternion, Vector3 } from "three";
import { frameQuat, mod, pointInFrame, quatArr, r3, rot } from "./kit.js";

// A pendulum hammer that sweeps only one half of the track: the pivot sits
// `lat` off the centre and the head swings from the centre line to 1.1 from it,
// so the far half is a safe lane and choosing it matters. The head's edge stops
// 0.75 from the wall, more than a marble, so nothing is ever pinched against it.
export const HAMMER = { pivot: 0.35 + 1.9, length: 1.9, head: [1.0, 0.5, 0.5], lat: 0.55, amp: (16.8 * Math.PI) / 180, period: 1.5 };

export function swingQuat(sw, t) {
  const a = sw.amp * Math.sin((2 * Math.PI * t) / sw.period + sw.phase);
  const q = new Quaternion(...sw.quat).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), a));
  return [q.x, q.y, q.z, q.w];
}

export default {
  type: "hammer",
  label: "THE HAMMER",
  place: { before: 1, after: 3, maxCurv: 0.035 },
  guard: [-1, 10, 2.0], // the hammer throws marbles far down the track
  dq: true,
  restitution: 0.5,
  collection: "swings",
  card: { difficulty: 3, chaos: 4, seconds: 1.5, summary: "A pendulum sweeping one half of the track: pick the safe lane or get batted." },
  build(f, { frameAt, out, sync }) {
    const s = frameAt(f.u + 1);
    const side = out.swings.length % 2 ? -1 : 1;
    out.swings.push({
      kind: "hammer",
      lat: r3(side * HAMMER.lat),
      pos: pointInFrame(s, side * HAMMER.lat, HAMMER.pivot).map(r3),
      quat: quatArr(frameQuat(s)),
      length: HAMMER.length,
      head: HAMMER.head,
      amp: HAMMER.amp,
      period: HAMMER.period,
      // The head passes the centre line, at full speed, as the leader arrives.
      phase: r3(sync[f.u] !== undefined ? mod(-(2 * Math.PI * sync[f.u]) / HAMMER.period, 2 * Math.PI) : (f.u * 0.61) % (Math.PI * 2)),
    });
  },
  physics(world, list, { RAPIER, groups }) {
    const bodies = list.map((sw) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...sw.pos).setRotation(rot(swingQuat(sw, 0))));
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.05, sw.length / 2, 0.05).setTranslation(0, -sw.length / 2, 0).setCollisionGroups(groups.track), body);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(sw.head[0] / 2, sw.head[1] / 2, sw.head[2] / 2)
          .setTranslation(0, -sw.length, 0)
          .setRestitution(this.restitution)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setFriction(0.2)
          .setCollisionGroups(groups.track),
        body,
      );
      return body;
    });
    return { kinematics: (t) => list.forEach((sw, k) => bodies[k].setNextKinematicRotation(rot(swingQuat(sw, t)))) };
  },
};
