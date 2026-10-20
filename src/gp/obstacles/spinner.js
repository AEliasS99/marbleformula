import { Quaternion, Vector3 } from "three";
import { frameQuat, mod, pointInFrame, quatArr, r3, rot, solid } from "./kit.js";
import { spinnerParts } from "../rotor.js";

// The whirlwind: a two-blade rotor reaching almost to the walls (a 0.25 gap,
// too narrow for a marble to slip past), each blade ending in a hook that forms
// a pocket on its leading side: it scoops marbles up, carries them round and
// flings them out. At the wall a blade meets it square, so a marble there is
// shoved along the wall, never wedged.
export function spinnerQuat(sp, t) {
  const spin = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), sp.phase + sp.speed * t);
  const q = new Quaternion(...sp.quat).multiply(spin);
  return [q.x, q.y, q.z, q.w];
}

export default {
  type: "spinner",
  label: "THE WHIRLWIND",
  place: { before: 2, after: 3, maxCurv: 0.035, always: true },
  guard: [-4, 6, 3.0], // the fast rotor flings marbles high, backwards as well as forwards
  dq: false, // it flings marbles at the walls: a pad there would disqualify half the field
  restitution: 0.35,
  collection: "spinners",
  card: { difficulty: 4, chaos: 5, seconds: 3, summary: "A two-blade rotor with hooked tips: scoops marbles in batches and flings them out." },
  build(f, { frameAt, out, sync }) {
    const s = frameAt(f.u);
    const dir = out.spinners.length % 2 ? -1 : 1;
    const speed = dir * 3.4; // fast: it flings, not just stirs
    out.spinners.push({
      kind: "spinner",
      pos: pointInFrame(s, 0, 0.3).map(r3),
      quat: quatArr(frameQuat(s)),
      size: [0.12, 0.5, 1.82], // blade: thickness, height, reach from the axis
      arms: 2,
      hook: 0.5, // hook length, on the leading side
      dir,
      speed,
      // A blade lies across the track's centre line, sweeping toward the field, as the leader arrives.
      phase: r3(sync[f.u] !== undefined ? mod(Math.PI / 2 - speed * sync[f.u], Math.PI) : (f.u * 0.37) % Math.PI),
    });
  },
  physics(world, list, { RAPIER, groups }) {
    const bodies = list.map((sp) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...sp.pos).setRotation(rot(spinnerQuat(sp, 0))));
      for (const part of spinnerParts(sp))
        world.createCollider(
          solid(RAPIER.ColliderDesc.cuboid(part.size[0] / 2, part.size[1] / 2, part.size[2] / 2).setTranslation(...part.pos).setRotation(rot(part.quat)), RAPIER, { restitution: this.restitution, group: groups.track }),
          body,
        );
      world.createCollider(RAPIER.ColliderDesc.cylinder(sp.size[1] / 2, 0.22).setCollisionGroups(groups.track), body); // hub
      return body;
    });
    return { kinematics: (t) => list.forEach((sp, k) => bodies[k].setNextKinematicRotation(rot(spinnerQuat(sp, t)))) };
  },
};
