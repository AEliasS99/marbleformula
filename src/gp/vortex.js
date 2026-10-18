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
