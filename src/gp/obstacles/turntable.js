import { Quaternion, Vector3 } from "three";
import { frameQuat, pointInFrame, quatArr, r3, rot, solid } from "./kit.js";

// A spinning plate set into the floor: marbles crossing it are dragged sideways.
export const TURNTABLE = { radius: 1.6, thickness: 0.08, speed: 3.0 };

export function turntableQuat(tt, t) {
  const q = new Quaternion(...tt.quat).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), tt.phase + tt.speed * t));
  return [q.x, q.y, q.z, q.w];
}

export default {
  type: "turntable",
  label: "THE TURNTABLE",
  place: { before: 2, after: 4, maxCurv: 0.035, always: true },
  guard: [-2, 5],
  dq: true,
  restitution: 0.1,
  collection: "turntables",
  card: { difficulty: 3, chaos: 4, seconds: 1.5, summary: "A spinning disc in the floor that drags marbles sideways into each other." },
  build(f, { frameAt, out }) {
    const s = frameAt(f.u + 1);
    out.turntables.push({
      kind: "turntable",
      pos: pointInFrame(s, 0, TURNTABLE.thickness / 2 - 0.03).map(r3),
      quat: quatArr(frameQuat(s)),
      radius: TURNTABLE.radius,
      thickness: TURNTABLE.thickness,
      speed: (out.turntables.length % 2 ? -1 : 1) * TURNTABLE.speed,
      phase: r3((f.u * 0.53) % (Math.PI * 2)),
    });
  },
  physics(world, list, { RAPIER, groups }) {
    const bodies = list.map((tt) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...tt.pos).setRotation(rot(turntableQuat(tt, 0))));
      world.createCollider(solid(RAPIER.ColliderDesc.cylinder(tt.thickness / 2, tt.radius), RAPIER, { friction: 0.9, restitution: this.restitution, group: groups.track }), body);
      return body;
    });
    return { kinematics: (t) => list.forEach((tt, k) => bodies[k].setNextKinematicRotation(rot(turntableQuat(tt, t)))) };
  },
};
