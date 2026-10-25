import { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill } from "remotion";
import { disposeScene, marbleTextures } from "./Scene";
import { FLAGS } from "./flags";

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Dark high-contrast studio environment map (MoreBalls / Marbula One dark-room look):
 * Jet-black cyclorama walls so glass and black-chrome stay deep and saturated,
 * with crisp bright overhead softbox windows and neon rim strips for razor-sharp specular reflections.
 */
function darkNeonStudioScene() {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(50, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
      fragmentShader:
        "varying vec3 vP; void main(){ float h = vP.y * 0.5 + 0.5; vec3 c = mix(vec3(0.008,0.01,0.018), vec3(0.03,0.035,0.055), smoothstep(0.1, 0.9, h)); gl_FragColor = vec4(c,1.); }",
    }),
  );
  scene.add(room);
  const panel = (w: number, h: number, color: string, intensity: number, pos: [number, number, number], look: [number, number, number]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(...look);
    scene.add(m);
  };
  // Crisp studio softbox windows (creates the iconic white window reflections on the spheres)
  panel(18, 9, "#ffffff", 11, [-10, 26, 14], [0, 0, 0]); // key overhead softbox
  panel(6, 26, "#e8f2ff", 8, [-32, 12, 10], [0, 4, 0]); // left vertical strip window
  panel(6, 26, "#fff5e6", 7, [32, 12, 8], [0, 4, 0]); // right vertical strip window
  panel(24, 4, "#ff2a85", 5, [-18, 8, -32], [0, 2, 0]); // neon magenta back rim
  panel(24, 4, "#00e5ff", 5, [18, 8, -32], [0, 2, 0]); // neon cyan back rim
  panel(34, 2.5, "#ffcc00", 4.5, [0, 18, 34], [0, 0, 0]); // warm gold front fill strip
  return scene;
}

/**
 * High-resolution (1024x512) 3D Swirled Art-Glass + Glowing Neon/Chrome Ring texture
 * combining our `m1-ultra` swirled agate ribbons with `@moreballs` glowing neon/chrome equatorial bands.
 */
