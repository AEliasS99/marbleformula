// Where the venue buildings stand, shared by the renderer (src/gp/Trackside.tsx)
// and the director in scripts/season.mjs: cameras must never be placed inside
// a grandstand or the pit building, and the director only knows the track's
// collider, so it asks here for the buildings' footprints.

import { TRACK } from "./trackMesh.js";

const W2 = TRACK.width / 2;
const flat = (v) => {
  const l = Math.hypot(v[0], v[2]) || 1;
  return [v[0] / l, 0, v[2] / l];
};

/**
 * Yaw (rotation about y) that turns a building's local +x along the track
 * direction `t`, which leaves local +z along the track's right vector.
 */
export const yawAlong = (t) => Math.atan2(-t[2], t[0]);

/**
 * Stands on the two longest low straight stretches, the pit building by the
 * finish straight. Positions are world vectors [x, y, z]; `yaw` is from
 * yawAlong, so local x runs along the track and local z across it (`side`
 * says on which side the building stands: its front is at local z of
 * -side, its back at +side). Every building also lists its `box`:
 * local-frame bounds {x: [min, max], y: [...], z: [...]} around `base`.
 * A building is only placed where no other part of the circuit passes
 * through its footprint.
 */
export function venueLayout(samples, L) {
  const groundY = Math.min(...samples.map((s) => s.p[1])) - 1.4;
  const at = (u) => samples[Math.max(0, Math.min(samples.length - 1, Math.round((u - samples[0].u) / 0.5)))];
  const place = (s, side, out) => {
    const r = flat(s.r);
    return [s.p[0] + r[0] * side * out, groundY, s.p[2] + r[2] * side * out];
  };
  const yawOf = (s) => yawAlong(flat(s.t));
  // Does any track sample other than this stretch's own fall inside the footprint?
  const footprintClear = (b, uc, halfLen) => {
    const c = Math.cos(b.yaw);
    const sn = Math.sin(b.yaw);
    for (const s of samples) {
      if (Math.abs(s.u - uc) < halfLen + 6 || Math.abs(s.u - uc - L) < halfLen + 6 || Math.abs(s.u - uc + L) < halfLen + 6) continue;
      const dx = s.p[0] - b.base[0];
      const dz = s.p[2] - b.base[2];
      const lx = c * dx - sn * dz;
      const lz = sn * dx + c * dz;
      const margin = 3;
      if (lx > b.box.x[0] - margin && lx < b.box.x[1] + margin && lz > b.box.z[0] - margin && lz < b.box.z[1] + margin && s.p[1] - groundY < b.box.y[1] + 1.5) return false;
    }
    return true;
  };

  const lowStretches = [];
  let start = null;
  samples.forEach((s, k) => {
    const ok = s.p[1] - groundY < 7 && Math.abs(s.curv) < 0.03 && s.u > 20 && s.u < L - 3;
    if (ok && start === null) start = s.u;
    if ((!ok || k === samples.length - 1) && start !== null) {
      if (s.u - start > 18) lowStretches.push({ u: (start + s.u) / 2, len: Math.min(s.u - start, 40) });
      start = null;
    }
  });
  lowStretches.sort((a, b) => b.len - a.len);
  const stands = [];
  for (const sp of lowStretches) {
    if (stands.length >= 2) break;
    const s = at(sp.u);
    const len = sp.len - 4;
    for (const side of stands.length % 2 ? [-1, 1] : [1, -1]) {
      // Front rail just before the base (local z = -side), terraces rising away from the track to the rear wall at side*8.4; the roof overhangs both.
      const z = [-side * 1.0, side * 9.2].sort((a, b) => a - b);
      const cand = { base: place(s, side, W2 + 11), yaw: yawOf(s), side, len, u: sp.u, box: { x: [-len / 2 - 1.2, len / 2 + 1.2], y: [0, 7.2], z } };
      if (footprintClear(cand, sp.u, len / 2)) {
        stands.push(cand);
        break;
      }
    }
  }

  let pit = null;
  const fs = at(L - 14);
  for (const side of [-(stands[0]?.side ?? 1), stands[0]?.side ?? 1]) {
    const cand = { base: place(fs, side, W2 + 9), yaw: yawOf(fs), side, box: { x: [-13.5, 13.5], y: [0, 3.6], z: [-3.9, 3.9] } };
    if (footprintClear(cand, L - 14, 13)) {
      pit = cand;
      break;
    }
  }

  return { groundY, stands, pit, buildings: pit ? [...stands, pit] : stands };
}

/** Distance from a point to the nearest building, 0 inside one. */
export function venueClearance(layout, p) {
  let best = Infinity;
  for (const b of layout.buildings) {
    const dx = p[0] - b.base[0];
    const dy = p[1] - b.base[1];
    const dz = p[2] - b.base[2];
    // World → local (rotate by -yaw about y).
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const lx = c * dx - s * dz;
    const lz = s * dx + c * dz;
    const ex = Math.max(b.box.x[0] - lx, 0, lx - b.box.x[1]);
    const ey = Math.max(b.box.y[0] - dy, 0, dy - b.box.y[1]);
    const ez = Math.max(b.box.z[0] - lz, 0, lz - b.box.z[1]);
    best = Math.min(best, Math.hypot(ex, ey, ez));
  }
  return best;
}

/** True when the segment from `a` to `b` passes through a building (slab test in each one's frame). */
export function venueBlocks(layout, a, b) {
  for (const bl of layout.buildings) {
    const c = Math.cos(bl.yaw);
    const s = Math.sin(bl.yaw);
    const local = (p) => {
      const dx = p[0] - bl.base[0];
      const dz = p[2] - bl.base[2];
      return [c * dx - s * dz, p[1] - bl.base[1], s * dx + c * dz];
    };
    const o = local(a);
    const e = local(b);
    const bounds = [bl.box.x, bl.box.y, bl.box.z];
    let t0 = 0;
    let t1 = 1;
    let hit = true;
    for (let i = 0; i < 3 && hit; i++) {
      const d = e[i] - o[i];
      if (Math.abs(d) < 1e-9) {
        if (o[i] < bounds[i][0] || o[i] > bounds[i][1]) hit = false;
        continue;
      }
      let ta = (bounds[i][0] - o[i]) / d;
      let tb = (bounds[i][1] - o[i]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) hit = false;
    }
    if (hit) return true;
  }
  return false;
}
