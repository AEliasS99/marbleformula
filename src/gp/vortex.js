import { Matrix4, Quaternion, Vector3 } from "three";

// The vortex: a level funnel bowl set into the track. The upper track ends at
// its rim; marbles enter off-centre (a deflector fin sends them to one side),
// spiral down the cone and fall through the throat onto the lower track, which
// resumes under the hole. Shared by the physics (scripts/season.mjs) and the
// renderer (src/gp/Scene.tsx), so the collider and what you see are the same
// surface.
//
// A vortex record: { center: [x, y, z] (rim level, bowl axis), fwd: [x, 0, z]
// (track direction, the entry is behind the centre), radius, hole, depth, lip,
// throat, entryHalf (half-width of the opening in the lip wall) }.

/** Local frame: x along the track, y up, z to the right. */
export function vortexFrame(v) {
  const f = v.fwd;
  const l = Math.hypot(f[0], f[2]) || 1;
  const fwd = [f[0] / l, 0, f[2] / l];
  const right = [-fwd[2], 0, fwd[0]];
  const toWorld = (x, y, z) => [v.center[0] + fwd[0] * x + right[0] * z, v.center[1] + y, v.center[2] + fwd[2] * x + right[2] * z];
  return { fwd, right, toWorld };
}

/**
 * Lathe geometry of the bowl in world space, as { position, index, uv } per
 * part: `cone` (rim to throat), `lip` (the ring wall around the rim, open where
 * the track enters), `throat` (the short vertical tube below the hole) and
 * `rim` (the flat top of the lip wall).
 */
export function vortexGeometry(v, segments = 96) {
  const { toWorld } = vortexFrame(v);
  const part = () => ({ position: [], index: [], uv: [] });
  const parts = { cone: part(), lip: part(), throat: part(), rim: part(), stripe: part() };
  // Entry opening: the arc of the ring behind the centre within the track's half-width.
  const inOpening = (a) => {
    const x = Math.cos(a) * v.radius;
    const z = Math.sin(a) * v.radius;
    return x < 0 && Math.abs(z) < v.entryHalf;
  };
  // Sweeps a profile edge (r0,y0)->(r1,y1) around the axis.
  const band = (g, r0, y0, r1, y1, skip = null, vv = [0, 1]) => {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      if (skip && skip((a0 + a1) / 2)) continue;
      const base = g.position.length / 3;
      for (const [r, y, vy] of [[r0, y0, vv[0]], [r1, y1, vv[1]]])
        for (const a of [a0, a1]) {
          g.position.push(...toWorld(Math.cos(a) * r, y, Math.sin(a) * r));
          g.uv.push(a / (Math.PI * 2), vy);
        }
      // 0: (r0,a0) 1: (r0,a1) 2: (r1,a0) 3: (r1,a1); faces up/inward for the cone, inward for the walls.
      g.index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  };
  // The cone in a few rings, so the lathe reads as a smooth funnel.
  const rings = 6;
  for (let k = 0; k < rings; k++) {
    const t0 = k / rings;
    const t1 = (k + 1) / rings;
    const r0 = v.radius + (v.hole - v.radius) * t0;
    const r1 = v.radius + (v.hole - v.radius) * t1;
    band(parts.cone, r0, -v.depth * t0, r1, -v.depth * t1, null, [t0, t1]);
  }
  band(parts.lip, v.radius, v.lip, v.radius, 0, inOpening);
  band(parts.rim, v.radius + 0.16, v.lip, v.radius, v.lip, inOpening);
  band(parts.lip, v.radius + 0.16, 0, v.radius + 0.16, v.lip, inOpening); // outside of the lip wall
  band(parts.stripe, v.radius + 0.17, v.lip - 0.26, v.radius + 0.17, v.lip - 0.02, inOpening); // hazard band outside, near the top
  band(parts.throat, v.hole, -v.depth, v.hole, -v.depth - v.throat);
  return parts;
}

/**
 * The spiral rail on the cone: a low ridge winding 1.3 turns from near the
 * rim down toward the throat, in the direction the marbles circle (angle
 * decreasing), so they ride round it instead of dropping straight in. It is
 * lower than the agitator's clearance, so the paddles pass over it.
 * Returns the rail's points (world) and its segment boxes for the collider.
 */