function ultraHeroMarbleTexture(
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  seedOffset = 1,
  mode: "swirl-neon" | "obsidian-neon" = "swirl-neon",
) {
  const W = 1024;
  const H = 512;

  const parseHex = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const c0 = parseHex(primaryHex);
  const c1 = parseHex(secondaryHex);
  const c2 = parseHex(accentHex);

  const colorData = new Uint8Array(W * H * 4);
  const mrData = new Uint8Array(W * H * 4);

  const sx = seedOffset * 1.37;
  const sy = seedOffset * 2.19;
  const sz = seedOffset * 3.11;

  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    const lat = (v - 0.5) * 2; // -1..1
    const absLat = Math.abs(lat);
    const theta = (1 - v) * Math.PI;
    const sinT = Math.sin(theta);
    const ny = Math.cos(theta);

    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const phi = u * Math.PI * 2;
      const nx = sinT * Math.cos(phi);
      const nz = sinT * Math.sin(phi);

      const idx = (y * W + x) * 4;

      // 2-stage 3D domain-warped curl noise on unit sphere
      const wx = nx * 2.5 + Math.sin(ny * 3.3 + sz) * 0.68 + Math.cos(nz * 2.8 + sx) * 0.48;
      const wy = ny * 2.5 + Math.sin(nz * 3.1 + sx) * 0.68 + Math.cos(nx * 3.0 + sy) * 0.48;
      const wz = nz * 2.5 + Math.sin(nx * 3.4 + sy) * 0.68 + Math.cos(ny * 2.7 + sz) * 0.48;

      const f1 = Math.sin(wx * 2.3 + Math.cos(wy * 2.6 + wz * 2.0));
      const f2 = Math.cos(wy * 2.9 - Math.sin(wz * 2.4 - wx * 2.2));
      const ribbon1 = Math.max(0, Math.min(1, 0.5 + 0.5 * Math.sin((f1 + f2) * 2.2)));
      const ribbon2 = Math.max(0, Math.min(1, Math.pow(0.5 + 0.5 * Math.cos(f1 * 3.5 - f2 * 2.7), 2.4)));
      const vein = Math.pow(Math.max(0, 1 - Math.abs(f1 - f2 * 0.6) * 4.5), 2.8);

      if (mode === "obsidian-neon") {
        // @moreballs mb-top1 style: glossy jet-black obsidian/chrome body with glowing neon racing bands & topographical swirls
        const mainBand = absLat < 0.23;
        const chromePin = Math.abs(absLat - 0.255) < 0.022 || Math.abs(absLat - 0.54) < 0.018;
        const topoLines = Math.pow(Math.max(0, Math.sin((f1 + f2) * 6.5)), 8.0);

        let r = 12,
          g = 14,
          b = 20;
        let rough = 0.05;
        let metal = 0.82;

        if (mainBand) {
          const core = 1 - Math.pow(absLat / 0.23, 2.2);
          r = c0[0] * (0.78 + 0.22 * core) + c1[0] * ribbon2 * 0.35;
          g = c0[1] * (0.78 + 0.22 * core) + c1[1] * ribbon2 * 0.35;
          b = c0[2] * (0.78 + 0.22 * core) + c1[2] * ribbon2 * 0.35;
          rough = 0.04;
          metal = 0.15;
        } else if (chromePin) {
          r = 250;
          g = 252;
          b = 255;
          rough = 0.03;
          metal = 1.0;
        } else if (topoLines > 0.15) {
          r = r + c0[0] * topoLines * 0.75;
          g = g + c0[1] * topoLines * 0.75;
          b = b + c0[2] * topoLines * 0.75;
          rough = 0.05;
          metal = 0.35;
        }

        colorData[idx] = Math.min(255, Math.max(0, Math.round(r)));
        colorData[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
        colorData[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
        colorData[idx + 3] = 255;
        mrData[idx] = 0;
        mrData[idx + 1] = Math.round(rough * 255);
        mrData[idx + 2] = Math.round(metal * 255);
        mrData[idx + 3] = 255;
      } else {
        // Rich swirled art-glass agate + golden mica veins + twin chrome pinstripes
        const chromeRing = Math.abs(absLat - 0.28) < 0.024;
        const goldPin = Math.abs(absLat - 0.315) < 0.014;
        if (chromeRing) {
          colorData[idx] = 248;
          colorData[idx + 1] = 250;
          colorData[idx + 2] = 255;
          colorData[idx + 3] = 255;
          mrData[idx] = 0;
          mrData[idx + 1] = 8;
          mrData[idx + 2] = 255;
          mrData[idx + 3] = 255;
        } else if (goldPin) {
          colorData[idx] = 255;
          colorData[idx + 1] = 208;
          colorData[idx + 2] = 50;
          colorData[idx + 3] = 255;
          mrData[idx] = 0;
          mrData[idx + 1] = 12;
          mrData[idx + 2] = 240;
          mrData[idx + 3] = 255;
        } else {
          const depth = 0.72 + 0.34 * (0.5 + 0.5 * (f1 * 0.6 + f2 * 0.4));
          const w1 = ribbon1 * 0.68;
          const w2 = ribbon2 * 0.52;
          const w0 = Math.max(0, 1 - w1 - w2 * 0.65);
          const norm = w0 + w1 + w2 || 1;
          let r = ((c0[0] * w0 + c1[0] * w1 + c2[0] * w2) / norm) * depth;
          let g = ((c0[1] * w0 + c1[1] * w1 + c2[1] * w2) / norm) * depth;
          let b = ((c0[2] * w0 + c1[2] * w1 + c2[2] * w2) / norm) * depth;

          if (vein > 0.04) {
            r = r * (1 - vein * 0.72) + 255 * vein * 0.72;
            g = g * (1 - vein * 0.72) + 218 * vein * 0.72;
            b = b * (1 - vein * 0.72) + 120 * vein * 0.72;
          }

          colorData[idx] = Math.min(255, Math.max(0, Math.round(r)));
          colorData[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
          colorData[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
          colorData[idx + 3] = 255;

          const rough = Math.round((0.045 + (1 - ribbon1) * 0.045 - vein * 0.03) * 255);
          const metal = Math.round((0.12 + vein * 0.78 + ribbon2 * 0.14) * 255);
          mrData[idx] = 0;
          mrData[idx + 1] = Math.min(255, Math.max(8, rough));
          mrData[idx + 2] = Math.min(255, Math.max(0, metal));
          mrData[idx + 3] = 255;
        }
      }
    }
  }

  const map = new THREE.DataTexture(colorData, W, H, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 16;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;

  const mr = new THREE.DataTexture(mrData, W, H, THREE.RGBAFormat);
  mr.colorSpace = THREE.NoColorSpace;
  mr.anisotropy = 16;
  mr.generateMipmaps = true;
  mr.minFilter = THREE.LinearMipmapLinearFilter;
  mr.magFilter = THREE.LinearFilter;
  mr.needsUpdate = true;

  return { map, mr };
}

function DarkStudioEnv({ bg = "#05060b", envIntensity = 1.6 }: { bg?: string; envIntensity?: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useMemo(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.15;
    const pmrem = new THREE.PMREMGenerator(gl);
    const studio = darkNeonStudioScene();
    scene.environment = pmrem.fromScene(studio, 0, 0.1, 200, { size: 512 }).texture;
    disposeScene(studio);
    scene.environmentIntensity = envIntensity;
    scene.background = new THREE.Color(bg);
    pmrem.dispose();
  }, [gl, scene, bg, envIntensity]);
  return null;
}

function IconScene() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.fov = 30;
  camera.near = 0.1;
  camera.far = 120;
  camera.position.set(0, 2.75, 6.2);
  camera.lookAt(0, 0.55, -0.8);
  camera.updateProjectionMatrix();

  const rainbowCols = [
    ["#00e5ff", "#0055ff"], // 0: Electric Cyan Obsidian
    ["#ff00aa", "#00e5ff"], // 1: Neon Magenta/Cyan Swirl
    ["#ff5500", "#ffee00"], // 2: Fiery Orange Obsidian
    ["#00ff66", "#00b4d8"], // 3: Neon Emerald Obsidian
    ["#8338ec", "#ff006e"], // 4: Deep Violet/Pink Swirl
    ["#ff0055", "#ffcc00"], // 5: Crimson/Gold Obsidian
    ["#ffcc00", "#ffffff"], // 6: Gold/White Obsidian
    ["#3a86ff", "#8338ec"], // 7: Cobalt/Violet Swirl
  ];

  const palettes = useMemo(() => {
    const list: { map: THREE.DataTexture; mr: THREE.DataTexture }[] = [];
    for (let i = 0; i < rainbowCols.length; i++) {
      const [c0, c1] = rainbowCols[i];
      list.push(ultraHeroMarbleTexture(c0, c1, "#ffffff", i + 1, "obsidian-neon"));
      list.push(ultraHeroMarbleTexture(c0, c1, "#ffffff", i + 20, "swirl-neon"));
    }
    return list;
  }, []);

  const slope = 0.28;
  const sinS = Math.sin(slope);
  const cosS = Math.cos(slope);

  // Tight, high-drama pack of 14 Banner-style Obsidian-Neon & Swirled Marbles charging down the rainbow lanes
  const iconMarbles = useMemo(() => {
    const layout: [number, number, number, number, [number, number, number]][] = [
      // Front-center lead duel: Obsidian-Cyan topo + Neon Magenta/Cyan swirl + Obsidian-Orange
      [-0.58, 2.15, 0.54, 0, [0.55, 0.42, -0.35]],
      [0.62, 1.95, 0.54, 3, [0.48, -0.55, 0.28]],
      [0.02, 0.92, 0.56, 4, [0.62, 0.25, -0.42]],
      // Second wave flanking tightly on the glowing lanes
      [-1.32, 0.85, 0.50, 10, [0.38, 0.75, -0.22]],
      [1.34, 0.78, 0.50, 6, [0.52, -0.62, 0.35]],
      [-0.68, -0.28, 0.48, 9, [0.44, -0.38, 0.51]],
      [0.68, -0.32, 0.48, 12, [0.58, 0.48, -0.28]],
      // Third wave filling the upper half of the circular icon
      [0.0, -1.35, 0.46, 2, [0.35, 0.65, -0.4]],
      [-1.25, -1.42, 0.45, 15, [0.6, -0.4, 0.3]],
      [1.25, -1.45, 0.45, 1, [0.42, 0.55, -0.35]],
      [-0.62, -2.55, 0.42, 7, [0.5, -0.5, 0.2]],
      [0.62, -2.58, 0.42, 8, [0.45, 0.35, -0.45]],
      [-1.78, -0.35, 0.44, 5, [0.52, 0.22, -0.38]],
      [1.78, -0.38, 0.44, 11, [0.48, -0.32, 0.42]],
    ];
    return layout.map(([x, sDist, r, pal, rot]) => {
      const y = -sDist * sinS + r * cosS;
      const z = sDist * cosS + r * sinS;
      return { pos: [x, y, z] as [number, number, number], r, pal: pal % palettes.length, rot };
    });
  }, [palettes.length, sinS, cosS]);

  const laneColors = ["#ff00aa", "#ff1e27", "#ff6a00", "#ffcc00", "#00ff66", "#00e5ff", "#3a86ff", "#8338ec", "#ff0055"];

  return (
    <>
      <DarkStudioEnv bg="#04050a" envIntensity={1.85} />
      <directionalLight position={[5, 12, 8]} intensity={3.8} color="#fff4e0" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.00015} />
      <directionalLight position={[-6, 7, -3]} intensity={2.2} color="#38bdf8" />
      <pointLight position={[-3.5, 2.0, 2.5]} intensity={4.5} distance={12} color="#ff007f" />
      <pointLight position={[3.5, 2.0, 2.5]} intensity={4.5} distance={12} color="#00e5ff" />
      <pointLight position={[0, 2.8, -1.5]} intensity={4.0} distance={14} color="#ffcc00" />

      {/* Sloped 3D Rainbow Starting Deck identical in material & lighting to BannerScene */}
      <group rotation={[slope, 0, 0]}>
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[24, 28]} />
          <meshPhysicalMaterial color="#05070e" roughness={0.14} metalness={0.85} clearcoat={0.95} clearcoatRoughness={0.07} />
        </mesh>
        {laneColors.map((col, i) => {
          const x = (i - 4) * 0.68;
          return (
            <group key={i}>
              <mesh position={[x, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[0.18, 28]} />
                <meshStandardMaterial color={col} emissive={col} emissiveIntensity={2.1} roughness={0.2} toneMapped={false} />
              </mesh>
              <mesh position={[x + 0.34, 0.05, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.038, 0.1, 28]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.96} roughness={0.1} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Pack of Banner-style Obsidian-Neon & Swirled 3D Marbles */}
      {iconMarbles.map((m, idx) => {
        const tex = palettes[m.pal];
        return (
          <mesh key={idx} position={m.pos} rotation={m.rot} castShadow receiveShadow>
            <sphereGeometry args={[m.r, 96, 96]} />
            <meshPhysicalMaterial map={tex.map} metalnessMap={tex.mr} roughnessMap={tex.mr} metalness={1} roughness={1} clearcoat={1} clearcoatRoughness={0.025} envMapIntensity={1.85} />
          </mesh>
        );
      })}
    </>
  );
}

export function ChannelIcon() {
  return (
    <AbsoluteFill style={{ background: "#04050a" }}>
      <ThreeCanvas width={1000} height={1000} dpr={2} shadows gl={{ antialias: true, alpha: false }}>
        <IconScene />
      </ThreeCanvas>
    </AbsoluteFill>
  );
}

function BannerScene() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.fov = 32;
  camera.near = 0.1;
  camera.far = 180;
  camera.position.set(0, 3.2, 8.8);
  camera.lookAt(0, 1.35, -2.0);
  camera.updateProjectionMatrix();

  const rainbowCols = [
    ["#ff0055", "#ffcc00"],
    ["#ff5500", "#ffee00"],
    ["#ffcc00", "#ffffff"],
    ["#00ff66", "#00b4d8"],
    ["#00e5ff", "#0055ff"],
    ["#3a86ff", "#8338ec"],
    ["#8338ec", "#ff006e"],
    ["#ff00aa", "#00e5ff"],
  ];

  // Build 18 distinct high-res marble textures (half obsidian-neon, half swirled art-glass)
  const palettes = useMemo(() => {
    const codes = Object.keys(FLAGS);
    const list: { map: THREE.DataTexture; mr: THREE.DataTexture }[] = [];
    for (let i = 0; i < rainbowCols.length; i++) {
      const [c0, c1] = rainbowCols[i];
      list.push(ultraHeroMarbleTexture(c0, c1, "#ffffff", i + 1, "obsidian-neon"));
      list.push(ultraHeroMarbleTexture(c0, c1, "#ffffff", i + 20, "swirl-neon"));
    }
    for (let i = 0; i < 6; i++) {
      const code = codes[i % codes.length];
      list.push(marbleTextures(code, code));
    }
    return list;
  }, []);

  // Sloped 3D rainbow starting ramp (`slope = 0.24 rad`) so lanes & marbles fill the entire 2560x1440 frame from bottom to top!
  const slope = 0.24;
  const sinS = Math.sin(slope);
  const cosS = Math.cos(slope);

  const marbles = useMemo(() => {
    const arr: { pos: [number, number, number]; rot: [number, number, number]; r: number; pal: number }[] = [];
    // Foreground lineup of 10 hero marbles across the bottom/sides + 120 marbles racing down the sloped lanes
    const fgPositions: [number, number, number, number][] = [
      [-4.2, 3.6, 0.64, 0],
      [-2.95, 3.9, 0.6, 1],
      [-1.75, 4.2, 0.56, 2],
      [1.75, 4.2, 0.56, 7],
      [2.95, 3.9, 0.6, 8],
      [4.2, 3.6, 0.64, 9],
      [-5.3, 2.8, 0.58, 4],
      [5.3, 2.8, 0.58, 6],
    ];
    for (const [x, sDist, r, pal] of fgPositions) {
      const y = -sDist * sinS + r * cosS;
      const z = sDist * cosS + r * sinS;
      arr.push({ pos: [x, y, z], rot: [0.45, x * 0.4, -0.25], r, pal });
    }
    for (let i = 0; i < 145; i++) {
      const x = (hash(i * 13 + 1) - 0.5) * 18.5;
      const sDist = -14 + hash(i * 17 + 2) * 19.0;
      const r = 0.36 + hash(i * 19 + 3) * 0.14;
      const y = -sDist * sinS + r * cosS;
      const z = sDist * cosS + r * sinS;
      let ok = true;
      for (const m of arr) {
        if (Math.hypot(m.pos[0] - x, m.pos[1] - y, m.pos[2] - z) < m.r + r + 0.08) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      arr.push({
        pos: [x, y, z],
        rot: [hash(i * 23) * Math.PI, hash(i * 29) * Math.PI * 2, hash(i * 31) * Math.PI],
        r,
        pal: i % palettes.length,
      });
    }
    return arr;
  }, [palettes.length, sinS, cosS]);

  const laneColors = ["#ff00aa", "#ff1e27", "#ff6a00", "#ffcc00", "#80ff00", "#00ff66", "#00e5ff", "#0077ff", "#7a00ff", "#c13fd6", "#ff0055", "#ffcc00"];

  return (
    <>
      <DarkStudioEnv bg="#04050a" envIntensity={1.75} />
      <directionalLight position={[6, 14, 9]} intensity={3.8} color="#fff4e0" castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.00015} />
      <directionalLight position={[-8, 8, -4]} intensity={2.2} color="#38bdf8" />
      <pointLight position={[-5, 2.5, 3]} intensity={5} distance={16} color="#ff007f" />
      <pointLight position={[5, 2.5, 3]} intensity={5} distance={16} color="#00e5ff" />
      <pointLight position={[0, 3.5, -2]} intensity={4.5} distance={18} color="#ffcc00" />

      {/* Sloped 3D Rainbow Starting Deck filling the entire 2560x1440 viewport */}
      <group rotation={[slope, 0, 0]}>
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[44, 44]} />
          <meshPhysicalMaterial color="#05070e" roughness={0.14} metalness={0.85} clearcoat={0.95} clearcoatRoughness={0.07} />
        </mesh>
        {laneColors.map((col, i) => {
          const x = (i - 5.5) * 1.45;
          return (
            <group key={i}>
              <mesh position={[x, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[0.26, 42]} />
                <meshStandardMaterial color={col} emissive={col} emissiveIntensity={2.0} roughness={0.2} toneMapped={false} />
              </mesh>
              <mesh position={[x + 0.725, 0.06, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.05, 0.12, 42]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.96} roughness={0.1} />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* 120+ 3D WebGL Marbles rolling down the sloped rainbow deck */}
      {marbles.map((m, idx) => {
        const tex = palettes[m.pal];
        return (
          <mesh key={idx} position={m.pos} rotation={m.rot} castShadow receiveShadow>
            <sphereGeometry args={[m.r, 64, 64]} />
            <meshPhysicalMaterial map={tex.map} metalnessMap={tex.mr} roughnessMap={tex.mr} metalness={1} roughness={1} clearcoat={1} clearcoatRoughness={0.03} envMapIntensity={1.8} />
          </mesh>
        );
      })}
    </>
  );
}

export function ChannelBanner() {
  return (
    <AbsoluteFill style={{ background: "#04050a", fontFamily: "'Avenir Next', 'Montserrat', 'Helvetica Neue', sans-serif" }}>
      <ThreeCanvas width={2560} height={1440} dpr={1} shadows gl={{ antialias: true, alpha: false }}>
        <BannerScene />
      </ThreeCanvas>
      {/* Center safe-zone radial scrim so the title pops against the 3D marbles */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 44% 22% at 50% 50%, rgba(4,5,12,0.86) 0%, rgba(4,5,12,0.58) 68%, rgba(4,5,12,0.18) 100%)",
        }}
      />
      {/* YouTube Banner Safe Area (1546 x 423 centered at 1280, 720) */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            <span
              style={{
                background: "#ffcc00",
                color: "#111216",
                fontWeight: 900,
                fontSize: 24,
                padding: "6px 18px",
                borderRadius: 8,
                letterSpacing: 1.5,
                boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
              }}
            >
              4K · 60 FPS
            </span>
            <span
              style={{
                background: "#e10600",
                color: "#ffffff",
                fontWeight: 900,
                fontSize: 24,
                padding: "6px 18px",
                borderRadius: 8,
                letterSpacing: 1.5,
                boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
              }}
            >
              3D MARBLE RACING
            </span>
            <span
              style={{
                background: "rgba(255,255,255,0.96)",
                color: "#111216",
                fontWeight: 900,
                fontSize: 24,
                padding: "6px 18px",
                borderRadius: 8,
                letterSpacing: 1.5,
                boxShadow: "0 6px 20px rgba(0,0,0,0.6)",
              }}
            >
              100% REAL PHYSICS
            </span>
          </div>
          <div
            style={{
              fontSize: 118,
              fontWeight: 900,
              color: "#ffffff",
              letterSpacing: 4,
              lineHeight: 0.98,
              textShadow: "0 10px 36px rgba(0,0,0,0.95), 0 3px 0 #000",
              WebkitTextStroke: "3px #05060c",
            }}
          >
            MARBLE FORMULA
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 30,
              fontWeight: 800,
              color: "#ffcc00",
              letterSpacing: 8,
              textShadow: "0 4px 18px rgba(0,0,0,0.95)",
            }}
          >
            ELIMINATION RACES · CHAMPIONSHIP · ASMR
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
