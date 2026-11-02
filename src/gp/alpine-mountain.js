import * as THREE from "three";
const alpineGeoCache = new Map();
const hash = n => {const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);};
export function buildAlpineMountainGeo(baseR, peakH, cliffH, seed) {
  const key = `${baseR.toFixed(1)}_${peakH.toFixed(1)}_${cliffH.toFixed(1)}_${seed}`;
  const cached = alpineGeoCache.get(key);
  if (cached) return cached;

  const rings = 7;
  const segs = 8; // 8-sided staggered geodesic diamond triangulation -> broad, bold chiseled Alpine rock & snow faces!
  const nRidges = 4; // 4 main pyramidal Matterhorn faces
  const phase = seed * 1.37;
  const leanX = Math.cos(seed * 2.1) * baseR * 0.14;
  const leanZ = Math.sin(seed * 2.1) * baseR * 0.14;

  // Compute vertex grid (rings x segs) with half-step angular stagger on odd rings (eliminates vertical stripes!)
  const pts = []; // [x, y, z, ridgeVal]
  for (let rIdx = 0; rIdx <= rings; rIdx++) {
    const u = rIdx / rings; // 0 = groundY (-cliffH), 0.32 = track level (0), 1.0 = summit (+peakH)
    const y = u < 0.32 ? -cliffH * (1 - u / 0.32) : ((u - 0.32) / 0.68) * peakH;
    const hNorm = Math.max(0, (u - 0.32) / 0.68);
    const baseProfile = u < 0.32 ? 1.0 + (1 - u / 0.32) * 0.45 : Math.pow(1 - hNorm, 0.78);
    const stagger = (rIdx % 2) * 0.5;

    for (let sIdx = 0; sIdx < segs; sIdx++) {
      if (rIdx === rings) {
        pts.push([leanX, peakH, leanZ, 1.0]);
        continue;
      }
      const a = ((sIdx + stagger) / segs) * Math.PI * 2 + hNorm * 0.22;
      const ridgeWave = Math.abs(Math.cos((a * nRidges) / 2 + phase));
      const arête = Math.pow(ridgeWave, 0.65);
      const crag = (hash(rIdx * 23 + sIdx * 11 + seed) - 0.5) * 0.24;
      const rad = baseR * baseProfile * (0.76 + arête * 0.36 + crag);
      const cx = Math.pow(hNorm, 1.45) * leanX;
      const cz = Math.pow(hNorm, 1.45) * leanZ;
      pts.push([cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad, arête]);
    }
  }

  const positions = [];
  const colors = [];
  const pushTri = (
    p0,
    p1,
    p2,
    fSeed,
  ) => {
    positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    const avgY = (p0[1] + p1[1] + p2[1]) / 3;
    const avgRidge = (p0[3] + p1[3] + p2[3]) / 3;
    const hFrac = avgY / Math.max(1, peakH);
    const snowLine = 0.14 + avgRidge * 0.16 - (hash(fSeed) - 0.5) * 0.08;
    let col;
    if (hFrac > snowLine) {
      // Bright gleaming Alpine snow & glacier ice
      const shade = 0.94 + hash(fSeed * 3.1) * 0.06;
      col = new THREE.Color(0.95 * shade, 0.98 * shade, 1.0 * shade);
    } else if (hFrac > -0.05) {
      // Frosted blue-grey Alpine granite & snow ledges
      const shade = 0.85 + hash(fSeed * 1.7) * 0.25;
      col = new THREE.Color(0.36 * shade, 0.48 * shade, 0.62 * shade);
    } else {
      // Lower alpine valley rock & dark pine-forest slate
      const shade = 0.85 + hash(fSeed * 2.3) * 0.22;
      col = new THREE.Color(0.22 * shade, 0.32 * shade, 0.42 * shade);
    }
    for (let k = 0; k < 3; k++) colors.push(col.r, col.g, col.b);
  };

  for (let rIdx = 0; rIdx < rings; rIdx++) {
    for (let sIdx = 0; sIdx < segs; sIdx++) {
      const nextS = (sIdx + 1) % segs;
      const i00 = rIdx * segs + sIdx;
      const i10 = rIdx * segs + nextS;
      const i01 = (rIdx + 1) * segs + sIdx;
      const i11 = (rIdx + 1) * segs + nextS;
      const fSeed = rIdx * 31 + sIdx * 17 + seed;
      pushTri(pts[i00], pts[i10], pts[i11], fSeed);
      if (rIdx + 1 < rings) {
        pushTri(pts[i00], pts[i11], pts[i01], fSeed + 7);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  alpineGeoCache.set(key, geo);
  return geo;
}