// 0.9 of a turn: a 10 % grade along the rail, enough that a marble resting
// against it on the 44° cone keeps rolling (at 1.3 turns, 7 %, one stalled).
export const RAIL = { turns: 0.9, a0: (55 * Math.PI) / 180, rFrom: 0.35, rTo: 0.55, height: 0.17, thick: 0.07, seg: 0.28 };
export function vortexRail(v) {
  const { fwd, right, toWorld } = vortexFrame(v);
  const F = new Vector3(...fwd);
  const Rt = new Vector3(...right);
  const r0 = v.radius - RAIL.rFrom;
  const r1 = v.hole + RAIL.rTo;
  const yAt = (r) => (-v.depth * (v.radius - r)) / (v.radius - v.hole);
  const total = RAIL.turns * Math.PI * 2;
  const pts = [];
  const n = 400;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const a = RAIL.a0 - t * total;
    const r = r0 + (r1 - r0) * t;
    pts.push({ a, local: [Math.cos(a) * r, yAt(r), Math.sin(a) * r] });
  }
  const slope = Math.atan(v.depth / (v.radius - v.hole));
  const up = new Vector3(0, 1, 0);
  const segments = [];
  let acc = 0;
  let from = pts[0];
  for (let k = 1; k < pts.length; k++) {
    acc += Math.hypot(pts[k].local[0] - pts[k - 1].local[0], pts[k].local[1] - pts[k - 1].local[1], pts[k].local[2] - pts[k - 1].local[2]);
    if (acc < RAIL.seg && k < pts.length - 1) continue;
    const to = pts[k];
    const A = new Vector3(...toWorld(...from.local));
    const B = new Vector3(...toWorld(...to.local));
    const am = (from.a + to.a) / 2;
    const radialOut = F.clone().multiplyScalar(Math.cos(am)).addScaledVector(Rt, Math.sin(am)).normalize();
    const nrm = up.clone().multiplyScalar(Math.cos(slope)).addScaledVector(radialOut, -Math.sin(slope)).normalize();
    const tx = B.clone().sub(A);
    const len = tx.length();
    tx.normalize();
    const tz = new Vector3().crossVectors(tx, nrm).normalize();
    const ty = new Vector3().crossVectors(tz, tx).normalize();
    const q = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(tx, ty, tz));
    const pos = A.clone().add(B).multiplyScalar(0.5).addScaledVector(ty, RAIL.height / 2);
    segments.push({ pos: [pos.x, pos.y, pos.z], quat: [q.x, q.y, q.z, q.w], size: [len + 0.02, RAIL.height, RAIL.thick] });
    acc = 0;
    from = to;
  }
  return { points: pts.map((p) => toWorld(...p.local)), segments };
}

/** One triangle soup of every part, for the collider. */
export function vortexSoup(v) {
  const { stripe, ...parts } = vortexGeometry(v, 64);
  void stripe; // decoration only
  const vertices = [];
  const indices = [];
  for (const g of Object.values(parts)) {
    const base = vertices.length / 3;
    for (const x of g.position) vertices.push(x);
    for (const i of g.index) indices.push(base + i);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/** The vortex agitator's orientation at time t: about the bowl's axis. */
export function agitatorQuat(v, t) {
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), v.agitator.phase + v.agitator.speed * t);
  return [q.x, q.y, q.z, q.w];
}
/** Each paddle's pose in the agitator's frame: tilted to hug the cone, `clearance` above it. */
export function agitatorArm(v, k) {
  const a = v.agitator;
  const slope = Math.atan(v.depth / (v.radius - v.hole));
  const yAt = (r) => -v.depth * (v.radius - r) / (v.radius - v.hole);
  const rMid = (a.rIn + a.rOut) / 2;
  const len = (a.rOut - a.rIn) / Math.cos(slope);
  const yaw = (k / a.arms) * Math.PI * 2;
  // Local: x radial outward (tilted up the cone), y normal to the cone, z tangential.
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), slope));
  const pos = [Math.cos(yaw) * rMid, yAt(rMid) + a.clearance / Math.cos(slope) + a.height / 2, Math.sin(yaw) * rMid];
  return { pos, quat: [q.x, q.y, q.z, q.w], size: [len, a.height, a.thickness] };
}
