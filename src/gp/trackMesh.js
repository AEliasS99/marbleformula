// Shared by the physics (scripts/season.mjs) and the renderer (src/gp/Scene.tsx),
// so the collider and what you see are built from exactly the same vertices.
//
// A track is a list of samples along its centreline, each with a position `p`
// (the middle of the floor), a frame (`r` = right across the track, `n` = up
// out of the floor), its arc length `u`, and its half-width `w` (the start
// area is wider, for one lane per marble). Every sample is swept with the same
// cross section: a flat floor, straight walls, a small fillet where they meet
// (so a marble can never wedge in the corner) and a thin shell outside.

export const TRACK = {
  width: 4.2, // usual floor width, wall to wall
  wallHeight: 0.58, // sleek F1 / Alpine barrier height so trackside scenery is clearly visible over the walls
  fillet: 0.14,
  wall: 0.16, // shell thickness
};
const HALF = TRACK.width / 2;
export const TRACK_DEPTH = TRACK.wallHeight;
export const BANK_PIVOT = 0; // flat floor: banking turns about the floor's centre line

const FILLET_STEPS = 4; // physics; the renderer asks for smoother corners

/** Height of the inner surface above the floor at a lateral offset (flat, bar the fillets). */
export function surfaceHeight(lateral, w = HALF) {
  const x = Math.abs(lateral);
  const F = TRACK.fillet;
  if (x <= w - F) return 0;
  const d = Math.min(x - (w - F), F);
  return F - Math.sqrt(Math.max(0, F * F - d * d));
}

/**
 * Cross section for a half-width w: `inner` runs left wall top → down → fillet
 * → floor → fillet → up → right wall top, as [lateral, up, v] (v = 0..1 along
 * it); `outer` is the same pushed out by the shell thickness. Every width gives
 * the same number of points, so neighbouring rings join up.
 */
export function troughProfile(steps = FILLET_STEPS, w = HALF, wallHeight = TRACK.wallHeight) {
  const F = TRACK.fillet;
  const H = wallHeight;
  const T = TRACK.wall;
  const corner = (side, r) => {
    // Quarter circle from the wall (going down) to the floor (going inward).
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI / 2) * (i / steps); // 0 = on the wall, 90° = on the floor
      pts.push([side * (w - F + Math.cos(a) * r), F - Math.sin(a) * r]);
    }
    return side < 0 ? pts : pts.reverse();
  };
  const innerPts = [[-w, H], ...corner(-1, F), ...corner(1, F), [w, H]];
  const outerPts = [[-w - T, H], ...corner(-1, F + T), ...corner(1, F + T), [w + T, H]];
  let len = 0;
  const acc = [0];
  for (let i = 1; i < innerPts.length; i++) {
    len += Math.hypot(innerPts[i][0] - innerPts[i - 1][0], innerPts[i][1] - innerPts[i - 1][1]);
    acc.push(len);
  }
  return { inner: innerPts.map((p, i) => [p[0], p[1], acc[i] / len]), outer: outerPts };
}

/** Where the flat floor starts and ends along the inner profile's v (for painting lanes). */
export function floorVRange(w = HALF) {
  const { inner } = troughProfile(FILLET_STEPS, w);
  const onFloor = inner.filter((p) => p[1] < 1e-6);
  return [onFloor[0][2], onFloor[onFloor.length - 1][2]];
}

/**
 * How far each side may extend at sample k before folding over the centre of
 * a tight bend: the inside stops short of it, narrowing the apex of a hairpin
 * slightly instead of producing self-intersecting geometry.
 */
function sideLimits(samples) {
  const raw = samples.map((s) => {
    const r = Math.abs(s.curv) > 1e-6 ? 1 / Math.abs(s.curv) : Infinity;
    const lim = r - 0.3;
    return s.curv > 0 ? [Infinity, lim] : [lim, Infinity]; // [left, right]
  });
  return raw.map((_, k) => {
    let l = Infinity;
    let r = Infinity;
    for (let j = -3; j <= 3; j++) {
      const q = raw[Math.max(0, Math.min(raw.length - 1, k + j))];
      l = Math.min(l, q[0]);
      r = Math.min(r, q[1]);
    }
    return [l, r];
  });
}
const clampLateral = (l, [left, right]) => (l > 0 ? Math.min(l, right) : -Math.min(-l, left));

const at = (s, lateral, up) => [
  s.p[0] + s.r[0] * lateral + s.n[0] * up,
  s.p[1] + s.r[1] * lateral + s.n[1] * up,
  s.p[2] + s.r[2] * lateral + s.n[2] * up,
];

/**
 * Builds the swept mesh. Returns per-part geometry ({ position, uv, index })
 * for rendering — `floor` (inner surface), `rim` (wall tops), `shell` (outside),
 * `caps` (end plates) — plus one merged triangle soup for the physics collider.
 * UVs: u = units along the track / 4, v = 0..1 across.
 */
