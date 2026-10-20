import * as THREE from "three";

// Procedural imperfection maps. Perfectly uniform surfaces are what give CG
// away: real moulded plastic has a faint orange-peel texture that breaks up
// its highlights, chrome carries smudges and hairline scratches, and a studio
// floor is never one flat colour. All deterministic (no Math.random).

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Tileable value noise in [0,1] on a size×size grid, summed over octaves. */
function noiseField(size: number, cells: number, octaves: number, seed: number) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const c = cells << o;
    const lattice = (x: number, y: number) => hash(((x % c) + c) % c * 7919 + (((y % c) + c) % c) * 104729 + seed * 31 + o * 977);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * c;
        const fy = (y / size) * c;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const a = lattice(ix, iy);
        const b = lattice(ix + 1, iy);
        const cc = lattice(ix, iy + 1);
        const d = lattice(ix + 1, iy + 1);
        out[y * size + x] += amp * (a + (b - a) * sx + (cc - a) * sy + (a - b - cc + d) * sx * sy);
      }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function dataTexture(size: number, rgba: Uint8Array, srgb = false) {
  const t = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 16;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Normal map pixels (RGBA) from a height field (central differences). */
function normalPixels(height: Float32Array, size: number, strength: number) {
  const rgba = new Uint8Array(size * size * 4);
  const h = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      rgba[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      rgba[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      rgba[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      rgba[i + 3] = 255;
    }
  return rgba;
}

// The maps take a while to compute, so their pixels are computed once per page.
// Only the pixels: each canvas gets textures of its own (a texture a renderer has
// drawn with keeps that renderer alive, so none may outlive its canvas).
const cache = new Map<string, unknown>();
function once<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

/** Moulded plastic: fine orange peel (normal) and gentle roughness drift. New textures on every call. */
export function plasticMaps() {
  const px = once("plastic", () => {
    const size = 512;
    const peel = noiseField(size, 64, 3, 1);
    const drift = noiseField(size, 4, 4, 2);
    const normal = normalPixels(peel, size, 3.2);
    const rough = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      // Roughness lives in G: 0.24–0.42, with faint wipe marks.
      const g = 0.24 + drift[i] * 0.18 + (peel[i] - 0.5) * 0.04;
      rough[i * 4] = 255;
      rough[i * 4 + 1] = Math.max(0, Math.min(255, g * 255));
      rough[i * 4 + 2] = 255;
      rough[i * 4 + 3] = 255;
    }
    return { size, normal, rough };
  });
  return { normal: dataTexture(px.size, px.normal), roughness: dataTexture(px.size, px.rough) };
}

/** Polished concrete for the studio floor: colour variation and a little sheen variation. New textures on every call. */
export function floorMaps(base: string) {
  const px = once(`floor${base}`, () => {
    const size = 512;
    const low = noiseField(size, 6, 5, 3);
    const grain = noiseField(size, 128, 2, 4);
    const c = new THREE.Color(base);
    const col = new Uint8Array(size * size * 4);
    const rough = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const k = 0.88 + low[i] * 0.2 + (grain[i] - 0.5) * 0.06;
      col[i * 4] = Math.min(255, c.r * 255 * k);
      col[i * 4 + 1] = Math.min(255, c.g * 255 * k);
      col[i * 4 + 2] = Math.min(255, c.b * 255 * k);
      col[i * 4 + 3] = 255;
      rough[i * 4 + 1] = (0.55 + low[i] * 0.35) * 255;
      rough[i * 4 + 3] = 255;
    }
    return { size, col, rough, normal: normalPixels(grain, size, 1.2) };
  });
  return colorMaps(px);
}

/** A colour map (linear: its pixels are already linear), a roughness map and a normal map. */
function colorMaps(px: { size: number; col: Uint8Array; rough: Uint8Array; normal: Uint8Array }) {
  const color = dataTexture(px.size, px.col);
  color.colorSpace = THREE.LinearSRGBColorSpace;
  return { color, roughness: dataTexture(px.size, px.rough), normal: dataTexture(px.size, px.normal) };
}

/**
 * Smudges and hairline scratches drawn onto a marble's metal/roughness map
 * (G = roughness, B = metalness): soft blobs raise roughness, thin arcs too.
 */
export function wearChrome(g: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  g.save();
  for (let k = 0; k < 7; k++) {
    const x = hash(seed * 13 + k) * w;
    const y = (0.15 + hash(seed * 17 + k) * 0.7) * h;
    const r = (0.04 + hash(seed * 19 + k) * 0.08) * w;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(0,70,255,0.55)");
    grad.addColorStop(1, "rgba(0,70,255,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.strokeStyle = "rgba(0,110,255,0.35)";
  g.lineWidth = 0.6;
  for (let k = 0; k < 40; k++) {
    const x = hash(seed * 23 + k) * w;
    const y = hash(seed * 29 + k) * h;
    const len = (0.02 + hash(seed * 31 + k) * 0.08) * w;
    const a = hash(seed * 37 + k) * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + 2, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  g.restore();
}

/** Asphalt: fine aggregate grain (normal), near-constant roughness. New textures on every call. */
export function asphaltMaps() {
  const px = once("asphalt", () => {
    const size = 1024;
    const grain = noiseField(size, 256, 2, 5);
    const fine = noiseField(size, 512, 1, 6);
    const h = new Float32Array(size * size);
    for (let i = 0; i < h.length; i++) h[i] = grain[i] * 0.7 + fine[i] * 0.3;
    const rough = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      rough[i * 4 + 1] = (0.78 + (grain[i] - 0.5) * 0.2) * 255;
      rough[i * 4 + 3] = 255;
    }
    return { size, normal: normalPixels(h, size, 2.6), rough };
  });
  return { normal: dataTexture(px.size, px.normal), roughness: dataTexture(px.size, px.rough) };
}

/** Mown grass: green with broad tonal patches, mowing stripes and fine blade grain. New textures on every call. */
export function grassMaps() {
  const px = once("grass", () => {
    const size = 1024;
    const patches = noiseField(size, 3, 5, 7);
    const blades = noiseField(size, 256, 2, 8);
    const col = new Uint8Array(size * size * 4);
    const rough = new Uint8Array(size * size * 4);
    // Desaturated greens with a sandy undertone: a real infield, not a felt carpet.
    const a = new THREE.Color("#55713e");
    const b = new THREE.Color("#8a9d5a");
    const c = new THREE.Color();
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const stripe = Math.floor(x / 128) % 2 ? 0.05 : -0.05; // mowing stripes
        const k = Math.min(1, Math.max(0, patches[i] + stripe + (blades[i] - 0.5) * 0.35));
        c.copy(a).lerp(b, k);
        col[i * 4] = c.r * 255;
        col[i * 4 + 1] = c.g * 255;
        col[i * 4 + 2] = c.b * 255;
        col[i * 4 + 3] = 255;
        rough[i * 4 + 1] = 230;
        rough[i * 4 + 3] = 255;
      }
    return { size, col, rough, normal: normalPixels(blades, size, 1.6) };
  });
  return colorMaps(px);
}
