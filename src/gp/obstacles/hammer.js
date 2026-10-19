import { Quaternion, Vector3 } from "three";
import { frameQuat, mod, pointInFrame, quatArr, r3, rot } from "./kit.js";

// The hammer: a heavy head on an arm that spins full circles ALONG the track
// over one half of it (`lat` off the centre), on an axle between two posts.
// At the bottom of each turn the head is a wall across that half (from the
// centre line to 0.35 from the wall: too narrow to slip past) moving at
// ~8.5 u/s. Hammers alternate direction: one comes down behind you and
// launches you down the track, the next comes down in front of you and knocks
// you back. Take the other half, or time it. (A ±50° pendulum, as it used to
// be, mostly just nudged the pack.)
export const HAMMER = { pivot: 0.35 + 1.9, length: 1.9, head: [0.5, 0.5, 1.6], lat: 0.95, period: 1.4, axis: "z" };

/** The arm's orientation at time t: spinning (`spin`, rad/s, + launches forward) or, in old bakes, swinging. */
export function swingQuat(sw, t) {
  const a = sw.spin !== undefined ? sw.phase + sw.spin * t : sw.amp * Math.sin((2 * Math.PI * t) / sw.period + sw.phase);
  const axis = sw.axis === "z" ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  const q = new Quaternion(...sw.quat).multiply(new Quaternion().setFromAxisAngle(axis, a));
  return [q.x, q.y, q.z, q.w];
}

export default {
  type: "hammer",
  label: "THE HAMMER",
  place: { before: 1, after: 3, maxCurv: 0.035 },
  guard: [-4, 10, 2.0], // the hammer throws marbles far down the track, or back up it
  dq: true,
  restitution: 0.5,
  collection: "swings",
  card: { difficulty: 4, chaos: 5, seconds: 1.5, summary: "A hammer spinning full circles over one half of the track: one launches you forward, the next knocks you back. Take the other half or time it." },
  build(f, { frameAt, out, sync }) {
    const s = frameAt(f.u + 1);
    const side = out.swings.length % 2 ? -1 : 1;
    const spin = (side * 2 * Math.PI) / HAMMER.period; // alternate: launch, then brake
    out.swings.push({
      kind: "hammer",
      lat: r3(side * HAMMER.lat),
      pos: pointInFrame(s, side * HAMMER.lat, HAMMER.pivot).map(r3),
      quat: quatArr(frameQuat(s)),
      length: HAMMER.length,
      head: HAMMER.head,
      spin: r3(spin),
      period: HAMMER.period,
      axis: HAMMER.axis,
      // The head sweeps the bottom of its turn as the leader arrives.
      phase: r3(sync[f.u] !== undefined ? mod(-spin * sync[f.u], 2 * Math.PI) : (f.u * 0.61) % (Math.PI * 2)),
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
