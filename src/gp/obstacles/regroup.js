import { frameQuat, pointInFrame, quatArr, r3, rot, TRACK } from "./kit.js";

// Regroup gate: a hazard bar across the track that holds the leaders until
// `need` of the field still racing has caught up (or `hold` seconds after the
// first arrival), then lifts; it re-arms for every lap. Keeps the race a race.
export const REGROUP = { count: 2, need: 0.6, hold: 7, lift: 1.7, time: 0.5, size: [0.12, 0.9, 0.0] };
// Barriers are thin on screen but deep in the collider (extending away from
// the pile): a pile pressing on a thin box pops marbles out the far side.
const BARRIER_DEPTH = 0.6;

export default {
  type: "regroup",
  label: "REGROUP GATE",
  place: { before: 6, after: 2, maxCurv: 0.07, once: true, perLap: REGROUP.count }, // a bar works in a bend
  guard: [-8, 1, 2.0], // twenty marbles piled three high behind the bar
  dq: false,
  collection: "regroups",
  card: { difficulty: 1, chaos: 3, seconds: 5, summary: "Holds the leaders until the pack catches up, then lifts: everybody back in the fight." },
  build(f, { frameAt, out }) {
    const W2 = TRACK.width / 2;
    const s = frameAt(f.u);
    out.regroups.push({
      kind: "regroup",
      u: r3(f.u),
      pos: pointInFrame(s, 0, REGROUP.size[1] / 2 + 0.02).map(r3),
      quat: quatArr(frameQuat(s)),
      size: [REGROUP.size[0], REGROUP.size[1], 2 * W2 - 0.08],
      lift: REGROUP.lift,
      time: REGROUP.time,
    });
  },
  physics(world, list, { RAPIER, groups, samples, GRID_LENGTH, SAMPLE, FPS }) {
    const bodies = list.map((g) => {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...g.pos).setRotation(rot(g.quat)));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(BARRIER_DEPTH / 2, g.size[1] / 2, g.size[2] / 2)
          .setTranslation(BARRIER_DEPTH / 2 - g.size[0] / 2, 0, 0)
          .setFriction(0.2)
          .setRestitution(0.2)
          .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setCollisionGroups(groups.track),
        body,
      );
      return body;
    });
    const state = list.map(() => ({ first: null, open: null, opens: [], firsts: [], lift: 0, lifts: [] }));
    return {
      /** Once a frame: count who has reached each bar; open on quorum or timeout; re-arm for the next lap. */
      frame(f, { frames, finishFrame, dqFrame, uLocal, nMarbles }) {
        list.forEach((g, k) => {
          const st = state[k];
          // Re-arm for the next lap once everyone still racing has gone past (or is behind, a lap down).
          if (st.open !== null && f - st.open > 4 * FPS && frames[f].every((m, i) => finishFrame[i] !== null || dqFrame[i] !== null || uLocal(m[7]) > g.u + 3 || uLocal(m[7]) < g.u - 30)) {
            st.opens.push(st.open);
            st.firsts.push(st.first);
            st.open = null;
            st.first = null;
          }
          // The bar's lift, 0..1, eased toward open or closed; the renderer replays this exact curve.
          {
            const target = st.open !== null ? 1 : 0;
            const stepMax = 1 / (REGROUP.time * FPS);
            st.lift += Math.max(-stepMax, Math.min(stepMax, target - st.lift));
            st.lifts.push(r3(st.lift * st.lift * (3 - 2 * st.lift)));
          }
          if (st.open !== null) return;
          let racing = 0;
          for (let i = 0; i < nMarbles; i++) if (finishFrame[i] === null && dqFrame[i] === null) racing++;
          const here = frames[f].filter((m, i) => finishFrame[i] === null && dqFrame[i] === null && uLocal(m[7]) >= g.u - 1.6 && uLocal(m[7]) < g.u + 2).length;
          if (here > 0 && st.first === null) st.first = f;
          if (st.first !== null && (here >= Math.ceil(REGROUP.need * racing) || f - st.first >= REGROUP.hold * FPS)) st.open = f;
        });
      },
      kinematics: () =>
        list.forEach((g, k) => {
          const st = state[k];
          const lift = g.lift * (st.lifts[st.lifts.length - 1] ?? 0);
          const n = samples[Math.round((g.u + GRID_LENGTH) / SAMPLE)].n;
          bodies[k].setNextKinematicTranslation({ x: g.pos[0] + n[0] * lift, y: g.pos[1] + n[1] * lift, z: g.pos[2] + n[2] * lift });
        }),
      /** What the renderer needs: the bar's curve and every pass's first arrival and opening. */
      export: () => list.map((g, k) => ({ ...g, firstFrame: state[k].first, openFrame: state[k].open, opens: state[k].opens, firsts: state[k].firsts, lifts: state[k].lifts })),
    };
  },
};
