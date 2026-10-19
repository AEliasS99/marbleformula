import { Quaternion, Vector3 } from "three";
import { frameQuat, pointOnTrack, quatArr, r3, rot, solid, TRACK } from "./kit.js";

// Rollers: three cylinders across the floor, all driving forward but at
// different speeds, so the field gets kicked apart. (A backward roller traps
// marbles in the pocket between rollers.) Nearly flush: only the top touches,
// so a slow marble is never pushed back.
export const ROLLER = { radius: 0.3, proud: 0.03, spacing: 1.4, surfaces: [7, 4.5, 10] };

export function rollerQuat(r, t) {
  const spin = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), r.phase + r.omega * t);
  const q = new Quaternion(...r.quat).multiply(spin);
  return [q.x, q.y, q.z, q.w];
}

export default {
  type: "rollers",
  label: "THE ROLLERS",
  place: { before: 1, after: 5, maxCurv: 0.035, always: true },
  guard: [-1, 5, 1.2],
  dq: false,
  restitution: 0.2,
  collection: "rollers",
  card: { difficulty: 1, chaos: 2, seconds: 1, summary: "Three knurled rollers at different speeds: overtakes without contact." },
  build(f, { frameAt, out }) {
    const W2 = TRACK.width / 2;
    ROLLER.surfaces.forEach((surface, k) => {
      const s = frameAt(f.u + 0.6 + k * ROLLER.spacing);
      out.rollers.push({
        kind: "roller",
        pos: pointOnTrack(s, 0, -ROLLER.radius + ROLLER.proud).map(r3),
        quat: quatArr(frameQuat(s)),
        radius: ROLLER.radius,
        length: 2 * W2 - 0.1,
        omega: r3(surface / ROLLER.radius), // about the across-track axis; positive drives marbles forward
        phase: r3((f.u * 0.37 + k) % (Math.PI * 2)),
      });
    });
  },
  physics(world, list, { RAPIER, groups }) {
    const axis = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2); // cylinder axis (local y) across the track (local z)
    const bodies = list.map((r) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...r.pos).setRotation(rot(rollerQuat(r, 0))));
      world.createCollider(solid(RAPIER.ColliderDesc.cylinder(r.length / 2, r.radius).setRotation({ x: axis.x, y: axis.y, z: axis.z, w: axis.w }), RAPIER, { friction: 1.0, restitution: this.restitution, group: groups.track }), body);
      return body;
    });
    return { kinematics: (t) => list.forEach((r, k) => bodies[k].setNextKinematicRotation(rot(rollerQuat(r, t)))) };
  },
};
