import { frameQuat, mod, pointInFrame, quatArr, r3, rot, solid, TRACK } from "./kit.js";

// A block that slides out from one wall across most of the track and back,
// timed to be fully out as the leader arrives.
export const PUSHER = { size: [1.2, 0.6, 0.3], travel: 2.6, period: 1.7 };

/** Its position at time t: out of the wall by travel·(1−cos)/2. */
export function pusherPos(p, t) {
  const k = (1 - Math.cos((2 * Math.PI * t) / p.period + p.phase)) / 2;
  const d = p.travel * k;
  return { x: p.pos[0] + p.dir[0] * d, y: p.pos[1] + p.dir[1] * d, z: p.pos[2] + p.dir[2] * d };
}

export default {
  type: "pusher",
  label: "THE PUSHER",
  place: { before: 1, after: 3, maxCurv: 0.035, always: true },
  guard: [-1, 4],
  dq: true,
  restitution: 0.2,
  collection: "pushers",
  card: { difficulty: 3, chaos: 3, seconds: 1.2, summary: "A piston block that shoves the leaders into the far wall." },
  build(f, { frameAt, out, sync }) {
    const s = frameAt(f.u + 1);
    const W2 = s.w ?? TRACK.width / 2;
    const side = out.pushers.length % 2 ? 1 : -1;
    out.pushers.push({
      kind: "pusher",
      // Rest position: flush with the wall it comes out of.
      pos: pointInFrame(s, side * (W2 - PUSHER.size[2] / 2 - 0.02), PUSHER.size[1] / 2 + 0.02).map(r3),
      dir: [-side * s.r[0], -side * s.r[1], -side * s.r[2]].map(r3),
      quat: quatArr(frameQuat(s)),
      size: PUSHER.size,
      travel: PUSHER.travel,
      period: PUSHER.period,
      // Fully out as the leader arrives (the cosine's trough).
      phase: r3(sync[f.u] !== undefined ? mod(Math.PI - (2 * Math.PI * sync[f.u]) / PUSHER.period, 2 * Math.PI) : (f.u * 0.71) % (Math.PI * 2)),
    });
  },
  physics(world, list, { RAPIER, groups }) {
    const bodies = list.map((p) => {
      const at = pusherPos(p, 0);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, at.y, at.z).setRotation(rot(p.quat)));
      world.createCollider(solid(RAPIER.ColliderDesc.cuboid(p.size[0] / 2, p.size[1] / 2, p.size[2] / 2), RAPIER, { friction: 0.3, restitution: this.restitution, group: groups.track }), body);
      return body;
    });
    return { kinematics: (t) => list.forEach((p, k) => bodies[k].setNextKinematicTranslation(pusherPos(p, t))) };
  },
};
