import { Quaternion, Vector3 } from "three";
import { frameQuat, pointInFrame, quatArr, r3, rot, solid } from "./kit.js";

// A spinning plate set into the floor. Flat, it hardly did anything: marbles
// rolled straight over it. Six raised rubber ribs (0.26 tall, three quarters of a marble's radius: tall enough to catch even a slow marble and fling it, still below its
// centre, so they kick it sideways and up rather than stopping it) and a
// domed hub that splits the pack toward the rim make it throw marbles across
// the track and into each other.
// Ribs stop 0.55 from the wall: reaching to 0.25 they pinned marbles against it and pushed them through.
export const TURNTABLE = { radius: 1.9, thickness: 0.08, speed: 5.0, ribs: 6, ribHeight: 0.26, ribWidth: 0.09, ribFrom: 0.42, ribTo: 1.55, hub: 0.34, hubHeight: 0.22 };

/** Ribs in the plate's own frame (y up), for the physics and the renderer. */
export function turntableParts(tt) {
  const parts = [];
  const n = tt.ribs ?? 0;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const len = tt.ribTo - tt.ribFrom;
    const mid = (tt.ribFrom + tt.ribTo) / 2;
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a);
    parts.push({ kind: "rib", pos: [Math.cos(a) * mid, tt.thickness / 2 + tt.ribHeight / 2, -Math.sin(a) * mid], quat: [q.x, q.y, q.z, q.w], size: [len, tt.ribHeight, tt.ribWidth] });
  }
  return parts;
}

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
  card: { difficulty: 3, chaos: 4, seconds: 1.5, summary: "A spinning disc with raised rubber ribs and a domed hub: throws marbles across the track and into each other." },
  build(f, { frameAt, out }) {
    const s = frameAt(f.u + 1);
    out.turntables.push({
      kind: "turntable",
      pos: pointInFrame(s, 0, TURNTABLE.thickness / 2 - 0.03).map(r3),
      quat: quatArr(frameQuat(s)),
      radius: TURNTABLE.radius,
      thickness: TURNTABLE.thickness,
      ribs: TURNTABLE.ribs,
      ribHeight: TURNTABLE.ribHeight,
      ribWidth: TURNTABLE.ribWidth,
      ribFrom: TURNTABLE.ribFrom,
      ribTo: TURNTABLE.ribTo,
      hub: TURNTABLE.hub,
      hubHeight: TURNTABLE.hubHeight,
      speed: (out.turntables.length % 2 ? -1 : 1) * TURNTABLE.speed,
      phase: r3((f.u * 0.53) % (Math.PI * 2)),
    });
  },
  physics(world, list, { RAPIER, groups }) {
    const bodies = list.map((tt) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...tt.pos).setRotation(rot(turntableQuat(tt, 0))));
      world.createCollider(solid(RAPIER.ColliderDesc.cylinder(tt.thickness / 2, tt.radius), RAPIER, { friction: 0.9, restitution: this.restitution, group: groups.track }), body);
      for (const r of turntableParts(tt))
        world.createCollider(solid(RAPIER.ColliderDesc.cuboid(r.size[0] / 2, r.size[1] / 2, r.size[2] / 2).setTranslation(...r.pos).setRotation(rot(r.quat)), RAPIER, { friction: 0.6, restitution: 0.45, group: groups.track }), body);
      // The hub: a low dome (a ball, sunk so only its cap shows) that splits the pack toward the rim.
      if (tt.hub) world.createCollider(solid(RAPIER.ColliderDesc.ball(tt.hub).setTranslation(0, tt.thickness / 2 + tt.hubHeight - tt.hub, 0), RAPIER, { friction: 0.3, restitution: 0.5, group: groups.track }), body);
      return body;
    });
    return { kinematics: (t) => list.forEach((tt, k) => bodies[k].setNextKinematicRotation(rot(turntableQuat(tt, t)))) };
  },
};
