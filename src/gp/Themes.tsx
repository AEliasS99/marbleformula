import { useMemo } from "react";
import * as THREE from "three";
import { TRACK, TRACK_DEPTH } from "./trackMesh.js";
import type { Race, Vec3 } from "./race";

export type CircuitThemeId = "tokyo" | "alps" | "cairo" | "sydney" | "newyork";

export interface CircuitTheme {
  id: CircuitThemeId;
  skyColor: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  groundColor: string;
  groundRoughness: number;
  groundMetalness: number;
  trackFloorColor: string;
  trackSpeckleRgb: [number, number, number];
  trackEdgeColor: string;
  trackDashColor: string;
  innerWallColor: string;
  outerShellColor: string;
  outerShellMetalness: number;
  outerShellRoughness: number;
  rimColor: string;
  capsColor: string;
  kerbColorA: string;
  kerbColorB: string;
  sunColor: string;
  sunIntensity: number;
  rimLightColor: string;
  rimLightIntensity: number;
  hemiSkyColor: string;
  hemiGroundColor: string;
  hemiIntensity: number;
  hoopRibColor: string;
  hoopLedColor: string;
  hoopLedEmissive: string;
  neonPalette: string[];
  extraNeonArches: boolean;
  boards: [string, string, string][];
}

export function getCircuitTheme(race: Race): CircuitTheme {
  const gp = (race.data.info?.gp ?? "").toLowerCase();
  const id = (race.data.id ?? "").toLowerCase();

  // Round 2: Swiss Alpine Grand Prix (Matterhorn Glacier Switchbacks)
  if (gp.includes("switz") || gp.includes("alpine") || id === "r1-monaco") {
    return {
      id: "alps",
      skyColor: "#0e223d",
      fogColor: "#18365c",
      fogNear: 95,
      fogFar: 420,
      groundColor: "#dceaf7",
      groundRoughness: 0.82,
      groundMetalness: 0.05,
      trackFloorColor: "#174266",
      trackSpeckleRgb: [175, 225, 255],
      trackEdgeColor: "#ffffff",
      trackDashColor: "#b8ebff",
      innerWallColor: "#c8e4ff",
      outerShellColor: "#82bce8",
      outerShellMetalness: 0.55,
      outerShellRoughness: 0.28,
      rimColor: "#f2f9ff",
      capsColor: "#b0d6f5",
      kerbColorA: "#e60012",
      kerbColorB: "#ffffff",
      sunColor: "#e6f3ff",
      sunIntensity: 2.65,
      rimLightColor: "#80d4ff",
      rimLightIntensity: 0.95,
      hemiSkyColor: "#d4ecff",
      hemiGroundColor: "#8ab4d8",
      hemiIntensity: 0.44,
      hoopRibColor: "#e8f4ff",
      hoopLedColor: "#ffffff",
      hoopLedEmissive: "#00d8ff",
      neonPalette: ["#00e5ff", "#80f0ff", "#ffffff", "#3399ff"],
      extraNeonArches: false,
      boards: [
        ["SWISS ALPINE GP", "#d80018", "#ffffff"],
        ["MATTERHORN GLACIER", "#0e2b5c", "#ffffff"],
        ["ICE TRACK 2027", "#ffffff", "#0e2b5c"],
        ["ALPS · ZERMATT", "#0088cc", "#ffffff"],
        ["PIRELLO WINTER", "#ffcc00", "#111216"],
      ],
    };
  }

  // Round 3: Egyptian Grand Prix (Giza Pyramid Dunes Circuit)
  if (gp.includes("egypt") || gp.includes("cairo") || id === "r2-silverstone") {
    return {
      id: "cairo",
      skyColor: "#261206",
      fogColor: "#3a1d0a",
      fogNear: 90,
      fogFar: 400,
      groundColor: "#c48840",
      groundRoughness: 0.92,
      groundMetalness: 0.04,
      trackFloorColor: "#523518",
      trackSpeckleRgb: [235, 190, 115],
      trackEdgeColor: "#ffd700",
      trackDashColor: "#ffe484",
      innerWallColor: "#8c6236",
      outerShellColor: "#b88642",
      outerShellMetalness: 0.72,
      outerShellRoughness: 0.34,
      rimColor: "#ffd700",
      capsColor: "#634321",
      kerbColorA: "#ffcc00",
      kerbColorB: "#00d4b2",
      sunColor: "#ffca7a",
      sunIntensity: 2.75,
      rimLightColor: "#ff8822",
      rimLightIntensity: 0.95,
      hemiSkyColor: "#ffbe73",
      hemiGroundColor: "#5e3a16",
      hemiIntensity: 0.38,
      hoopRibColor: "#e6b86a",
      hoopLedColor: "#fff0b8",
      hoopLedEmissive: "#ffaa00",
      neonPalette: ["#ffcc00", "#ff7700", "#00e5c3", "#ffee66"],
      extraNeonArches: false,
      boards: [
        ["EGYPTIAN GP · GIZA", "#b87314", "#ffffff"],
        ["PHARAOH GOLD", "#111216", "#ffd700"],
        ["PYRAMID DUNES", "#008c76", "#ffffff"],
        ["CAIRO NIGHTS", "#8c1d18", "#ffd700"],
        ["PIRELLO DESERT", "#ffcc00", "#111216"],
      ],
    };
  }

  // Round 4: Australian Grand Prix (Sydney Harbour Bridge Circuit)
  if (gp.includes("austral") || gp.includes("sydney") || id === "r3-spa") {
    return {
      id: "sydney",
      skyColor: "#061b2b",
      fogColor: "#0a283e",
      fogNear: 90,
      fogFar: 400,
      groundColor: "#08304b",
      groundRoughness: 0.38,
      groundMetalness: 0.35,
      trackFloorColor: "#0f423d",
      trackSpeckleRgb: [110, 225, 205],
      trackEdgeColor: "#ffcd00",
      trackDashColor: "#a8fff0",
      innerWallColor: "#bfe8e2",
      outerShellColor: "#2b7a72",
      outerShellMetalness: 0.75,
      outerShellRoughness: 0.3,
      rimColor: "#ffcd00",
      capsColor: "#144742",
      kerbColorA: "#00843d",
      kerbColorB: "#ffcd00",
      sunColor: "#d8f8ff",
      sunIntensity: 2.5,
      rimLightColor: "#00f0c8",
      rimLightIntensity: 0.88,
      hemiSkyColor: "#80e5ff",
      hemiGroundColor: "#09362f",
      hemiIntensity: 0.35,
      hoopRibColor: "#eef6f6",
      hoopLedColor: "#fff4b8",
      hoopLedEmissive: "#00f5d4",
      neonPalette: ["#00f5d4", "#ffcd00", "#00b4d8", "#ff6b6b"],
      extraNeonArches: false,
      boards: [
        ["AUSTRALIAN GP", "#00843d", "#ffcd00"],
        ["SYDNEY HARBOUR", "#004b76", "#ffffff"],
        ["OPERA SAILS", "#ffffff", "#004b76"],
        ["AUSSIE GOLD", "#ffcd00", "#005c29"],
        ["PIRELLO PACIFIC", "#00b4d8", "#ffffff"],
      ],
    };
  }

  // Round 5: New York Grand Prix (Times Square Championship Finale)
  if (gp.includes("usa") || gp.includes("new york") || id === "r4-suzuka") {
    return {
      id: "newyork",
      skyColor: "#090c1c",
      fogColor: "#101530",
      fogNear: 85,
      fogFar: 380,
      groundColor: "#0e1326",
      groundRoughness: 0.85,
      groundMetalness: 0.15,
      trackFloorColor: "#2e1424",
      trackSpeckleRgb: [220, 170, 195],
      trackEdgeColor: "#ffd700",
      trackDashColor: "#fff0b8",
      innerWallColor: "#48263c",
      outerShellColor: "#8c6230",
      outerShellMetalness: 0.88,
      outerShellRoughness: 0.28,
      rimColor: "#ffd700",
      capsColor: "#2c1626",
      kerbColorA: "#e10600",
      kerbColorB: "#ffd700",
      sunColor: "#fff0d8",
      sunIntensity: 2.55,
      rimLightColor: "#ff2a6d",
      rimLightIntensity: 0.92,
      hemiSkyColor: "#9ab8ff",
      hemiGroundColor: "#241222",
      hemiIntensity: 0.3,
      hoopRibColor: "#ffd700",
      hoopLedColor: "#ffffff",
      hoopLedEmissive: "#ff2a55",
      neonPalette: ["#ffd700", "#ff1e42", "#00d8ff", "#ffffff", "#b829ff"],
      extraNeonArches: true,
      boards: [
        ["TIMES SQUARE FINALE", "#e10600", "#ffffff"],
        ["NEW YORK GP · NYC", "#0a1c4e", "#ffd700"],
        ["CHAMPIONSHIP DECIDER", "#ffd700", "#111216"],
        ["BROADWAY LIGHTS", "#b80058", "#ffffff"],
        ["EMPIRE STATE", "#ffffff", "#0a1c4e"],
      ],
    };
  }

  // Default / Round 1: Tokyo Grand Prix (Shibuya Neon Expressway)
  return {
    id: "tokyo",
    skyColor: "#080318",
    fogColor: "#11072b",
    fogNear: 80,
    fogFar: 360,
    groundColor: "#0b051e",
    groundRoughness: 0.85,
    groundMetalness: 0.18,
    trackFloorColor: "#1c1036",
    trackSpeckleRgb: [155, 110, 235],
    trackEdgeColor: "#00f5ff",
    trackDashColor: "#ff2a9d",
    innerWallColor: "#2e1a54",
    outerShellColor: "#502f8c",
    outerShellMetalness: 0.88,
    outerShellRoughness: 0.28,
    rimColor: "#00f5ff",
    capsColor: "#221142",
    kerbColorA: "#ff007f",
    kerbColorB: "#00f5ff",
    sunColor: "#e6d8ff",
    sunIntensity: 2.45,
    rimLightColor: "#ff00a0",
    rimLightIntensity: 1.05,
    hemiSkyColor: "#b888ff",
    hemiGroundColor: "#180933",
    hemiIntensity: 0.32,
    hoopRibColor: "#ff007f",
    hoopLedColor: "#e0ffff",
    hoopLedEmissive: "#00f5ff",
    neonPalette: ["#ff007f", "#00f5ff", "#b829ff", "#ffee00", "#00ff88"],
    extraNeonArches: true,
    boards: [
      ["TOKYO GP · SHIBUYA", "#ff007f", "#ffffff"],
      ["CYBER EXPRESSWAY", "#00f5ff", "#090418"],
      ["NEO TOKYO 2027", "#7a00ff", "#ffee00"],
      ["ELECTRIC DRIFT", "#ffee00", "#12062c"],
      ["SHINJUKU LIGHTS", "#00ff88", "#090418"],
    ],
  };
}

