import { frameQuat, mod, pointInFrame, quatArr, r3, rot, solid, TRACK } from "./kit.js";

// The switch (it replaces the regroup gate, whose full stop broke the race's
// flow): two half-width bars across the track that rise out of the floor and
// sink back, alternating. One half is always open. A marble that reaches the
// closed half waits a moment or bounces across; the one on the open half goes
// straight through, so positions shuffle without stopping the race. A bar
// rising under a marble just pops it over (a sliding block would have crushed
// marbles against the wall).
export const SWITCH = { height: 0.9, thick: 0.14, period: 2.2, swap: 0.25, sink: 1.0 };

/** How far each half is raised at time t, 0 (sunk) .. 1 (closed): [left, right]. */
export function switchState(sw, t) {
  const p = mod(t / sw.period + sw.phase, 1); // 0..1
  const half = 0.5;
  const ramp = SWITCH.swap / sw.period;
  // Left closed in the first half of the cycle, right in the second, with smooth swaps.
  const s = (x) => Math.min(1, Math.max(0, x));
  const left = p < half ? s(p / ramp) * s((half - p) / ramp) : 0;
  const right = p >= half ? s((p - half) / ramp) * s((1 - p) / ramp) : 0;
  return [left, right];
}

export default {
  type: "switch",
  label: "THE SWITCH",
  place: { before: 3, after: 2, maxCurv: 0.07 },
  guard: [-1, 3],
  dq: false,
  restitution: 0.3,
  collection: "switches",
  card: { difficulty: 2, chaos: 3, seconds: 1, summary: "Two half-width bars rise and sink in turn: pick the open half or wait." },
  build(f, { frameAt, out, sync }) {
    const s = frameAt(f.u);
    const W2 = s.w ?? TRACK.width / 2;
    out.switches.push({
      kind: "switch",
      u: r3(f.u),
      quat: quatArr(frameQuat(s)),
      halves: [-1, 1].map((side) => pointInFrame(s, (side * W2) / 2, SWITCH.height / 2).map(r3)),
      up: s.n.map(r3),
      size: [SWITCH.thick, SWITCH.height, r3(W2 - 0.04)],
      period: SWITCH.period,
      // The leader meets the swap (both halves moving) as it arrives.
      phase: r3(sync[f.u] !== undefined ? mod(0.5 - sync[f.u] / SWITCH.period, 1) : (f.u * 0.13) % 1),
    });
  },
  physics(world, list, { RAPIER, groups }) {
    const bodies = list.map((sw) =>
      sw.halves.map((p) => {
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...p).setRotation(rot(sw.quat)));
        world.createCollider(solid(RAPIER.ColliderDesc.cuboid(sw.size[0] / 2, sw.size[1] / 2, sw.size[2] / 2), RAPIER, { friction: 0.2, restitution: this.restitution, group: groups.track }), body);
        return body;
      }),
    );
    return {
      kinematics: (t) =>
        list.forEach((sw, k) => {
          const st = switchState(sw, t);
          sw.halves.forEach((p, h) => {
            const d = -SWITCH.sink * (1 - st[h]);
            bodies[k][h].setNextKinematicTranslation({ x: p[0] + sw.up[0] * d, y: p[1] + sw.up[1] * d, z: p[2] + sw.up[2] * d });
          });
        }),
    };
  },
};
