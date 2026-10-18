// Turns a real circuit outline (GeoJSON from bacinger/f1-circuits, MIT) into a
// marble track centreline: projected to metres, scaled down, and "marble-ized"
// so it is physically raceable while keeping the circuit's recognizable shape.
import { readFileSync } from "node:fs";

export const SCALE = 0.056; // sim units per real metre (a 5.8 km lap → ~325 units)
export const TRACK_WIDTH = 4.2; // six marbles abreast
export const MIN_RADIUS = 3.1; // centreline; keeps the inside edge from folding over
export const MIN_SEPARATION = 6.0; // between unrelated parts of the track (width + barriers)
export const BRIDGE_CLEARANCE = 2.2; // parts this far apart vertically may overlap (Suzuka)
export const SLOPE = (6.5 * Math.PI) / 180; // steady descent between drops: gravity is the only engine

const SPACING = 1.0;

/** Loads a GeoJSON LineString and projects lon/lat to local metres (equirectangular). */
export function loadOutline(file) {
  const g = JSON.parse(readFileSync(file, "utf8"));
  const feature = g.features[0];
  const coords = feature.geometry.coordinates;
  const R = 6371000;
  const lat0 = (coords[0][1] * Math.PI) / 180;
  const pts = coords.map(([lon, lat]) => [
    ((lon * Math.PI) / 180) * R * Math.cos(lat0),
    -((lat * Math.PI) / 180) * R, // north is -z in the 3D world, so the map isn't mirrored
  ]);
  const first = pts[0];
  const lastPt = pts[pts.length - 1];
  if (Math.hypot(first[0] - lastPt[0], first[1] - lastPt[1]) < 1) pts.pop();
  // Centre on the origin: Rapier works in 32-bit floats, and at raw projected
  // coordinates (~10^5 m) a marble's per-step movement rounds away to nothing.
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return { props: feature.properties, pts: pts.map(([x, z]) => [x - cx, z - cz]) };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Resamples a closed polyline at uniform arc-length spacing. */
export function resampleLoop(pts, spacing) {
  const segs = [];
  let L = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = dist(a, b);
    segs.push({ a, b, s0: L, d });
    L += d;
  }
  const n = Math.max(8, Math.round(L / spacing));
  const step = L / n;
  const out = [];
  let k = 0;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    while (k < segs.length - 1 && segs[k].s0 + segs[k].d < s) k++;
    const { a, b, s0, d } = segs[k];
    const t = d > 0 ? (s - s0) / d : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return { pts: out, length: L };
}

/** Radius of the circle through three points (Infinity when collinear). */
export function radius3(a, b, c) {
  const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  if (area < 1e-9) return Infinity;
  return (dist(a, b) * dist(b, c) * dist(c, a)) / (4 * area);
}

/**
 * Elastic-band relaxation. Each point is pulled toward its original position,
 * straightened where the curve is tighter than MIN_RADIUS, and pushed away from
 * unrelated parts of the track closer than MIN_SEPARATION — unless they're far
 * apart in height (a crossover bridge), since the track descends as it goes.
 */
export function marbleize(rawPts, scale = SCALE) {
  const scaled = rawPts.map(([x, z]) => [x * scale, z * scale]);
  let { pts, length } = resampleLoop(scaled, SPACING);
  const anchors = pts.map((p) => [...p]);
  const crossings = findCrossings(anchors);
  const isBridge = bridgeTest(crossings, length);
  const anchorAt = (i, n) => anchors[Math.round((i / n) * anchors.length) % anchors.length];

  for (let it = 0; it < 2400; it++) {
    const n = pts.length;
    const force = pts.map(() => [0, 0]);

    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = anchorAt(i, n);
      force[i][0] += 0.08 * (a[0] - p[0]);
      force[i][1] += 0.08 * (a[1] - p[1]);
      // Straighten only the spots tighter than MIN_RADIUS (±2 neighbours ≈ ±2 units);
      // everywhere else just iron out polyline kinks very gently. Whatever stays
      // tighter is handled by the mesh, which narrows the inside of the hairpin.
      const pa = pts[(i - 2 + n) % n];
      const pb = pts[(i + 2) % n];
      const r = radius3(pa, p, pb);
      const k = r < MIN_RADIUS * 1.2 ? 0.45 : 0.004;
      force[i][0] += k * ((pa[0] + pb[0]) / 2 - p[0]);
      force[i][1] += k * ((pa[1] + pb[1]) / 2 - p[1]);
    }

    // Keep unrelated parts apart. "Related" = within ~a hairpin's arc length.
    const near = Math.ceil((Math.PI * MIN_SEPARATION) / 2 / (length / n)) + 2;
    for (let i = 0; i < n; i++) {
      for (let j = i + near; j < n; j++) {
        if (n - (j - i) < near) continue; // wraps around the seam
        const d = dist(pts[i], pts[j]);
        if (d >= MIN_SEPARATION) continue;
        if (isBridge(i / n, j / n)) continue;
        const push = (0.3 * (MIN_SEPARATION - d)) / 2;
        const ux = d > 1e-6 ? (pts[i][0] - pts[j][0]) / d : 1;
        const uz = d > 1e-6 ? (pts[i][1] - pts[j][1]) / d : 0;
        force[i][0] += ux * push;
        force[i][1] += uz * push;
        force[j][0] -= ux * push;
        force[j][1] -= uz * push;
      }
    }

    pts = pts.map((p, i) => [p[0] + force[i][0], p[1] + force[i][1]]);
    if (it % 10 === 9) ({ pts, length } = resampleLoop(pts, SPACING));
  }
  ({ pts, length } = resampleLoop(pts, SPACING));
  return { pts, length, scaled, crossings };
}

/** Where the real outline crosses itself (Suzuka's figure eight), as lap fractions. */
export function findCrossings(pts) {
  const n = pts.length;
  const out = [];
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = pts[j];
      const d = pts[(j + 1) % n];
      if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) {
        out.push([i / n, j / n]);
      }
    }
  }
  return out;
}

/** Pairs of lap fractions within ~8 units of a real crossing may overlap in plan view. */
export function bridgeTest(crossings, length) {
  const w = 8 / length;
  return (fa, fb) =>
    crossings.some(
      ([ca, cb]) =>
        (Math.abs(fa - ca) < w && Math.abs(fb - cb) < w) || (Math.abs(fa - cb) < w && Math.abs(fb - ca) < w),
    );
}

/** Diagnostics: tightest radius and closest approach between unrelated parts. */
export function checkLoop(pts, length, crossings = []) {
  const n = pts.length;
  const isBridge = bridgeTest(crossings, length);
  let minR = Infinity;
  for (let i = 0; i < n; i++) minR = Math.min(minR, radius3(pts[(i - 3 + n) % n], pts[i], pts[(i + 3) % n]));
  let minSep = Infinity;
  let bridged = 0;
  const near = Math.ceil((Math.PI * MIN_SEPARATION) / 2 / (length / n)) + 2;
  for (let i = 0; i < n; i++)
    for (let j = i + near; j < n; j++) {
      if (n - (j - i) < near) continue;
      const d = dist(pts[i], pts[j]);
      if (isBridge(i / n, j / n)) {
        if (d < MIN_SEPARATION) bridged++;
        continue;
      }
      minSep = Math.min(minSep, d);
    }
  return { minR, minSep, bridged };
}

/** Signed area > 0 means the outline runs clockwise on screen (x right, z down). */
export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