type Sample = { u: number; p: Vec3; t: Vec3; r: Vec3; n: Vec3; curv: number; w?: number; gap?: boolean };

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const windowTexCache = new Map<string, THREE.CanvasTexture>();
function makeWindowTowerTexture(bgHex: string, neonHexA: string, neonHexB: string, seed: number) {
  const sKey = seed % 8;
  const key = `v2-${bgHex}-${neonHexA}-${neonHexB}-${sKey}`;
  const cached = windowTexCache.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = bgHex;
  g.fillRect(0, 0, 512, 1024);
  // Structural curtain-wall spandrel bands & vertical mullions
  g.fillStyle = "rgba(255,255,255,0.06)";
  for (let r = 0; r < 32; r++) {
    g.fillRect(0, r * 32, 512, 5);
  }
  for (let col = 0; col < 16; col++) {
    g.fillRect(col * 32, 0, 4, 1024);
  }
  const cols = 16;
  const rows = 32;
  for (let r = 1; r < rows - 1; r++) {
    const floorLit = hash(sKey * 19 + r * 7) > 0.18;
    for (let col = 1; col < cols - 1; col++) {
      const h = hash(sKey * 31 + r * 17 + col * 13);
      if (floorLit && h > 0.22) {
        g.fillStyle = h > 0.78 ? neonHexA : h > 0.52 ? neonHexB : h > 0.36 ? "#ffe9b8" : "#a8d8ff";
        g.fillRect(col * 32 + 6, r * 32 + 7, 22, 19);
        // Subtle window sill highlight
        g.fillStyle = "#ffffff";
        g.fillRect(col * 32 + 6, r * 32 + 23, 22, 3);
      }
    }
    // Mechanical louver floor band every 8 floors
    if (r % 8 === 0) {
      g.fillStyle = neonHexA;
      g.fillRect(16, r * 32 + 2, 480, 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  windowTexCache.set(key, t);
  return t;
}

const vertSignCache = new Map<string, THREE.CanvasTexture>();
function makeVerticalSignTexture(chars: string[], bg: string, fg: string, border: string) {
  const key = `${chars.join("")}|${bg}|${fg}|${border}`;
  const cached = vertSignCache.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 512);
  g.strokeStyle = border;
  g.lineWidth = 10;
  g.strokeRect(6, 6, 116, 500);
  g.fillStyle = fg;
  g.font = "900 54px 'Hiragino Sans', 'Avenir Next', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const step = 440 / Math.max(1, chars.length);
  chars.forEach((ch, idx) => {
    g.fillText(ch, 64, 42 + (idx + 0.5) * step);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  vertSignCache.set(key, t);
  return t;
}

const billboardTexCache = new Map<string, THREE.CanvasTexture>();
function makeBillboardTexture(title: string, sub: string, bg: string, fg: string, accent: string) {
  const key = `${title}|${sub}|${bg}|${fg}|${accent}`;
  const cached = billboardTexCache.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = accent;
  g.lineWidth = 14;
  g.strokeRect(10, 10, 492, 236);
  g.fillStyle = fg;
  g.font = "900 58px 'Avenir Next', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(title, 256, 102);
  g.fillStyle = accent;
  g.font = "800 36px 'Avenir Next', system-ui, sans-serif";
  g.fillText(sub, 256, 174);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  billboardTexCache.set(key, t);
  return t;
}

const alpineGeoCache = new Map<string, THREE.BufferGeometry>();
/**
 * Builds a jagged, faceted 3D Matterhorn / Eiger Alpine mountain massif with sharp pyramidal arête ridges,
 * glacier snow couloirs, and a wide natural mountain skirt extending all the way down to -cliffH (groundY).
 */
function buildAlpineMountainGeo(baseR: number, peakH: number, cliffH: number, seed: number): THREE.BufferGeometry {
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
  const pts: [number, number, number, number][] = []; // [x, y, z, ridgeVal]
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

  const positions: number[] = [];
  const colors: number[] = [];
  const pushTri = (
    p0: [number, number, number, number],
    p1: [number, number, number, number],
    p2: [number, number, number, number],
    fSeed: number,
  ) => {
    positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    const avgY = (p0[1] + p1[1] + p2[1]) / 3;
    const avgRidge = (p0[3] + p1[3] + p2[3]) / 3;
    const hFrac = avgY / Math.max(1, peakH);
    const snowLine = 0.14 + avgRidge * 0.16 - (hash(fSeed) - 0.5) * 0.08;
    let col: THREE.Color;
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

/**
 * 3D Swiss National Flag (Red square/rectangular cloth with bold white equilateral Swiss Cross on a flagpole).
 */
function SwissFlag({ poleH = 3.4, flagSize = 1.05 }: { poleH?: number; flagSize?: number }) {
  const w = flagSize * 1.12;
  const h = flagSize;
  const crossLen = flagSize * 0.62;
  const crossThick = flagSize * 0.19;
  return (
    <group>
      {/* White metallic flagpole & gold finial */}
      <mesh position={[0, poleH * 0.5, 0]}>
        <cylinderGeometry args={[0.045, 0.06, poleH, 10]} />
        <meshStandardMaterial color="#e8eef5" metalness={0.55} roughness={0.3} />
      </mesh>
      <mesh position={[0, poleH + 0.07, 0]}>
        <sphereGeometry args={[0.09, 10, 10]} />
        <meshStandardMaterial color="#ffcc22" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Red Swiss Flag Cloth (#e30613) */}
      <group position={[w * 0.5 + 0.03, poleH - h * 0.52, 0]}>
        <mesh>
          <boxGeometry args={[w, h, 0.035]} />
          <meshBasicMaterial color={new THREE.Color("#e30613").multiplyScalar(1.35)} toneMapped={false} />
        </mesh>
        {/* White Equilateral Swiss Cross (Vertical + Horizontal bars) */}
        <mesh>
          <boxGeometry args={[crossThick, crossLen, 0.055]} />
          <meshBasicMaterial color={new THREE.Color("#ffffff").multiplyScalar(1.45)} toneMapped={false} />
        </mesh>
        <mesh>
          <boxGeometry args={[crossLen, crossThick, 0.055]} />
          <meshBasicMaterial color={new THREE.Color("#ffffff").multiplyScalar(1.45)} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * 3D Spotted Swiss Alpine Cow (Simmental / Brown Swiss) with horns, pink muzzle, and golden Swiss cowbell!
 */
function SwissCow({
  position = [0, 0, 0],
  rotY = 0,
  scale = 1,
  spotColor = "#7a3e18",
}: {
  position?: [number, number, number];
  rotY?: number;
  scale?: number;
  spotColor?: string;
}) {
  return (
    <group position={position} rotation-y={rotY} scale={scale}>
      {/* Cream-white cow torso */}
      <mesh position={[0, 0.68, 0]}>
        <boxGeometry args={[0.66, 0.56, 1.22]} />
        <meshStandardMaterial color="#f8f4ec" roughness={0.78} />
      </mesh>
      {/* Simmental / Brown Swiss saddle & flank patches */}
      <mesh position={[0, 0.72, 0.1]}>
        <boxGeometry args={[0.69, 0.38, 0.48]} />
        <meshStandardMaterial color={spotColor} roughness={0.8} />
      </mesh>
      <mesh position={[0.02, 0.66, -0.36]}>
        <boxGeometry args={[0.68, 0.34, 0.34]} />
        <meshStandardMaterial color={spotColor} roughness={0.8} />
      </mesh>
      {/* Pink udder */}
      <mesh position={[0, 0.36, -0.22]}>
        <boxGeometry args={[0.28, 0.14, 0.3]} />
        <meshStandardMaterial color="#f2a2b4" roughness={0.75} />
      </mesh>
      {/* 4 Legs & dark hooves */}
      {(
        [
          [-0.22, 0.42],
          [0.22, 0.42],
          [-0.22, -0.42],
          [0.22, -0.42],
        ] as const
      ).map(([lx, lz], idx) => (
        <group key={idx} position={[lx, 0, lz]}>
          <mesh position={[0, 0.24, 0]}>
            <boxGeometry args={[0.14, 0.44, 0.14]} />
            <meshStandardMaterial color="#f5f0e6" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.15, 0.08, 0.16]} />
            <meshStandardMaterial color="#2a221c" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* Neck & Head */}
      <group position={[0, 0.88, 0.66]} rotation-x={0.18}>
        <mesh position={[0, 0, -0.08]}>
          <boxGeometry args={[0.42, 0.42, 0.38]} />
          <meshStandardMaterial color={spotColor} roughness={0.8} />
        </mesh>
        {/* White blaze & head */}
        <mesh position={[0, 0.06, 0.14]}>
          <boxGeometry args={[0.44, 0.38, 0.36]} />
          <meshStandardMaterial color="#f8f4ec" roughness={0.75} />
        </mesh>
        {/* Pink muzzle */}
        <mesh position={[0, -0.04, 0.34]}>
          <boxGeometry args={[0.36, 0.22, 0.14]} />
          <meshStandardMaterial color="#f4a6b8" roughness={0.7} />
        </mesh>
        {/* Left & Right Ears + Curved Ivory Horns */}
        {([-1, 1] as const).map((side) => (
          <group key={side}>
            <mesh position={[side * 0.28, 0.12, 0.08]} rotation={[0, 0, -side * 0.35]}>
              <boxGeometry args={[0.2, 0.09, 0.1]} />
              <meshStandardMaterial color={spotColor} roughness={0.8} />
            </mesh>
            <mesh position={[side * 0.22, 0.28, 0.08]} rotation={[0.2, 0, -side * 0.45]}>
              <coneGeometry args={[0.045, 0.22, 8]} />
              <meshStandardMaterial color="#ebe3cf" roughness={0.5} />
            </mesh>
          </group>
        ))}
        {/* Traditional Red Swiss Collar & Golden Cowbell (Treichel / Senntumschellen) */}
        <mesh position={[0, -0.06, -0.04]} rotation-x={0.2}>
          <boxGeometry args={[0.46, 0.1, 0.42]} />
          <meshBasicMaterial color="#d91420" />
        </mesh>
        <mesh position={[0, -0.26, 0.06]}>
          <cylinderGeometry args={[0.07, 0.11, 0.2, 10]} />
          <meshStandardMaterial color="#ffcc22" emissive="#aa7700" emissiveIntensity={0.35} metalness={0.85} roughness={0.2} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Detailed Multi-Story Swiss Alpine Chalet with stone ground floor, larch timber upper stories,
 * wide overhanging snow-covered gable roof, wooden balcony with red geranium flowerboxes, shutters, and chimney.
 */
function SwissChalet({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      {/* Whitewashed Alpine stone ground floor */}
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.6, 1.8, 4.0]} />
        <meshStandardMaterial color="#dcd5c7" roughness={0.85} />
      </mesh>
      {/* Hand-hewn dark larch timber upper stories */}
      <mesh position={[0, 2.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[4.8, 2.1, 4.2]} />
        <meshStandardMaterial color="#6b3e1e" roughness={0.8} />
      </mesh>
      {/* Gable timber attic peak */}
      <mesh position={[0, 4.15, 0]} rotation={[0, Math.PI / 4, 0]}>
        <cylinderGeometry args={[0.1, 3.1, 1.3, 4]} />
        <meshStandardMaterial color="#593216" roughness={0.82} />
      </mesh>
      {/* Wrap-around wooden Alpine sun balcony */}
      <mesh position={[0, 1.85, 2.35]}>
        <boxGeometry args={[5.1, 0.16, 0.7]} />
        <meshStandardMaterial color="#4a2810" roughness={0.82} />
      </mesh>
      <mesh position={[0, 2.25, 2.66]}>
        <boxGeometry args={[5.1, 0.65, 0.08]} />
        <meshStandardMaterial color="#5c3416" roughness={0.8} />
      </mesh>
      {/* Bright Red Geranium Flower Boxes along the balcony railing */}
      {[-1.6, 0, 1.6].map((bx) => (
        <group key={bx} position={[bx, 2.55, 2.72]}>
          <mesh>
            <boxGeometry args={[1.05, 0.2, 0.22]} />
            <meshStandardMaterial color="#2a6e2e" roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.1, 0.02]}>
            <boxGeometry args={[0.98, 0.14, 0.2]} />
            <meshBasicMaterial color="#e81524" />
          </mesh>
        </group>
      ))}
      {/* Wide Overhanging Pitched Gable Roof Slabs (Left & Right slopes + Thick Alpine Snow Blanket) */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * 1.48, 4.15, 0]} rotation={[0, 0, -side * 0.52]}>
          {/* Dark timber eaves */}
          <mesh position={[0, -0.12, 0]}>
            <boxGeometry args={[3.45, 0.18, 5.1]} />
            <meshStandardMaterial color="#3d200c" roughness={0.82} />
          </mesh>
          {/* Thick sculpted snow blanket on roof */}
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[3.55, 0.32, 5.2]} />
            <meshStandardMaterial color="#f5faff" emissive="#c8e6ff" emissiveIntensity={0.22} roughness={0.48} />
          </mesh>
        </group>
      ))}
      {/* Stone Chimney with snow rim */}
      <mesh position={[1.35, 4.85, -0.9]}>
        <boxGeometry args={[0.62, 1.5, 0.62]} />
        <meshStandardMaterial color="#7a746c" roughness={0.88} />
      </mesh>
      <mesh position={[1.35, 5.64, -0.9]}>
        <boxGeometry args={[0.72, 0.14, 0.72]} />
        <meshStandardMaterial color="#ffffff" emissive="#cce8ff" emissiveIntensity={0.2} />
      </mesh>
      {/* Glowing Golden Windows flanked by Red-and-White Swiss Wooden Shutters (Front & Back) */}
      {([-1, 1] as const).map((fz) =>
        [-1.25, 1.25].map((wx) => (
          <group key={`${fz}-${wx}`} position={[wx, 2.75, fz * 2.13]}>
            <mesh>
              <boxGeometry args={[0.82, 0.88, 0.05]} />
              <meshBasicMaterial color={new THREE.Color("#ffcc55").multiplyScalar(2.5)} toneMapped={false} />
            </mesh>
            {([-1, 1] as const).map((sSide) => (
              <mesh key={sSide} position={[sSide * 0.56, 0, 0.02]}>
                <boxGeometry args={[0.26, 0.88, 0.06]} />
                <meshBasicMaterial color="#d51b24" />
              </mesh>
            ))}
          </group>
        )),
      )}
      {/* Ground floor arched wooden cellar door */}
      <mesh position={[0, 0.8, 2.02]}>
        <boxGeometry args={[0.95, 1.5, 0.06]} />
        <meshStandardMaterial color="#3e210d" roughness={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Multi-tiered Snow-Dusted Swiss Alpine Fir / Pine Tree.
 */
function SwissPine({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.2, 0.32, 1.7, 9]} />
        <meshStandardMaterial color="#4a321c" roughness={0.88} />
      </mesh>
      <mesh position={[0, 2.2, 0]}>
        <coneGeometry args={[1.65, 2.6, 9]} />
        <meshStandardMaterial color="#184d36" roughness={0.82} flatShading />
      </mesh>
      <mesh position={[0, 2.75, 0]}>
        <coneGeometry args={[1.38, 1.85, 9]} />
        <meshStandardMaterial color="#f2f9ff" emissive="#c4e6ff" emissiveIntensity={0.22} roughness={0.5} flatShading />
      </mesh>
      <mesh position={[0, 3.65, 0]}>
        <coneGeometry args={[1.22, 2.2, 9]} />
        <meshStandardMaterial color="#1d593f" roughness={0.82} flatShading />
      </mesh>
      <mesh position={[0, 4.15, 0]}>
        <coneGeometry args={[0.98, 1.55, 9]} />
        <meshStandardMaterial color="#ffffff" emissive="#d0ecff" emissiveIntensity={0.25} roughness={0.48} flatShading />
      </mesh>
    </group>
  );
}

/**
 * Overhead 3D Swiss Alpine Teleférico / Cable Car Gondola Span across the track.
 * Features twin hillside pylons outside the walls, high-clearance steel cables (y = 4.6m),
 * and a bright Swiss-red gondola cabin with panoramic windows and white Swiss cross at y = 3.45m.
 */
function SwissCableCarSpan({ spanW, cabOffset = 0 }: { spanW: number; cabOffset?: number }) {
  const h = 4.65;
  return (
    <group>
      {/* Left & Right Alpine Pylon Towers outside the track barriers */}
      {([-1, 1] as const).map((side) => (
        <group key={side} position={[side * spanW, -0.3, 0]}>
          {/* Stone & concrete alpine pylon foundation */}
          <mesh position={[0, 0.45, 0]}>
            <boxGeometry args={[0.85, 0.9, 0.85]} />
            <meshStandardMaterial color="#6e7680" roughness={0.8} />
          </mesh>
          {/* Steel lattice pylon mast */}
          <mesh position={[0, h * 0.5 + 0.3, 0]}>
            <cylinderGeometry args={[0.16, 0.28, h, 8]} />
            <meshStandardMaterial color="#3c4652" metalness={0.65} roughness={0.38} />
          </mesh>
          {/* Crossbar sheave assembly */}
          <mesh position={[0, h + 0.3, 0]}>
            <boxGeometry args={[0.5, 0.18, 1.1]} />
            <meshStandardMaterial color="#d91420" roughness={0.4} />
          </mesh>
          {/* Swiss Flag flying atop each pylon */}
          <group position={[side * 0.25, h + 0.35, 0]} rotation-y={side > 0 ? -Math.PI / 2 : Math.PI / 2}>
            <SwissFlag poleH={1.55} flagSize={0.68} />
          </group>
        </group>
      ))}
      {/* Twin Overhead Steel Hauling & Carrying Cables */}
      <mesh position={[0, h + 0.05, -0.18]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, spanW * 2 + 0.4, 8]} />
        <meshStandardMaterial color="#1e242b" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, h - 0.08, 0.18]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, spanW * 2 + 0.4, 8]} />
        <meshStandardMaterial color="#1e242b" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Suspended Red Swiss Gondola Cabin (well above camera at y = 3.45m) */}
      <group position={[cabOffset, h - 1.15, 0]}>
        {/* Hanger arm & grip wheel */}
        <mesh position={[0, 0.82, 0]}>
          <boxGeometry args={[0.55, 0.14, 0.22]} />
          <meshStandardMaterial color="#2b3036" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.72, 8]} />
          <meshStandardMaterial color="#3a4048" metalness={0.75} roughness={0.3} />
        </mesh>
        {/* Main Swiss Red Gondola Body */}
        <mesh position={[0, -0.12, 0]} castShadow>
          <boxGeometry args={[1.55, 1.15, 1.05]} />
          <meshStandardMaterial color="#e30613" roughness={0.32} metalness={0.18} />
        </mesh>
        {/* White Roof Cap */}
        <mesh position={[0, 0.48, 0]}>
          <boxGeometry args={[1.48, 0.1, 0.98]} />
          <meshStandardMaterial color="#f5f8fc" roughness={0.4} />
        </mesh>
        {/* Panoramic Glowing Alpine Glass Windows */}
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[1.42, 0.48, 1.08]} />
          <meshBasicMaterial color="#9ee8ff" />
        </mesh>
        {/* Bold White Swiss Cross on Front & Back of the Gondola Cabin */}
        {([-1, 1] as const).map((fz) => (
          <group key={fz} position={[0, -0.34, fz * 0.535]}>
            <mesh>
              <boxGeometry args={[0.34, 0.11, 0.02]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh>
              <boxGeometry args={[0.11, 0.34, 0.02]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * 3D World Scenery around the circuit perimeter + track-elevation-aligned landmarks so every camera angle
 * immediately showcases the Grand Prix destination (Swiss Snowy Mountains & Pines, Tokyo Cyberpunk Neon,
 * Giza Pyramids & Obelisks, Sydney Opera House & Harbour Bridge, or New York Times Square Skyline).
 */
export function WorldScenery({ race }: { race: Race }) {
  const theme = getCircuitTheme(race);

  const built = useMemo(() => {
    const samples = race.data.samples as unknown as Sample[];
    const ys = samples.map((s) => s.p[1]);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const midY = (minY + maxY) * 0.5;
    const groundY = minY - 1.4;
    const xs = samples.map((s) => s.p[0]);
    const zs = samples.map((s) => s.p[2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const rx = Math.max(68, (maxX - minX) / 2 + 52);
    const rz = Math.max(68, (maxZ - minZ) / 2 + 52);

    // Helper to check if a world (x, z) point is safely away from all track samples (including local track half-width)
    const isClearOfTrack = (x: number, z: number, minDist = 18.0) => {
      for (let i = 0; i < samples.length; i++) {
        const dx = samples[i].p[0] - x;
        const dz = samples[i].p[2] - z;
        const req = minDist + (samples[i].w ?? 2.5);
        if (dx * dx + dz * dz < req * req) return false;
      }
      return true;
    };

    // 3D height-aware track clearance for self-contained alpine knolls/props on serpentine circuits
    const isClearOfTrack3D = (x: number, y: number, z: number, minDist = 5.0, yTol = 11.5) => {
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i].p[1] - y) > yTol) continue;
        const dx = samples[i].p[0] - x;
        const dz = samples[i].p[2] - z;
        const req = minDist + (samples[i].w ?? 2.2);
        if (dx * dx + dz * dz < req * req) return false;
      }
      return true;
    };

    // Find the nearest sample's elevation so perimeter landmarks sit at camera eye-level
    const nearestTrackY = (x: number, z: number) => {
      let bestD = Infinity;
      let bestY = midY;
      for (let i = 0; i < samples.length; i += 4) {
        const dx = samples[i].p[0] - x;
        const dz = samples[i].p[2] - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          bestY = samples[i].p[1];
        }
      }
      return bestY;
    };

    // Trackside props & landmarks placed 26m-50m from the track at the local track elevation (`s.p[1] - 1.2`)
    // so cameras and the track are NEVER clipped by mountain layers or buildings!
    const props: { x: number; y: number; groundY: number; z: number; scale: number; rotY: number; variant: number }[] = [];
    for (let i = 0; i < 130; i++) {
      const s = samples[Math.floor((i / 130) * samples.length)];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = 26.0 + hash(i * 7.3) * 24;
      const rxDir = s.r[0];
      const rzDir = s.r[2];
      const len = Math.hypot(rxDir, rzDir) || 1;
      const x = s.p[0] + (rxDir / len) * side * dist + (hash(i * 3.1) - 0.5) * 4;
      const z = s.p[2] + (rzDir / len) * side * dist + (hash(i * 5.7) - 0.5) * 4;
      if (!isClearOfTrack(x, z, 22.0)) continue;
      props.push({
        x,
        y: s.p[1] - 1.2,
        groundY,
        z,
        scale: 0.92 + hash(i * 11.3) * 0.65,
        rotY: Math.atan2(s.p[0] - x, s.p[2] - z),
        variant: i % 5,
      });
    }

    // Dense Trackside Swiss Vignettes (Swiss Flags, Grazing Cows with Cowbells, Roadside Chalets & Snow Pines)
    // planted on BOTH sides of the sleek 0.58m barrier every ~7m so every camera angle is packed with Swiss life!
    const alpsTrackFlags: { x: number; y: number; z: number; rotY: number; variant: number }[] = [];
    for (let i = 10; i < samples.length - 14; i += 14) {
      const s = samples[i];
      const rxDir = s.r[0];
      const rzDir = s.r[2];
      const len = Math.hypot(rxDir, rzDir) || 1;
      for (const side of [-1, 1] as const) {
        if ((Math.floor(i / 14) + (side > 0 ? 0 : 1)) % 3 === 2) continue; // natural staggered rhythm on both sides
        const variant = (Math.floor(i / 14) + (side > 0 ? 0 : 2)) % 3;
        const offset = variant === 1 ? 2.55 : variant === 0 ? 1.95 : 1.35;
        const wTrack = (s.w ?? 2.2) + offset;
        const fx = s.p[0] + (rxDir / len) * side * wTrack;
        const fz = s.p[2] + (rzDir / len) * side * wTrack;
        const reqClear = variant === 1 ? 1.65 : variant === 0 ? 1.15 : 0.55;
        if (isClearOfTrack3D(fx, s.p[1], fz, reqClear, 9.5)) {
          alpsTrackFlags.push({
            x: fx,
            y: s.p[1] - 0.05,
            z: fz,
            rotY: Math.atan2(s.p[0] - fx, s.p[2] - fz),
            variant,
          });
        }
      }
    }

    // Overhead 3D Swiss Alpine Teleférico / Gondola Cable Car Spans across the track
    const alpsGondolas: { pos: [number, number, number]; rotY: number; spanW: number; cabOffset: number }[] = [];
    for (let i = 28; i < samples.length - 30; i += 58) {
      const s = samples[i];
      const rxDir = s.r[0];
      const rzDir = s.r[2];
      const len = Math.hypot(rxDir, rzDir) || 1;
      const spanW = (s.w ?? 2.2) + 3.2;
      const lx = s.p[0] - (rxDir / len) * spanW;
      const lz = s.p[2] - (rzDir / len) * spanW;
      const rxP = s.p[0] + (rxDir / len) * spanW;
      const rzP = s.p[2] + (rzDir / len) * spanW;
      if (isClearOfTrack3D(lx, s.p[1], lz, 1.2, 9.0) && isClearOfTrack3D(rxP, s.p[1], rzP, 1.2, 9.0)) {
        alpsGondolas.push({
          pos: [s.p[0], s.p[1], s.p[2]],
          rotY: Math.atan2(s.t[0], s.t[2]),
          spanW,
          cabOffset: ((Math.floor(i / 58) % 3) - 1) * 1.15,
        });
      }
    }

    // Close-Mid Swiss Alpine Pastures & Chalet Villages (8.0m-14.5m from the track, at s.p[1] + 0.35m so they sit
    // right at eye-level outside the 0.58m barrier in every follow-cam shot, using self-contained alpine knolls!)
    const alpsPastures: { x: number; y: number; groundY: number; z: number; scale: number; rotY: number; variant: number }[] = [];
    for (let i = 0; i < 180; i++) {
      const s = samples[Math.floor((i / 180) * samples.length)];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = 8.2 + hash(i * 6.1) * 6.0;
      const rxDir = s.r[0];
      const rzDir = s.r[2];
      const len = Math.hypot(rxDir, rzDir) || 1;
      const x = s.p[0] + (rxDir / len) * side * dist;
      const z = s.p[2] + (rzDir / len) * side * dist;
      if (!isClearOfTrack3D(x, s.p[1], z, 5.2, 11.5)) continue;
      if (alpsPastures.some((ap) => Math.hypot(ap.x - x, ap.z - z) < 8.2 && Math.abs(ap.y - s.p[1]) < 10.0)) continue;
      alpsPastures.push({
        x,
        y: s.p[1] + 0.35,
        groundY,
        z,
        scale: 1.05 + hash(i * 8.3) * 0.32,
        rotY: Math.atan2(s.p[0] - x, s.p[2] - z),
        variant: i % 3,
      });
    }

    // Outer perimeter ring (360 degrees around the entire circuit, strictly >= 44m clear of any track segment)
    const ring: { x: number; y: number; groundY: number; z: number; scale: number; rotY: number; variant: number }[] = [];
    const ringCount = 56;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2;
      const radMul = 0.96 + (i % 3) * 0.14 + hash(i * 9.1) * 0.12;
      const x = cx + Math.cos(a) * rx * radMul;
      const z = cz + Math.sin(a) * rz * radMul;
      if (!isClearOfTrack(x, z, 42.0)) continue;
      const ty = nearestTrackY(x, z);
      ring.push({
        x,
        y: ty - 2.5,
        groundY,
        z,
        scale: 1.05 + hash(i * 4.7) * 0.55,
        rotY: Math.atan2(cx - x, cz - z),
        variant: i % 5,
      });
    }

    const portals: { pos: [number, number, number]; basis: THREE.Matrix4; w: number; color: string }[] = [];

    return { groundY, cx, cz, rx, rz, props, ring, portals, alpsTrackFlags, alpsPastures, alpsGondolas };
  }, [race, theme.extraNeonArches, theme.neonPalette]);

  const towerTextures = useMemo(() => {
    if (theme.id === "tokyo") {
      return [
        makeWindowTowerTexture("#120828", "#ff007f", "#00f5ff", 1),
        makeWindowTowerTexture("#0e0620", "#b829ff", "#ffee00", 2),
        makeWindowTowerTexture("#160a30", "#00ff88", "#ff007f", 3),
      ];
    }
    if (theme.id === "newyork") {
      return [
        makeWindowTowerTexture("#10162b", "#ffd700", "#00d8ff", 4),
        makeWindowTowerTexture("#181224", "#ff2a55", "#ffffff", 5),
        makeWindowTowerTexture("#0d1322", "#ffd700", "#ff9900", 6),
      ];
    }
    return [];
  }, [theme.id]);

  const billboards = useMemo(() => {
    if (theme.id === "tokyo") {
      return [
        makeBillboardTexture("SHIBUYA GP", "NEO TOKYO 2027", "#14052b", "#ffffff", "#ff007f"),
        makeBillboardTexture("CYBER DRIFT", "TOKYO EXPRESS", "#05182b", "#00f5ff", "#ffee00"),
        makeBillboardTexture("MARBLE F1", "ROUND 1 · JAPAN", "#220536", "#ffee00", "#00ff88"),
      ];
    }
    if (theme.id === "newyork") {
      return [
        makeBillboardTexture("TIMES SQUARE", "WORLD FINALE", "#1a0612", "#ffffff", "#ffd700"),
        makeBillboardTexture("NEW YORK GP", "CHAMPIONSHIP", "#081438", "#ffd700", "#ff1e42"),
        makeBillboardTexture("BROADWAY", "MARBLE FORMULA", "#2b081c", "#00f5ff", "#ffd700"),
      ];
    }
    return [];
  }, [theme.id]);

  const vertSigns = useMemo(() => {
    if (theme.id === "tokyo") {
      return [
        makeVerticalSignTexture(["東", "京", "G", "P"], "#18042c", "#ffffff", "#ff007f"),
        makeVerticalSignTexture(["渋", "谷", "1", "0", "9"], "#041a2e", "#00f5ff", "#ffee00"),
        makeVerticalSignTexture(["極", "速", "電", "光"], "#26041c", "#ffee00", "#00ff88"),
        makeVerticalSignTexture(["新", "宿", "N", "E", "O"], "#0b082e", "#ff2a9d", "#00f5ff"),
      ];
    }
    return [];
  }, [theme.id]);

  return (
    <group>
      {/* High-Clearance 3D Cyber-Torii Gates (Tokyo) & Overhead Neon Portals (New York) */}
      {built.portals.map((pt, i) => {
        const q = new THREE.Quaternion().setFromRotationMatrix(pt.basis);
        const h = 3.6;
        return (
          <group key={`portal-${i}`} position={pt.pos} quaternion={q}>
            {theme.id === "tokyo" ? (
              <group>
                {/* Left & Right Vermilion Torii Columns planted outside the track walls */}
                {([-1, 1] as const).map((side) => (
                  <group key={side} position={[side * pt.w, 0, 0]}>
                    {/* Dark stone pedestal base (Nemaki) */}
                    <mesh position={[0, -0.25, 0]}>
                      <cylinderGeometry args={[0.22, 0.26, 0.9, 14]} />
                      <meshStandardMaterial color="#181524" roughness={0.6} metalness={0.5} />
                    </mesh>
                    {/* Main Vermilion-Red Column (Hashira) */}
                    <mesh position={[0, h * 0.5, 0]}>
                      <cylinderGeometry args={[0.14, 0.17, h, 16]} />
                      <meshStandardMaterial color="#d81b28" emissive="#550810" roughness={0.32} metalness={0.35} />
                    </mesh>
                    {/* Vertical Neon Strip facing the track */}
                    <mesh position={[-side * 0.15, h * 0.5, 0]}>
                      <boxGeometry args={[0.035, h * 0.86, 0.05]} />
                      <meshBasicMaterial color={new THREE.Color(pt.color).multiplyScalar(2.4)} toneMapped={false} />
                    </mesh>
                  </group>
                ))}
                {/* Lower Tie-Beam (Nuki) at y = 2.95m (well above camera height) */}
                <mesh position={[0, h - 0.65, 0]}>
                  <boxGeometry args={[pt.w * 2 + 0.7, 0.16, 0.18]} />
                  <meshStandardMaterial color="#d81b28" roughness={0.35} metalness={0.35} />
                </mesh>
                <mesh position={[0, h - 0.65, 0.11]}>
                  <boxGeometry args={[pt.w * 1.9, 0.05, 0.03]} />
                  <meshBasicMaterial color={new THREE.Color(pt.color).multiplyScalar(2.6)} toneMapped={false} />
                </mesh>
                {/* Upper Main Lintel (Kasagi) & Dark Cap at y = 3.6m */}
                <mesh position={[0, h, 0]}>
                  <boxGeometry args={[pt.w * 2 + 1.35, 0.22, 0.28]} />
                  <meshStandardMaterial color="#d81b28" roughness={0.35} metalness={0.35} />
                </mesh>
                <mesh position={[0, h + 0.14, 0]}>
                  <boxGeometry args={[pt.w * 2 + 1.55, 0.1, 0.34]} />
                  <meshStandardMaterial color="#161322" roughness={0.45} metalness={0.65} />
                </mesh>
                {/* Upturned Torii Eave Tips */}
                {([-1, 1] as const).map((side) => (
                  <mesh key={`tip-${side}`} position={[side * (pt.w + 0.72), h + 0.18, 0]} rotation={[0, 0, side * 0.22]}>
                    <boxGeometry args={[0.42, 0.12, 0.32]} />
                    <meshStandardMaterial color="#161322" roughness={0.45} metalness={0.65} />
                  </mesh>
                ))}
                {/* Central Tablet Strut (Gakuzuka) */}
                <mesh position={[0, h - 0.32, 0]}>
                  <boxGeometry args={[0.36, 0.55, 0.22]} />
                  <meshStandardMaterial color="#161322" metalness={0.7} roughness={0.3} />
                </mesh>
                <mesh position={[0, h - 0.32, 0.12]}>
                  <boxGeometry args={[0.24, 0.38, 0.03]} />
                  <meshBasicMaterial color={new THREE.Color("#ffee00").multiplyScalar(2.4)} toneMapped={false} />
                </mesh>
              </group>
            ) : (
              /* High-Clearance Broadway Neon Portal Arch for New York */
              <group>
                {([-1, 1] as const).map((side) => (
                  <mesh key={side} position={[side * pt.w, 1.1, 0]}>
                    <cylinderGeometry args={[0.09, 0.11, 2.2, 12]} />
                    <meshStandardMaterial color="#2a2018" metalness={0.8} roughness={0.3} />
                  </mesh>
                ))}
                <mesh position={[0, 2.2, 0]}>
                  <torusGeometry args={[pt.w, 0.048, 10, 36, Math.PI]} />
                  <meshBasicMaterial color={new THREE.Color(pt.color).multiplyScalar(2.8)} toneMapped={false} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}

      {/* ==================== SWISS ALPS: JAGGED MATTERHORN MASSIFS, TELEFÉRICO GONDOLAS, SWISS FLAGS, CHALETS & ALPINE COWS ==================== */}
      {theme.id === "alps" && (
        <group>
          {/* 0. Overhead 3D Swiss Alpine Teleférico / Gondola Cable Car Spans across the track */}
          {built.alpsGondolas.map((g, i) => (
            <group key={`gondola-${i}`} position={g.pos} rotation-y={g.rotY}>
              <SwissCableCarSpan spanW={g.spanW} cabOffset={g.cabOffset} />
            </group>
          ))}

          {/* 1. Dense Trackside Swiss Vignettes planted right outside the 0.58m barriers on BOTH sides of the track */}
          {built.alpsTrackFlags.map((fl, i) => (
            <group key={`sflag-${i}`} position={[fl.x, fl.y, fl.z]} rotation-y={fl.rotY}>
              {fl.variant === 0 ? (
                /* Roadside Alpine Meadow Knoll + 2 Spotted Swiss Cows with Golden Cowbells + Swiss Flag + Snow Pine */
                <group>
                  <mesh position={[0, -0.8, 0]}>
                    <cylinderGeometry args={[1.65, 2.35, 1.6, 8]} />
                    <meshStandardMaterial color="#34485c" roughness={0.88} flatShading />
                  </mesh>
                  <mesh position={[0, 0.04, 0]}>
                    <cylinderGeometry args={[1.6, 1.68, 0.2, 10]} />
                    <meshStandardMaterial color="#2f7034" roughness={0.78} />
                  </mesh>
                  <SwissCow
                    position={[-0.42, 0.14, 0.35]}
                    rotY={0.45}
                    scale={1.15}
                    spotColor={i % 3 === 0 ? "#7a3e18" : "#2b221c"}
                  />
                  <SwissCow
                    position={[0.55, 0.14, 0.22]}
                    rotY={-0.65}
                    scale={1.05}
                    spotColor={i % 2 === 0 ? "#8c4a20" : "#7a3e18"}
                  />
                  <group position={[0.05, 0.14, -0.55]}>
                    <SwissFlag poleH={2.65} flagSize={0.95} />
                  </group>
                  <group position={[-0.85, 0.14, -0.55]}>
                    <SwissPine scale={0.52} />
                  </group>
                </group>
              ) : fl.variant === 1 ? (
                /* Roadside Alpine Chalet Hamlet + Grazing Swiss Cow + Swiss Flag + Snow Pine */
                <group>
                  <mesh position={[0, -0.95, 0]}>
                    <cylinderGeometry args={[2.15, 2.95, 1.9, 8]} />
                    <meshStandardMaterial color="#34485c" roughness={0.88} flatShading />
                  </mesh>
                  <mesh position={[0, 0.04, 0]}>
                    <cylinderGeometry args={[2.1, 2.18, 0.22, 10]} />
                    <meshStandardMaterial color="#2f7034" roughness={0.78} />
                  </mesh>
                  <group position={[-0.25, 0.15, -0.35]} scale={0.44}>
                    <SwissChalet />
                  </group>
                  <SwissCow
                    position={[0.78, 0.15, 0.65]}
                    rotY={-0.55}
                    scale={1.12}
                    spotColor="#7a3e18"
                  />
                  <group position={[1.15, 0.15, -0.25]}>
                    <SwissFlag poleH={2.75} flagSize={0.98} />
                  </group>
                  <group position={[-1.25, 0.15, 0.35]}>
                    <SwissPine scale={0.56} />
                  </group>
                </group>
              ) : (
                /* Trackside Swiss Flag + Spotted Swiss Cow + Snow-Dusted Pine right behind the barrier */
                <group>
                  <mesh position={[0, -0.65, 0]}>
                    <cylinderGeometry args={[1.15, 1.65, 1.3, 8]} />
                    <meshStandardMaterial color="#34485c" roughness={0.88} flatShading />
                  </mesh>
                  <mesh position={[0, 0.03, 0]}>
                    <cylinderGeometry args={[1.1, 1.18, 0.18, 10]} />
                    <meshStandardMaterial color="#2f7034" roughness={0.78} />
                  </mesh>
                  <SwissFlag poleH={2.6} flagSize={0.92} />
                  <SwissCow
                    position={[0.35, 0.12, 0.32]}
                    rotY={-0.4}
                    scale={0.98}
                    spotColor="#2d241e"
                  />
                  <group position={[-0.55, 0.12, -0.28]}>
                    <SwissPine scale={0.46} />
                  </group>
                </group>
              )}
            </group>
          ))}

          {/* 2. Close-Mid Alpine Meadow Pastures (8.2m-14.2m from track): Self-contained rocky/grassy knolls with Chalets, Cow Herds, Flags & Pines */}
          {built.alpsPastures.map((ap, i) => {
            const knollH = 4.8 * ap.scale;
            const padR = 5.4 * ap.scale;
            return (
              <group key={`pasture-${i}`} position={[ap.x, ap.y, ap.z]} rotation-y={ap.rotY}>
                {/* Self-contained sculpted rocky alpine knoll (tapers cleanly so it never creates 50m pillars in lower switchbacks!) */}
                <mesh position={[0, -knollH * 0.5, 0]}>
                  <cylinderGeometry args={[padR * 0.96, padR * 0.42, knollH, 9]} />
                  <meshStandardMaterial color="#34485c" roughness={0.88} flatShading />
                </mesh>
                {/* Lush Green Swiss Alpine Meadow Terrace on top */}
                <mesh position={[0, 0.14, 0]}>
                  <cylinderGeometry args={[padR * 0.92, padR * 0.98, 0.36, 12]} />
                  <meshStandardMaterial color="#2f7034" roughness={0.78} />
                </mesh>
                {i % 2 === 0 ? (
                  /* Alpine Chalet + 2 Swiss Flags + 3 Grazing Cows + Snow Pines on the meadow */
                  <group>
                    <group position={[0, 0.28, -0.5 * ap.scale]} scale={ap.scale * 0.82}>
                      <SwissChalet />
                    </group>
                    <group position={[2.45 * ap.scale, 0.28, 1.7 * ap.scale]} rotation-y={0.4}>
                      <SwissFlag poleH={4.2} flagSize={1.28} />
                    </group>
                    <group position={[-2.55 * ap.scale, 0.28, 1.5 * ap.scale]} rotation-y={-0.3}>
                      <SwissFlag poleH={3.8} flagSize={1.15} />
                    </group>
                    <SwissCow
                      position={[-1.55 * ap.scale, 0.28, 2.55 * ap.scale]}
                      rotY={0.65}
                      scale={1.45 * ap.scale}
                      spotColor="#7a3e18"
                    />
                    <SwissCow
                      position={[0.45 * ap.scale, 0.28, 3.05 * ap.scale]}
                      rotY={-0.85}
                      scale={1.38 * ap.scale}
                      spotColor="#2d241e"
                    />
                    <SwissCow
                      position={[1.85 * ap.scale, 0.28, 2.45 * ap.scale]}
                      rotY={-0.45}
                      scale={1.32 * ap.scale}
                      spotColor="#8c4a20"
                    />
                    <group position={[-2.4 * ap.scale, 0.28, -1.2 * ap.scale]}>
                      <SwissPine scale={0.92 * ap.scale} />
                    </group>
                    <group position={[2.5 * ap.scale, 0.28, -1.1 * ap.scale]}>
                      <SwissPine scale={0.85 * ap.scale} />
                    </group>
                  </group>
                ) : (
                  /* Twin Chalet / Herd of 4 Spotted Swiss Alpine Cows with Golden Cowbells + Swiss Flag + Snow-Dusted Pines */
                  <group>
                    <group position={[1.1 * ap.scale, 0.28, -1.1 * ap.scale]} scale={ap.scale * 0.68}>
                      <SwissChalet />
                    </group>
                    <group position={[-1.8 * ap.scale, 0.28, -0.6 * ap.scale]} rotation-y={0.2}>
                      <SwissFlag poleH={4.4} flagSize={1.35} />
                    </group>
                    <SwissCow
                      position={[-1.75 * ap.scale, 0.28, 2.15 * ap.scale]}
                      rotY={0.45}
                      scale={1.52 * ap.scale}
                      spotColor="#7a3e18"
                    />
                    <SwissCow
                      position={[-0.15 * ap.scale, 0.28, 2.85 * ap.scale]}
                      rotY={-0.6}
                      scale={1.48 * ap.scale}
                      spotColor="#8c4a20"
                    />
                    <SwissCow
                      position={[1.55 * ap.scale, 0.28, 2.35 * ap.scale]}
                      rotY={-1.15}
                      scale={1.42 * ap.scale}
                      spotColor="#2b221c"
                    />
                    <SwissCow
                      position={[2.45 * ap.scale, 0.28, 1.05 * ap.scale]}
                      rotY={-0.75}
                      scale={1.34 * ap.scale}
                      spotColor="#7a3e18"
                    />
                    <group position={[-2.2 * ap.scale, 0.28, -1.5 * ap.scale]}>
                      <SwissPine scale={0.98 * ap.scale} />
                    </group>
                    <group position={[-0.6 * ap.scale, 0.28, -2.1 * ap.scale]}>
                      <SwissPine scale={0.84 * ap.scale} />
                    </group>
                  </group>
                )}
              </group>
            );
          })}

          {/* 3. Outer Perimeter Ring: Sculpted Jagged 3D Matterhorn & Eiger Massifs sloping all the way to groundY */}
          {built.ring.map((m, i) => {
            const peakH = (26 + (i % 4) * 8.0) * m.scale;
            const baseR = (11.5 + (i % 3) * 3.5) * m.scale;
            const cliffH = Math.max(4, m.y - m.groundY);
            const mainGeo = buildAlpineMountainGeo(baseR, peakH, cliffH, i + 11);
            const subGeo = buildAlpineMountainGeo(baseR * 0.65, peakH * 0.72, cliffH, i + 47);
            return (
              <group key={`mtn-${i}`} position={[m.x, m.y, m.z]} rotation-y={m.rotY}>
                <mesh geometry={mainGeo} castShadow receiveShadow>
                  <meshStandardMaterial vertexColors emissive="#2a486b" emissiveIntensity={0.22} roughness={0.68} metalness={0.05} flatShading />
                </mesh>
                <mesh
                  geometry={subGeo}
                  position={[baseR * 0.56, 0, baseR * 0.22]}
                  rotation-y={1.1}
                  castShadow
                  receiveShadow
                >
                  <meshStandardMaterial vertexColors emissive="#2a486b" emissiveIntensity={0.22} roughness={0.68} metalness={0.05} flatShading />
                </mesh>
              </group>
            );
          })}

          {/* 4. Mid-Ground Landmarks (26m-50m out): Jagged Alpine Peaks, Chalet Hamlets & Pine Ridges */}
          {built.props.map((p, i) => {
            const propY = p.y + 2.8;
            const cliffH = Math.min(12.0 * p.scale, Math.max(3.5, propY - p.groundY));
            if (i % 3 === 0) {
              /* Jagged 3D Matterhorn Sub-Massif */
              const peakH = (16.5 + (i % 4) * 4.0) * p.scale;
              const baseR = (6.4 + (i % 3) * 1.6) * p.scale;
              const geo = buildAlpineMountainGeo(baseR, peakH, cliffH, i + 103);
              return (
                <group key={`prop-mtn-${i}`} position={[p.x, propY, p.z]} rotation-y={p.rotY}>
                  <mesh geometry={geo} castShadow receiveShadow>
                    <meshStandardMaterial vertexColors emissive="#2a486b" emissiveIntensity={0.22} roughness={0.68} metalness={0.05} flatShading />
                  </mesh>
                </group>
              );
            }
            const padR = 5.6 * p.scale;
            return (
              <group key={`pine-${i}`} position={[p.x, propY, p.z]} rotation-y={p.rotY}>
                {/* Sculpted rocky mountain knoll */}
                <mesh position={[0, -cliffH * 0.5, 0]}>
                  <cylinderGeometry args={[padR * 0.94, padR * 0.55, cliffH, 9]} />
                  <meshStandardMaterial color="#364b61" roughness={0.86} flatShading />
                </mesh>
                {/* Green Alpine meadow or snow terrace cap */}
                <mesh position={[0, 0.12, 0]}>
                  <cylinderGeometry args={[padR * 0.9, padR * 0.95, 0.32, 12]} />
                  <meshStandardMaterial color={i % 2 === 0 ? "#2d6d32" : "#e8f3ff"} roughness={0.72} />
                </mesh>
                {i % 3 === 1 ? (
                  /* Detailed Swiss Alpine Chalet + Tall Swiss Flag + Grazing Cows */
                  <group>
                    <group position={[0, 0.25, -0.4]} scale={p.scale * 0.88}>
                      <SwissChalet />
                    </group>
                    <group position={[2.6 * p.scale, 0.25, 1.5 * p.scale]}>
                      <SwissFlag poleH={4.6} flagSize={1.35} />
                    </group>
                    <SwissCow
                      position={[-2.0 * p.scale, 0.25, 1.8 * p.scale]}
                      rotY={0.5}
                      scale={1.25 * p.scale}
                      spotColor="#7a3e18"
                    />
                    <SwissCow
                      position={[0.3 * p.scale, 0.25, 2.3 * p.scale]}
                      rotY={-0.7}
                      scale={1.2 * p.scale}
                      spotColor="#2d241e"
                    />
                  </group>
                ) : (
                  /* Cluster of 3 Snow-Capped Alpine Pine Trees + Swiss Flag */
                  <group scale={p.scale}>
                    <group position={[0, 0.25, 1.6]}>
                      <SwissFlag poleH={4.2} flagSize={1.25} />
                    </group>
                    {(
                      [
                        [0, -0.4, 1.05],
                        [-1.8, 0.9, 0.85],
                        [1.7, 0.8, 0.9],
                      ] as const
                    ).map(([tx, tz, ts], tIdx) => (
                      <group key={tIdx} position={[tx, 0.2, tz]}>
                        <SwissPine scale={ts} />
                      </group>
                    ))}
                  </group>
                )}
              </group>
            );
          })}
        </group>
      )}

      {/* ==================== TOKYO: SHIBUYA 109 TOWERS, SHINJUKU STEPPED SKYSCRAPERS, TOKYO TOWER & CYBER PAGODAS ==================== */}
      {theme.id === "tokyo" && (
        <group>
          {[...built.ring, ...built.props.filter((_, i) => i % 2 === 0)].map((b, i) => {
            const topY = b.y + (11 + (i % 4) * 5) * b.scale;
            const totalH = Math.max(14, topY - b.groundY);
            const w = (5.2 + (i % 3) * 1.8) * b.scale;
            const neonCol = theme.neonPalette[i % theme.neonPalette.length];
            const neonCol2 = theme.neonPalette[(i + 2) % theme.neonPalette.length];
            const tex = towerTextures[i % towerTextures.length];
            const bill = billboards[i % billboards.length];
            const vSignA = vertSigns[i % vertSigns.length];
            const vSignB = vertSigns[(i + 1) % vertSigns.length];
            const style = i % 5; // 0, 1: Shinjuku Stepped Setback Tower; 2: Shibuya 109 Cylindrical Tower; 3: 5-Tier Japanese Pagoda; 4: Red & White Tokyo Tower

            if (style === 3) {
              /* Archetype 3: Traditional-Meets-Cyber 5-Story Japanese Gojū-no-Tō Pagoda */
              const baseH = Math.max(2, b.y - b.groundY - 1);
              return (
                <group key={`tokyo-bldg-${i}`} position={[b.x, b.groundY, b.z]} rotation-y={b.rotY}>
                  {/* Stone Castle Wall Foundation (Ishigaki) up to track level */}
                  <mesh position={[0, baseH * 0.5, 0]}>
                    <cylinderGeometry args={[w * 0.68, w * 0.82, baseH, 4]} />
                    <meshStandardMaterial color="#252038" roughness={0.85} flatShading />
                  </mesh>
                  {/* 5 Stacked Vermilion Timber Stories & Swept Curved Eaves */}
                  {[0, 1, 2, 3, 4].map((tier) => {
                    const sc = 1 - tier * 0.13;
                    const ty = baseH + tier * 2.55;
                    const rw = w * 0.62 * sc;
                    return (
                      <group key={tier} position={[0, ty, 0]}>
                        {/* Vermilion Shrine Core */}
                        <mesh position={[0, 1.1, 0]}>
                          <boxGeometry args={[rw, 2.1, rw]} />
                          <meshStandardMaterial color="#b81924" emissive="#3d060c" roughness={0.45} metalness={0.25} />
                        </mesh>
                        {/* Warm Golden Shoji Lantern Window Band */}
                        <mesh position={[0, 1.1, 0]}>
                          <boxGeometry args={[rw * 1.02, 0.55, rw * 1.02]} />
                          <meshBasicMaterial color={new THREE.Color("#ffcf66").multiplyScalar(2.2)} toneMapped={false} />
                        </mesh>
                        {/* Swept Dark-Slate Pagoda Roof (Yane) */}
                        <mesh position={[0, 2.35, 0]} rotation-y={Math.PI / 4}>
                          <coneGeometry args={[rw * 1.18, 1.15, 4]} />
                          <meshStandardMaterial color="#161426" roughness={0.4} metalness={0.55} flatShading />
                        </mesh>
                        {/* Glowing Neon Under-Eave Trim */}
                        <mesh position={[0, 1.85, 0]}>
                          <boxGeometry args={[rw * 1.38, 0.08, rw * 1.38]} />
                          <meshBasicMaterial color={new THREE.Color(tier % 2 === 0 ? "#ff007f" : "#00f5ff").multiplyScalar(2.4)} toneMapped={false} />
                        </mesh>
                      </group>
                    );
                  })}
                  {/* Golden Sorin Finial Spire */}
                  <mesh position={[0, baseH + 14.5, 0]}>
                    <cylinderGeometry args={[0.08, 0.24, 3.6, 12]} />
                    <meshBasicMaterial color={new THREE.Color("#ffd700").multiplyScalar(2.8)} toneMapped={false} />
                  </mesh>
                </group>
              );
            }

            if (style === 4) {
              /* Archetype 4: Iconic Red & White Tokyo Tower Landmark with Observation Decks */
              return (
                <group key={`tokyo-bldg-${i}`} position={[b.x, b.groundY, b.z]} rotation-y={b.rotY}>
                  {/* 6 Alternating International-Orange & White Tapered Lattice Segments */}
                  {[0, 1, 2, 3, 4, 5].map((seg) => {
                    const segH = (totalH * 1.15) / 6;
                    const y0 = seg * segH;
                    const rBot = w * 0.58 * Math.pow(0.76, seg);
                    const rTop = w * 0.58 * Math.pow(0.76, seg + 1);
                    const isRed = seg % 2 === 0;
                    return (
                      <mesh key={seg} position={[0, y0 + segH * 0.5, 0]}>
                        <cylinderGeometry args={[rTop, rBot, segH, 4]} />
                        <meshStandardMaterial
                          color={isRed ? "#ff2814" : "#f5f8ff"}
                          emissive={isRed ? "#ff1e00" : "#cfe4ff"}
                          emissiveIntensity={0.48}
                          roughness={0.35}
                          metalness={0.6}
                        />
                      </mesh>
                    );
                  })}
                  {/* Main 2-Story Observation Deck */}
                  <mesh position={[0, totalH * 0.48, 0]}>
                    <boxGeometry args={[w * 0.68, 2.1, w * 0.68]} />
                    <meshStandardMaterial color="#f4f7fb" emissive="#00f5ff" emissiveIntensity={0.55} roughness={0.25} metalness={0.7} />
                  </mesh>
                  {/* Upper Special Observatory */}
                  <mesh position={[0, totalH * 0.86, 0]}>
                    <cylinderGeometry args={[w * 0.24, w * 0.24, 1.5, 16]} />
                    <meshBasicMaterial color={new THREE.Color("#ffee00").multiplyScalar(2.6)} toneMapped={false} />
                  </mesh>
                  {/* Radio Broadcast Spire & Aviation Beacon */}
                  <mesh position={[0, totalH * 1.15 + 3.2, 0]}>
                    <cylinderGeometry args={[0.08, 0.22, 6.4, 10]} />
                    <meshBasicMaterial color={new THREE.Color("#ff2814").multiplyScalar(2.8)} toneMapped={false} />
                  </mesh>
                </group>
              );
            }

            if (style === 2) {
              /* Archetype 2: Shibuya 109 Cylindrical Glass Tower + Multi-Story Retail Podium + Helipad */
              const podiumH = Math.max(7, totalH * 0.42);
              const cylR = w * 0.46;
              return (
                <group key={`tokyo-bldg-${i}`} position={[b.x, b.groundY, b.z]} rotation-y={b.rotY}>
                  {/* Lower Shibuya Crossing Retail Podium */}
                  <mesh position={[0, podiumH * 0.5, 0]}>
                    <boxGeometry args={[w * 1.14, podiumH, w * 1.05]} />
                    <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.85} roughness={0.3} metalness={0.65} />
                  </mesh>
                  {/* Signature Fluted Glass Cylinder Tower */}
                  <mesh position={[0, totalH * 0.55, w * 0.14]}>
                    <cylinderGeometry args={[cylR, cylR, totalH * 1.1, 28]} />
                    <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.95} roughness={0.22} metalness={0.75} />
                  </mesh>
                  {/* Glowing Neon Rings around Cylinder Crown */}
                  {[0.72, 0.88, 1.04].map((f, rk) => (
                    <mesh key={rk} position={[0, totalH * f, w * 0.14]} rotation-x={Math.PI / 2}>
                      <torusGeometry args={[cylR + 0.08, 0.06, 10, 32]} />
                      <meshBasicMaterial color={new THREE.Color(rk % 2 === 0 ? neonCol : neonCol2).multiplyScalar(2.6)} toneMapped={false} />
                    </mesh>
                  ))}
                  {/* Giant Shibuya Billboard on Podium Facade */}
                  <mesh position={[0, Math.max(4, totalH - 6.2), w * 0.54]}>
                    <planeGeometry args={[w * 0.94, w * 0.48]} />
                    <meshBasicMaterial map={bill} toneMapped={false} />
                  </mesh>
                  {/* Cantilevered Vertical Japanese Kanji Blade Sign */}
                  <mesh position={[w * 0.68, totalH * 0.72, w * 0.18]}>
                    <boxGeometry args={[0.14, 5.2, 1.25]} />
                    <meshBasicMaterial map={vSignA} toneMapped={false} />
                  </mesh>
                  {/* Illuminated Rooftop Helipad Ring */}
                  <mesh position={[0, totalH * 1.1 + 0.12, w * 0.14]} rotation-x={Math.PI / 2}>
                    <torusGeometry args={[cylR * 0.68, 0.07, 8, 24]} />
                    <meshBasicMaterial color={new THREE.Color("#00ff88").multiplyScalar(2.5)} toneMapped={false} />
                  </mesh>
                </group>
              );
            }

            /* Archetypes 0 & 1: Shinjuku Stepped Setback Megatower with Floor Slabs, Exoskeleton, Vertical Kanji Blade Signs & Rooftop HVAC */
            const h1 = totalH * 0.58;
            const h2 = totalH * 0.3;
            const h3 = totalH * 0.22;
            const w2 = w * 0.8;
            const w3 = w * 0.58;
            return (
              <group key={`tokyo-bldg-${i}`} position={[b.x, b.groundY, b.z]} rotation-y={b.rotY}>
                {/* Tier 1: Lower Podium & Mid-Rise Block */}
                <mesh position={[0, h1 * 0.5, 0]}>
                  <boxGeometry args={[w, h1, w]} />
                  <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.88} roughness={0.32} metalness={0.6} />
                </mesh>
                {/* Tier 2: Recessed Setback Upper Tower */}
                <mesh position={[0, h1 + h2 * 0.5, 0]}>
                  <boxGeometry args={[w2, h2, w2]} />
                  <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.92} roughness={0.28} metalness={0.68} />
                </mesh>
                {/* Tier 3: Penthouse Crown Block */}
                <mesh position={[0, h1 + h2 + h3 * 0.5, 0]}>
                  <boxGeometry args={[w3, h3, w3]} />
                  <meshStandardMaterial map={tex} emissiveMap={tex} emissive={neonCol} emissiveIntensity={0.65} roughness={0.25} metalness={0.75} />
                </mesh>
                {/* Projecting Structural Floor-Slab Ledges & Neon Setback Bands */}
                {[h1 * 0.45, h1 * 0.78, h1].map((ly, lk) => (
                  <mesh key={`slab-${lk}`} position={[0, ly, 0]}>
                    <boxGeometry args={[w * 1.05, 0.24, w * 1.05]} />
                    <meshStandardMaterial color="#18122b" emissive={lk === 2 ? neonCol : "#000000"} emissiveIntensity={lk === 2 ? 1.8 : 0} metalness={0.8} roughness={0.3} />
                  </mesh>
                ))}
                <mesh position={[0, h1 + h2, 0]}>
                  <boxGeometry args={[w2 * 1.06, 0.28, w2 * 1.06]} />
                  <meshBasicMaterial color={new THREE.Color(neonCol2).multiplyScalar(2.6)} toneMapped={false} />
                </mesh>
                {/* External Structural Steel Corner Columns */}
                {[-1, 1].map((sx) =>
                  [-1, 1].map((sz) => (
                    <mesh key={`${sx}-${sz}`} position={[sx * (w / 2 + 0.06), h1 * 0.5, sz * (w / 2 + 0.06)]}>
                      <boxGeometry args={[0.26, h1, 0.26]} />
                      <meshStandardMaterial color="#1a142e" metalness={0.85} roughness={0.25} />
                    </mesh>
                  )),
                )}
                {/* Cantilevered Vertical Japanese Kanji / Katakana Neon Blade Signs on both flanks */}
                <group position={[-w * 0.58, h1 + h2 * 0.35, w * 0.18]}>
                  <mesh position={[0.35, 1.4, 0]}>
                    <boxGeometry args={[0.7, 0.08, 0.08]} />
                    <meshStandardMaterial color="#2a2438" metalness={0.8} />
                  </mesh>
                  <mesh position={[0.35, -1.4, 0]}>
                    <boxGeometry args={[0.7, 0.08, 0.08]} />
                    <meshStandardMaterial color="#2a2438" metalness={0.8} />
                  </mesh>
                  <mesh>
                    <boxGeometry args={[0.14, 5.4, 1.3]} />
                    <meshBasicMaterial map={vSignA} toneMapped={false} />
                  </mesh>
                </group>
                <group position={[w * 0.58, h1 * 0.78, -w * 0.12]}>
                  <mesh>
                    <boxGeometry args={[0.14, 4.8, 1.2]} />
                    <meshBasicMaterial map={vSignB} toneMapped={false} />
                  </mesh>
                </group>
                {/* Framed 3D LED Jumbotron Screens at Track Camera Height */}
                <group position={[0, Math.max(4, h1 - 2.4), w / 2 + 0.18]}>
                  <mesh position={[0, 0, -0.08]}>
                    <boxGeometry args={[w * 0.94, w * 0.5, 0.18]} />
                    <meshStandardMaterial color="#120d22" metalness={0.8} roughness={0.3} />
                  </mesh>
                  <mesh position={[0, 0, 0.02]}>
                    <planeGeometry args={[w * 0.88, w * 0.44]} />
                    <meshBasicMaterial map={bill} toneMapped={false} />
                  </mesh>
                </group>
                {/* Detailed Rooftop HVAC Cooling Units + Twin Communications Masts */}
                <mesh position={[-w3 * 0.22, h1 + h2 + h3 + 0.55, 0]}>
                  <boxGeometry args={[w3 * 0.38, 1.1, w3 * 0.42]} />
                  <meshStandardMaterial color="#241e38" metalness={0.7} roughness={0.4} />
                </mesh>
                <mesh position={[w3 * 0.22, h1 + h2 + h3 + 2.4, 0]}>
                  <cylinderGeometry args={[0.05, 0.14, 4.8, 8]} />
                  <meshStandardMaterial color="#d0d8e8" metalness={0.9} roughness={0.2} />
                </mesh>
                <mesh position={[w3 * 0.22, h1 + h2 + h3 + 4.9, 0]}>
                  <sphereGeometry args={[0.18, 10, 10]} />
                  <meshBasicMaterial color={new THREE.Color("#ff1e42").multiplyScalar(3.2)} toneMapped={false} />
                </mesh>
              </group>
            );
          })}
        </group>
      )}

      {/* ==================== CAIRO: GREAT PYRAMIDS OF GIZA, OBELISKS & DESERT DUNES ==================== */}
      {theme.id === "cairo" && (
        <group>
          {/* Monumental Great Pyramids of Giza around the circuit */}
          {built.ring.map((m, i) => {
            const h = (16 + (i % 4) * 5) * m.scale;
            const r = h * 0.88;
            const mesaH = Math.max(1, m.y - m.groundY);
            return (
              <group key={`pyr-${i}`} position={[m.x, m.y, m.z]} rotation-y={m.rotY + Math.PI / 4}>
                {/* Sandstone Mesa Base */}
                <mesh position={[0, -mesaH * 0.5, 0]}>
                  <cylinderGeometry args={[r * 0.95, r * 1.15, mesaH, 4]} />
                  <meshStandardMaterial color="#b57c34" roughness={0.9} flatShading />
                </mesh>
                {/* Sandstone Pyramid Body */}
                <mesh position={[0, h * 0.5, 0]} castShadow receiveShadow>
                  <coneGeometry args={[r, h, 4]} />
                  <meshStandardMaterial color="#d49b4b" roughness={0.85} flatShading />
                </mesh>
                {/* Glowing Solid Gold Pyramidion Capstone */}
                <mesh position={[0, h * 0.88, 0]}>
                  <coneGeometry args={[r * 0.24, h * 0.24, 4]} />
                  <meshBasicMaterial color={new THREE.Color("#ffd700").multiplyScalar(3.5)} toneMapped={false} />
                </mesh>
              </group>
            );
          })}

          {/* Trackside Pharaoh Obelisks, Mini Pyramids & Desert Sand Dunes at track elevation */}
          {built.props.map((p, i) => {
            const mesaH = Math.max(1, p.y - p.groundY);
            return (
              <group key={`cairo-prop-${i}`} position={[p.x, p.y, p.z]} rotation-y={p.rotY}>
                <mesh position={[0, -mesaH * 0.5, 0]}>
                  <cylinderGeometry args={[3.0 * p.scale, 4.2 * p.scale, mesaH, 6]} />
                  <meshStandardMaterial color="#b87e36" roughness={0.9} flatShading />
                </mesh>
                {i % 3 === 0 ? (
                  /* Ancient Egyptian Obelisk with glowing gold & turquoise hieroglyphic rings */
                  <group scale={p.scale * 0.85}>
                    <mesh position={[0, 5.5, 0]} castShadow>
                      <cylinderGeometry args={[0.55, 1.1, 11, 4]} />
                      <meshStandardMaterial color="#c88d42" roughness={0.75} flatShading />
                    </mesh>
                    <mesh position={[0, 11.7, 0]}>
                      <coneGeometry args={[0.8, 1.5, 4]} />
                      <meshBasicMaterial color={new THREE.Color("#ffd700").multiplyScalar(3.6)} toneMapped={false} />
                    </mesh>
                    {[3, 6, 9].map((y, k) => (
                      <mesh key={k} position={[0, y, 0]}>
                        <boxGeometry args={[1.45 - k * 0.16, 0.36, 1.45 - k * 0.16]} />
                        <meshBasicMaterial color={new THREE.Color(k % 2 === 0 ? "#ffd700" : "#00f5d4").multiplyScalar(3.4)} toneMapped={false} />
                      </mesh>
                    ))}
                  </group>
                ) : i % 3 === 1 ? (
                  /* Trackside Golden Stepped Pyramid */
                  <group scale={p.scale} rotation-y={Math.PI / 4}>
                    <mesh position={[0, 4.2, 0]}>
                      <coneGeometry args={[4.5, 8.4, 4]} />
                      <meshStandardMaterial color="#d49b4b" roughness={0.82} flatShading />
                    </mesh>
                    <mesh position={[0, 7.4, 0]}>
                      <coneGeometry args={[1.1, 2.1, 4]} />
                      <meshBasicMaterial color={new THREE.Color("#ffd700").multiplyScalar(3.5)} toneMapped={false} />
                    </mesh>
                  </group>
                ) : (
                  /* Golden Desert Sand Dune Mound */
                  <mesh position={[0, 0.7, 0]} scale={[3.4 * p.scale, 1.0 * p.scale, 2.2 * p.scale]} receiveShadow>
                    <sphereGeometry args={[1.5, 12, 8]} />
                    <meshStandardMaterial color="#d69a4a" roughness={0.92} />
                  </mesh>
                )}
              </group>
            );
          })}
        </group>
      )}

      {/* ==================== SYDNEY: OPERA HOUSE SAILS, HARBOUR BRIDGE ARCHES & OCEAN YACHTS ==================== */}
      {theme.id === "sydney" && (
        <group>
          {built.ring.map((m, i) => {
            const pierH = Math.max(1, m.y - m.groundY);
            return (
              <group key={`syd-ring-${i}`} position={[m.x, m.y, m.z]} rotation-y={m.rotY}>
                <mesh position={[0, -pierH * 0.5, 0]}>
                  <boxGeometry args={[14 * m.scale, pierH, 10 * m.scale]} />
                  <meshStandardMaterial color="#2a4858" roughness={0.8} />
                </mesh>
                {i % 2 === 0 ? (
                  /* Iconic Sydney Opera House Interlocking Vaulted White Sails */
                  <group scale={m.scale * 1.1}>
                    <mesh position={[0, 0.8, 0]}>
                      <boxGeometry args={[16, 1.6, 10]} />
                      <meshStandardMaterial color="#d8cfc4" roughness={0.75} />
                    </mesh>
                    {[-4.0, 0, 4.0].map((ox, k) => (
                      <group key={k} position={[ox, 1.6, 0]} rotation-z={-0.18 + k * 0.06}>
                        <mesh position={[0, 4.8 + k * 1.0, 0]} rotation-x={0.28} scale={[0.65, 1.35, 1.0]}>
                          <coneGeometry args={[4.2, 8.2 + k * 1.2, 5, 1, false, 0, Math.PI]} />
                          <meshStandardMaterial color="#f7fbff" emissive="#bfefff" emissiveIntensity={0.35} roughness={0.28} metalness={0.15} side={THREE.DoubleSide} />
                        </mesh>
                      </group>
                    ))}
                  </group>
                ) : (
                  /* Sydney Harbour Bridge Steel Arch Span & Pylons */
                  <group scale={m.scale * 1.05}>
                    <mesh position={[0, 1.5, 0]}>
                      <torusGeometry args={[12, 0.75, 8, 32, Math.PI]} />
                      <meshStandardMaterial color="#4a6274" metalness={0.85} roughness={0.3} />
                    </mesh>
                    <mesh position={[0, 1.5, 0]}>
                      <torusGeometry args={[11.3, 0.22, 8, 32, Math.PI]} />
                      <meshBasicMaterial color={new THREE.Color("#00f5d4").multiplyScalar(3.4)} toneMapped={false} />
                    </mesh>
                    {[-12, 12].map((px) => (
                      <mesh key={px} position={[px, 5.5, 0]}>
                        <boxGeometry args={[2.4, 11, 3.2]} />
                        <meshStandardMaterial color="#c8c2b8" roughness={0.75} />
                      </mesh>
                    ))}
                  </group>
                )}
              </group>
            );
          })}

          {/* Trackside Illuminated Harbour Yachts & Opera Sails */}
          {built.props.map((p, i) => (
            <group key={`syd-prop-${i}`} position={[p.x, p.y, p.z]} rotation-y={p.rotY} scale={p.scale}>
              {/* Yacht Hull */}
              <mesh position={[0, 0.6, 0]}>
                <boxGeometry args={[2.2, 1.2, 5.4]} />
                <meshStandardMaterial color="#ffffff" roughness={0.3} />
              </mesh>
              {/* Illuminated Sail */}
              <mesh position={[0, 4.4, 0]}>
                <coneGeometry args={[1.8, 6.8, 3]} />
                <meshStandardMaterial color="#ffffff" emissive={i % 2 === 0 ? "#00f5d4" : "#ffcd00"} emissiveIntensity={0.6} roughness={0.35} />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {/* ==================== NEW YORK: TIMES SQUARE SKYSCRAPERS, EMPIRE STATE SPIRE & GIANT BILLBOARDS ==================== */}
      {theme.id === "newyork" && (
        <group>
          {[...built.ring, ...built.props.filter((_, i) => i % 2 === 0)].map((b, i) => {
            const topY = b.y + (11 + (i % 4) * 5) * b.scale;
            const totalH = Math.max(13, topY - b.groundY);
            const w = (5.2 + (i % 3) * 2.0) * b.scale;
            const tex = towerTextures[i % towerTextures.length];
            const bill = billboards[i % billboards.length];
            const neonCol = theme.neonPalette[i % theme.neonPalette.length];
            return (
              <group key={`nyc-bldg-${i}`} position={[b.x, b.groundY, b.z]} rotation-y={b.rotY}>
                {/* Main Skyscraper Tier */}
                <mesh position={[0, totalH * 0.5, 0]}>
                  <boxGeometry args={[w, totalH, w]} />
                  <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0.88} roughness={0.38} metalness={0.55} />
                </mesh>
                {/* Art-Deco Setback Upper Tier */}
                <mesh position={[0, totalH + 1.8, 0]}>
                  <boxGeometry args={[w * 0.65, 3.6, w * 0.65]} />
                  <meshStandardMaterial map={tex} emissiveMap={tex} emissive="#ffd700" emissiveIntensity={0.95} roughness={0.35} metalness={0.65} />
                </mesh>
                {/* Glowing Empire State Illuminated Spire */}
                <mesh position={[0, totalH + 5.8, 0]}>
                  <cylinderGeometry args={[0.12, 0.5, 5.2, 8]} />
                  <meshBasicMaterial color={new THREE.Color(neonCol).multiplyScalar(4.2)} toneMapped={false} />
                </mesh>
                {/* Giant Times Square LED Wrap-Around Billboards at camera height */}
                <mesh position={[0, Math.max(4, totalH - 4.2), w / 2 + 0.22]}>
                  <planeGeometry args={[w * 0.94, w * 0.52]} />
                  <meshBasicMaterial map={bill} toneMapped={false} />
                </mesh>
                <mesh position={[0, Math.max(2, totalH - 8.8), w / 2 + 0.22]}>
                  <planeGeometry args={[w * 0.88, w * 0.44]} />
                  <meshBasicMaterial map={billboards[(i + 1) % billboards.length]} toneMapped={false} />
                </mesh>
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
}
