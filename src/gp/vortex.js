import { Matrix4, Quaternion, Vector3 } from "three";

// The vortex: a drain. A level bowl with a hyperbolic profile (the shape of a
// coin "spiral wishing well") set into the track. The upper track ends at its
// rim; a deflector fin sends the field in along the rim, and on this profile a
// marble orbits: the orbit speed needed at radius r is sqrt(g·k/r), so as
// rolling resistance bleeds speed it spirals slowly inward, faster and faster,
// round and round, until it drops through the throat onto the lower track,
// which resumes under the hole. Fast arrivals ride the outer wall and crash
// into the slower ones circling below. Shared by the physics (scripts/season.mjs) and the
// renderer (src/gp/Scene.tsx), so the collider and what you see are the same
// surface.
//
// A vortex record: { center: [x, y, z] (rim level, bowl axis), fwd: [x, 0, z]
// (track direction, the entry is behind the centre), radius, hole, k (the
// profile's constant), depth (rim to throat), lip, throat, entryHalf (half-width
// of the opening in the lip wall), agitator }.

/** Height of the bowl's surface below the rim at radius r: -k (1/r - 1/R). */
export const vortexY = (v, r) => -v.k * (1 / Math.max(r, v.hole) - 1 / v.radius);
/** Its slope dy/dr = k / r² (positive: the surface rises outward). */
const vortexSlope = (v, r) => v.k / (r * r);

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
  const parts = { cone: part(), lip: part(), throat: part(), rim: part(), stripe: part(), apron: part(), chute: part() };
  // Entry opening: the arc of the ring behind the centre within the track's half-width.
  const inOpening = (a) => {
    const x = Math.cos(a) * v.radius;
    const z = Math.sin(a) * v.radius;
    const lo = v.entryLo ?? -v.entryHalf;
    const hi = v.entryHi ?? v.entryHalf;
    return x < 0 && z > lo && z < hi;
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
  // The funnel in many rings, closer together toward the throat where it steepens.
  const rings = 28;
  const rAt = (t) => v.radius * Math.pow(v.hole / v.radius, t); // geometric spacing
  for (let k = 0; k < rings; k++) {
    const t0 = k / rings;
    const t1 = (k + 1) / rings;
    const r0 = rAt(t0);
    const r1 = rAt(t1);
    band(parts.cone, r0, vortexY(v, r0), r1, vortexY(v, r1), null, [t0, t1]);
  }
  band(parts.lip, v.radius, v.lip, v.radius, 0, inOpening);
  band(parts.rim, v.radius + 0.16, v.lip, v.radius, v.lip, inOpening);
  band(parts.lip, v.radius + 0.16, 0, v.radius + 0.16, v.lip, inOpening); // outside of the lip wall
  band(parts.stripe, v.radius + 0.17, v.lip - 0.26, v.radius + 0.17, v.lip - 0.02, inOpening); // hazard band outside, near the top
  band(parts.throat, v.hole, -v.depth, v.hole, -v.depth - v.throat);
  // The chute: the track's right wall carried on, straight, to the lip's tangent
  // point, and a flat apron at rim level between the track end and the rim.
  if (v.chute) {
    const { x0, z: zw } = v.chute;
    const quad = (g, a, b, c, d) => {
      const base = g.position.length / 3;
      for (const p of [a, b, c, d]) {
        g.position.push(...toWorld(...p));
        g.uv.push(0, 0);
      }
      g.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const n = 16;
    for (let k = 0; k < n; k++) {
      const xa = x0 + ((0 - x0) * k) / n;
      const xb = x0 + ((0 - x0) * (k + 1)) / n;
      const za = Math.sqrt(Math.max(0, v.radius * v.radius - xa * xa)) - 0.02;
      const zb = Math.sqrt(Math.max(0, v.radius * v.radius - xb * xb)) - 0.02;
      // Floor (facing up): from the rim out to the wall.
      quad(parts.apron, [xa, 0, za], [xa, 0, zw], [xb, 0, zw], [xb, 0, zb]);
    }
    // Wall inner face (facing the bowl, -z) and outer face.
    quad(parts.chute, [x0, 0, zw], [x0, v.lip, zw], [0, v.lip, zw], [0, 0, zw]);
    quad(parts.chute, [x0, 0, zw + 0.16], [0, 0, zw + 0.16], [0, v.lip, zw + 0.16], [x0, v.lip, zw + 0.16]);
  }
  return parts;
}

/** One triangle soup of every part, for the collider. */
export function vortexSoup(v, which = "all") {
  const { stripe, ...all } = vortexGeometry(v, 64);
  void stripe; // decoration only
  // "floor": what marbles roll on; "walls": what they ride along (lip, rim, chute).
  const pick = { all: Object.keys(all), floor: ["cone", "throat", "apron"], walls: ["lip", "rim", "chute"] }[which];
  const parts = Object.fromEntries(pick.map((k) => [k, all[k]]));
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
/**
 * Each paddle, as segments that follow the bowl's curve a hair above it (so
 * they catch every marble in their path instead of passing over), in the
 * agitator's frame: { pos, quat, size } per segment, the last one the tip.
 */
export function agitatorArm(v, k) {
  const a = v.agitator;
  const yaw = (k / a.arms) * Math.PI * 2;
  const qYaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -yaw);
  const n = 8;
  const segs = [];
  for (let j = 0; j < n; j++) {
    const r0 = a.rIn + ((a.rOut - a.rIn) * j) / n;
    const r1 = a.rIn + ((a.rOut - a.rIn) * (j + 1)) / n;
    const rm = (r0 + r1) / 2;
    const dir = new Vector3(r1 - r0, vortexY(v, r1) - vortexY(v, r0), 0);
    const len = dir.length();
    dir.normalize();
    // Surface normal at the middle (in the radial–vertical plane, tilted inward).
    const nrm = new Vector3(-vortexSlope(v, rm), 1, 0).normalize();
    const tz = new Vector3().crossVectors(dir, nrm).normalize();
    const ty = new Vector3().crossVectors(tz, dir).normalize();
    const q = qYaw.clone().multiply(new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(dir, ty, tz)));
    const mid = new Vector3(rm, vortexY(v, rm), 0).addScaledVector(nrm, a.clearance + a.height / 2).applyQuaternion(qYaw);
    segs.push({ pos: [mid.x, mid.y, mid.z], quat: [q.x, q.y, q.z, q.w], size: [len + 0.03, a.height, a.thickness] });
  }
  return segs;
}