export function buildTrackMesh(samples, { arcSteps = FILLET_STEPS, endCaps = true, wallHeight = TRACK.wallHeight } = {}) {
  const limits = sideLimits(samples);
  const parts = { floor: geo(), rim: geo(), shell: geo() };
  const profiles = samples.map((s) => troughProfile(arcSteps, s.w ?? HALF, wallHeight));

  const strip = (g, ringOf, vOf) => {
    const base = g.position.length / 3;
    let width = 0;
    samples.forEach((s, k) => {
      const ring = ringOf(profiles[k]);
      width = ring.length;
      ring.forEach((pt, j) => {
        g.position.push(...at(s, clampLateral(pt[0], limits[k]), pt[1]));
        g.uv.push(s.u / 4, vOf(pt, j, ring.length));
      });
    });
    for (let k = 0; k < samples.length - 1; k++) {
      // A gap (the track ends at a vortex bowl and resumes under its hole):
      // no quads where both ends are gap samples.
      if (samples[k].gap && samples[k + 1].gap) continue;
      for (let j = 0; j < width - 1; j++) {
        const a = base + k * width + j;
        const b = a + width;
        g.index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  };

  strip(parts.floor, (p) => p.inner, (pt) => pt[2]);
  // Outer shell runs right to left so its faces point outward.
  strip(parts.shell, (p) => [...p.outer].reverse(), (_, j, n) => j / (n - 1));
  // Wall tops close the gap between inner and outer at each side.
  strip(parts.rim, (p) => [p.outer[0], p.inner[0]], (_, j) => j);
  strip(parts.rim, (p) => [p.inner[p.inner.length - 1], p.outer[p.outer.length - 1]], (_, j) => j);

  // End caps: a plate across the whole section (stops marbles behind the grid
  // and at the end of the run-off).
  const caps = geo();
  // No end plates when the lift cabin docks at both ends of the track.
  const capAt = endCaps
    ? [
        [samples[0], 0, false],
        [samples[samples.length - 1], samples.length - 1, true],
      ]
    : [];
  // Where the track resumes after a gap, a plate closes its open end.
  for (let k = 0; k < samples.length - 1; k++) if (samples[k].gap && !samples[k + 1].gap) capAt.push([samples[k], k, false]);
  for (const [s, k, flip] of capAt) {
    const { outer } = profiles[k];
    const base = caps.position.length / 3;
    const ring = [...outer, [outer[outer.length - 1][0], TRACK_DEPTH], [outer[0][0], TRACK_DEPTH]];
    caps.position.push(...at(s, 0, TRACK_DEPTH * 0.5));
    caps.uv.push(0, 0);
    for (const pt of ring) {
      caps.position.push(...at(s, clampLateral(pt[0], limits[k]), pt[1]));
      caps.uv.push(0, 0);
    }
    for (let j = 0; j < ring.length; j++) {
      const a = base + 1 + j;
      const b = base + 1 + ((j + 1) % ring.length);
      caps.index.push(...(flip ? [base, a, b] : [base, b, a]));
    }
  }
  parts.caps = caps;

  const vertices = [];
  const indices = [];
  for (const g of Object.values(parts)) {
    const base = vertices.length / 3;
    for (const v of g.position) vertices.push(v); // no spread: these arrays get huge
    for (const i of g.index) indices.push(base + i);
  }
  return { parts, physics: { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) } };
}

function geo() {
  return { position: [], uv: [], index: [] };
}

/** World position `up` above the inner surface at a lateral offset. */
export const pointOnTrack = (s, lateral, up = 0) => at(s, lateral, surfaceHeight(lateral, s.w ?? HALF) + up);

/** World position in the sample's frame, without following the surface. */
export const pointInFrame = at;

/**
 * Chain lift: an uphill section with a belt and cleats that push marbles up.
 * Cleat k at time t: travels up the ramp, rising out of the floor at the
 * bottom and sinking back in at the top, then returns hidden. `frameAt(u)`
 * gives the track frame at any u. Returns { pos, quat, visible }.
 */
export function liftCleatPose(lift, k, t, frameAt) {
  // Cleats come up out of the floor `lead` units before the ramp starts — on
  // the downhill where no marble rests, well behind the pile waiting in the dip
  // at its foot — rising gently over `rise` units, and push them all the way up.
  const lead = lift.lead ?? 1.4;
  const rise = lift.rise ?? 0.5;
  const path = lift.len + lead;
  const loop = lift.count * lift.spacing;
  const s = (((lift.speed * t + k * lift.spacing) % loop) + loop) % loop;
  if (s > path) return { pos: [0, -500 - k, 0], quat: [0, 0, 0, 1], visible: false };
  const smooth = (x) => {
    const c = Math.min(Math.max(x, 0), 1);
    return c * c * (3 - 2 * c);
  };
  const e = smooth(s / rise) * smooth((path - s) / 0.5);
  const up = -0.3 + 0.48 * e; // cleat centre above the floor (its top goes from below the floor to +0.35)
  const u = lift.u0 - lead + s;
  const A = frameAt(u - 0.2);
  const B = frameAt(u + 0.2);
  const F = frameAt(u);
  const tx = norm([B.p[0] - A.p[0], B.p[1] - A.p[1], B.p[2] - A.p[2]]);
  const r = norm(F.r);
  const n = norm(cross(r, tx));
  const pos = [F.p[0] + n[0] * up, F.p[1] + n[1] * up, F.p[2] + n[2] * up];
  return { pos, quat: basisQuat(tx, n, r), visible: e > 0.02 };
}
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Quaternion [x,y,z,w] of the rotation whose columns are x, y, z. */
function basisQuat(x, y, z) {
  const m00 = x[0], m01 = y[0], m02 = z[0];
  const m10 = x[1], m11 = y[1], m12 = z[1];
  const m20 = x[2], m21 = y[2], m22 = z[2];
  const tr = m00 + m11 + m22;
  if (tr > 0) {
    const s = 0.5 / Math.sqrt(tr + 1);
    return [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s];
  }
  if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    return [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  }
  if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    return [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  }
  const s2 = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return [(m02 + m20) / s2, (m12 + m21) / s2, 0.25 * s2, (m10 - m01) / s2];
}
