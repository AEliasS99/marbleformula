import { Quaternion, Vector3 } from "three";
import { frameQuat, mod, pointInFrame, quatArr, r3, rot } from "./kit.js";

// The pendulum axe: a heavy head on an arm swinging ALONG the track over one
// half of it (`lat` off the centre). At the bottom of its swing the head is a
// wall across that half (from the centre line to 0.35 from the wall: too
// narrow to slip past, and moving parallel to the wall, so nothing is pinched),
// hitting at ~6.5 u/s; at the ends of its swing it is high enough to roll
// under. Go under it when it's up, take the other half, or get smashed.
// (Swinging across the track, as it used to, it barely touched anyone.)
export const HAMMER = { pivot: 0.35 + 1.9, length: 1.9, head: [0.5, 0.5, 1.6], lat: 0.95, amp: (50 * Math.PI) / 180, period: 1.6, axis: "z" };

export function swingQuat(sw, t) {
  const a = sw.amp * Math.sin((2 * Math.PI * t) / sw.period + sw.phase);
  const axis = sw.axis === "z" ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  const q = new Quaternion(...sw.quat).multiply(new Quaternion().setFromAxisAngle(axis, a));
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
  card: { difficulty: 4, chaos: 4, seconds: 1.5, summary: "A pendulum axe over one half of the track: roll under it while it's up, take the other half, or get smashed." },
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
      axis: HAMMER.axis,
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
