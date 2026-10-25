import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { continueRender, delayRender } from "remotion";
import * as THREE from "three";
import { useView } from "./view";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import skyExr from "@pmndrs/assets/hdri/sky.exr.js";
import { useSubframe } from "./subframe";
import { drawFlag, FLAGS } from "./flags";
import { buildTrackMesh, floorVRange, pointInFrame, pointOnTrack, TRACK, TRACK_DEPTH, troughProfile } from "./trackMesh.js";
import { lensFov, type Layout, type Race, type Vec3 } from "./race";
import { spinnerParts } from "./rotor.js";
import { turntableParts } from "./obstacles/turntable.js";
import { asphaltMaps, floorMaps, grassMaps, plasticMaps } from "./surfaces";
import { isNight } from "./look";
import { boltGeometry } from "./Details";
import { getCircuitTheme } from "./Themes";

// The 3D world, in a clean studio look: a seamless white set, a glossy white
// half-pipe with rainbow lanes, chrome marbles. Geometry comes from the same
// samples the physics used (src/gp/trackMesh.js).

type Sample = { u: number; p: Vec3; t: Vec3; r: Vec3; n: Vec3; curv: number; w?: number; gap?: boolean };
type Quat = [number, number, number, number];

// A light grey-blue set (not pure white) so the white track reads against it.
// A mid-grey studio backdrop: the white track reads against it, and the key
// light's pool and falloff show (on pure white everything looks flat).
// An outdoor circuit on a clear day: the sky HDRI is the backdrop, the haze is pale blue.
export const STUDIO = { background: "#a9c6e4", floor: "#5f9344", fog: "#c6d8ea" };
// Lane colours, left to right.
const LANES = ["#c13fd6", "#e8414a", "#f7862c", "#f5c824", "#9ad84a", "#43c25a", "#2bc0d6", "#3c9fe0", "#3c6fe0", "#7a4ee0"];

// Deterministic pseudo-random (Math.random would differ between render tabs).
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function CameraRig({ race, layout, frame }: { race: Race; layout: Layout; frame: number }) {
  const view = useView(race);
  const sub = useSubframe();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const set = (vf: number) => {
    const shot = view.shotAt(vf);
    // Narrower frames (a portrait video, a half of a split screen) widen the lens so about as much of the scene fits.
    camera.fov = lensFov(shot.fov, camera.aspect, layout);
    camera.near = 0.05;
    camera.far = 1500;
    camera.updateProjectionMatrix();
    camera.position.set(...shot.pos);
    camera.lookAt(...shot.target);
  };
  set(frame);
  useEffect(() => sub.subscribe(set), [sub, view, layout, camera]);
  return null;
}

/** Frees the geometries and materials of a scene built only to be baked (the studio for the environment map). */
export function disposeScene(scene: THREE.Scene) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) mat.dispose();
  });
}

/**
 * A photo studio built as a tiny scene and baked into the environment map:
 * dark grey walls, a big overhead softbox, two tall strip lights and a warm
 * kicker behind. Chrome reflects real black-and-white structure (that's what
 * makes it read as chrome), and the diffuse light it gives is directional
 * instead of flat.
 */
export function studioScene() {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(50, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {},
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
      // Darker below, lighter grey above: a cyclorama seen from inside.
      fragmentShader:
        "varying vec3 vP; void main(){ float h = vP.y * 0.5 + 0.5; vec3 c = mix(vec3(0.09,0.095,0.11), vec3(0.46,0.47,0.5), smoothstep(0.2, 0.9, h)); gl_FragColor = vec4(c,1.); }",
    }),
  );
  scene.add(room);
  const panel = (w: number, h: number, color: string, intensity: number, pos: Vec3, look: Vec3) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    scene.add(m);
  };
  panel(26, 12, "#ffffff", 7, [0, 30, 4], [0, 0, 0]); // overhead softbox
  panel(5, 30, "#f4f6ff", 5, [-34, 10, 6], [0, 6, 0]); // left strip
  panel(5, 30, "#f4f6ff", 4, [34, 10, -8], [0, 6, 0]); // right strip
  panel(18, 6, "#ffe9cf", 3, [0, 8, -38], [0, 4, 0]); // warm kicker behind
  panel(40, 3, "#ffffff", 2.2, [0, 18, 36], [0, 0, 0]); // thin front fill
  // Black flags: a reflective surface needs dark areas to show its shape.
  const flag = (w: number, h: number, pos: Vec3, look: Vec3) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: "#000000", side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    scene.add(m);
  };
  flag(14, 24, [26, 8, 20], [0, 6, 0]);
  flag(14, 24, [-26, 8, -22], [0, 6, 0]);
  return scene;
}

/**
 * Lighting environment: a real sky HDRI lights the scene and is the backdrop.
 * Until it has loaded — the render is held meanwhile — the procedural studio
 * stands in.
 */
export function Environment({ race }: { race?: Race }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const advance = useThree((s) => s.advance);
  const skyColor = race ? getCircuitTheme(race).skyColor : "#07080b";
  useMemo(() => {
    // Tone mapping happens once, at the end of the effect chain (src/gp/Effects.tsx).
    gl.toneMapping = THREE.NoToneMapping;
    const pmrem = new THREE.PMREMGenerator(gl);
    const studio = studioScene();
    scene.environment = pmrem.fromScene(studio, 0, 0.1, 200, { size: 512 }).texture;
    disposeScene(studio);
    scene.environmentIntensity = 0.55;
    if (isNight()) {
      // The dark studio: its softboxes are what the metal and the marbles reflect.
      scene.environmentIntensity = 0.72;
      scene.background = new THREE.Color(skyColor);
    }
    pmrem.dispose();
  }, [gl, scene, skyColor]);
  useEffect(() => {
    if (isNight()) return; // no sky at night
    const handle = delayRender("Loading the studio HDRI");
    let cancelled = false;
    new EXRLoader()
      .loadAsync(skyExr)
      .then((tex) => {
        if (cancelled) return;
        // The sky's sun peaks at ~22 700. The directional light already is the sun; left in,
        // the rough (painted) surfaces spread that peak into big blown-out white blobs.
        // (Half floats, as loaded: a float texture can't be filtered on every GPU.)
        const px = tex.image.data as Uint16Array;
        const { fromHalfFloat: from, toHalfFloat: to } = THREE.DataUtils;
        const CAP = 12;
        for (let i = 0; i < px.length; i += 4) {
          const m = Math.max(from(px[i]), from(px[i + 1]), from(px[i + 2]));
          if (m > CAP) for (let c = 0; c < 3; c++) px[i + c] = to((from(px[i + c]) * CAP) / m);
        }
        tex.needsUpdate = true;
        const pmrem = new THREE.PMREMGenerator(gl);
        scene.environment = pmrem.fromEquirectangular(tex).texture;
        scene.environmentIntensity = 0.65; // the sky fills, the sun (capped out of the sky, a light of its own) models
        tex.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = tex;
        scene.backgroundBlurriness = 0.015;
        scene.backgroundIntensity = 0.9;
        gl.toneMappingExposure = 0.85;
        pmrem.dispose();
        advance(performance.now());
      })
      .catch((err) => console.error("studio HDRI failed to load, keeping the procedural studio", err))
      .finally(() => continueRender(handle));
    return () => {
      cancelled = true;
    };
  }, [gl, scene, advance]);
  return null;
}

/**
 * Key light: a soft spotlight high above the action that follows the camera
 * target. It pools light where the marbles are and falls off into shade
 * around them, so the frame has a lit subject instead of even, flat light.
 */
export function Sun({ target, pos, race }: { target: Vec3; pos?: Vec3; race?: Race }) {
  const theme = race ? getCircuitTheme(race) : null;
  const { sun, rim } = useMemo(() => {
    // Late-afternoon sun or themed circuit key light:
    const l = isNight()
      ? new THREE.DirectionalLight(theme ? theme.sunColor : "#dfe8ff", theme ? theme.sunIntensity : 2.25)
      : new THREE.DirectionalLight("#ffd9a6", 3.2);
    l.castShadow = true;
    l.shadow.mapSize.set(4096, 4096);
    l.shadow.bias = -0.00025;
    l.shadow.normalBias = 0.02;
    l.shadow.radius = 2;
    l.shadow.blurSamples = 12;
    Object.assign(l.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 160 });
    // Warm Pixar rim/kicker light opposite the key light to sculpt grazing edges on marbles and chrome.
    const r = new THREE.DirectionalLight(
      isNight() ? (theme ? theme.rimLightColor : "#ffae66") : "#ffe4b8",
      isNight() ? (theme ? theme.rimLightIntensity : 0.78) : 0.55,
    );
    return { sun: l, rim: r };
  }, [theme]);
  const [x, y, z] = target;
  const dist = pos ? Math.hypot(pos[0] - x, pos[1] - y, pos[2] - z) : 16;
  const span = Math.max(18, Math.min(64, dist * 0.85));
  if (Math.abs(sun.shadow.camera.right - span) > 0.5) {
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, far: Math.max(140, span * 3) });
    sun.shadow.camera.updateProjectionMatrix();
  }
  if (isNight()) sun.position.set(x + 8, y + 40, z + 10); // a high studio key: short shadows under each marble
  else sun.position.set(x + 30, y + 21, z + 14); // ~32° above the horizon
  sun.target.position.set(x, y, z);
  sun.target.updateMatrixWorld();
  rim.position.set(x - 24, y + 14, z - 18);
  rim.target.position.set(x, y, z);
  rim.target.updateMatrixWorld();
  return (
    <>
      <primitive object={sun} />
      <primitive object={sun.target} />
      <primitive object={rim} />
      <primitive object={rim.target} />
    </>
  );
}

function toGeometry(g: { position: number[]; uv: number[]; index: number[] }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(g.position, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setIndex(g.index);
  geo.computeVertexNormals();
  return geo;
}

/** A thin band hugging the curved inner surface, across the trough from l0 to l1, from u0 to u1. */
function bandGeometry(samples: Sample[], u0: number, u1: number, l0: number | null, l1: number | null, up = 0.012) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // Rows at exactly u0 and u1 (interpolated between neighbours), plus every
  // sample in between: a band shorter than the sample spacing still gets two rows.
  const sampleAt = (u: number): Sample => {
    const du = samples[1].u - samples[0].u;
    const k = Math.max(0, Math.min(samples.length - 2, Math.floor((u - samples[0].u) / du)));
    const a = samples[k];
    const b = samples[k + 1];
    const t = Math.max(0, Math.min(1, (u - a.u) / (b.u - a.u)));
    const mix = (x: Vec3, y: Vec3): Vec3 => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
    const wa = a.w ?? TRACK.width / 2;
    const wb = b.w ?? TRACK.width / 2;
    return { u, p: mix(a.p, b.p), t: mix(a.t, b.t), r: mix(a.r, b.r), n: mix(a.n, b.n), curv: a.curv, w: wa + (wb - wa) * t };
  };
  const run = [sampleAt(u0), ...samples.filter((s) => s.u > u0 + 1e-3 && s.u < u1 - 1e-3), sampleAt(u1)];
  const STEPS = 20;
  run.forEach((s, k) => {
    // null bounds: wall to wall at this sample's own width.
    const a = l0 ?? -(s.w ?? TRACK.width / 2) + 0.03;
    const b = l1 ?? (s.w ?? TRACK.width / 2) - 0.03;
    for (let j = 0; j <= STEPS; j++) {
      const l = a + ((b - a) * j) / STEPS;
      pos.push(...pointOnTrack(s, l, up));
      uv.push(j / STEPS, (s.u - u0) / Math.max(1e-6, u1 - u0));
    }
    if (k > 0)
      for (let j = 0; j < STEPS; j++) {
        const a = (k - 1) * (STEPS + 1) + j;
        const b = a + STEPS + 1;
        // Counter-clockwise seen from above the floor (+u forward, +lateral right).
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
  });
  return toGeometry({ position: pos, uv, index: idx });
}

/**
 * Twice as many samples as the physics used, interpolated between neighbours:
 * the rendered trough follows its curves without visible facets.
 */
function densify(samples: Sample[], k = 2): Sample[] {
  const out: Sample[] = [];
  const lerp = (a: Vec3, b: Vec3, t: number) => a.map((v, j) => v + (b[j] - v) * t) as Vec3;
  const unit = (v: Vec3) => {
    const l = Math.hypot(...v) || 1;
    return v.map((x) => x / l) as Vec3;
  };
  for (let i = 0; i < samples.length - 1; i++) {
    const A = samples[i];
    const B = samples[i + 1];
    for (let j = 0; j < k; j++) {
      const t = j / k;
      // Keep the frame orthonormal: n from the blended t and r, then r from n and t.
      const tt = unit(lerp(A.t, B.t, t));
      const rr0 = unit(lerp(A.r, B.r, t));
      const nn = unit([rr0[1] * tt[2] - rr0[2] * tt[1], rr0[2] * tt[0] - rr0[0] * tt[2], rr0[0] * tt[1] - rr0[1] * tt[0]]);
      const rr = unit([tt[1] * nn[2] - tt[2] * nn[1], tt[2] * nn[0] - tt[0] * nn[2], tt[0] * nn[1] - tt[1] * nn[0]]);
      out.push({
        u: A.u + (B.u - A.u) * t,
        p: lerp(A.p, B.p, t),
        t: tt,
        r: rr,
        n: nn,
        curv: A.curv + (B.curv - A.curv) * t,
        w: (A.w ?? 2.1) + ((B.w ?? 2.1) - (A.w ?? 2.1)) * t,
        // A gap (vortex bowl) ends at the real samples: the first interpolated
        // row keeps its own flag, the rest are gap only if both neighbours are.
        ...(j === 0 ? (A.gap ? { gap: true } : {}) : A.gap && B.gap ? { gap: true } : {}),
      });
    }
  }
  out.push(samples[samples.length - 1]);
  return out;
}

export function Circuit({ race }: { race: Race }) {
  const theme = getCircuitTheme(race);
  const built = useMemo(() => {
    const samples = race.data.samples as unknown as Sample[];
    const mesh = buildTrackMesh(densify(samples), { arcSteps: 18 });
    const L = race.L;
    const uFinish = (race.data.info as { finish?: number }).finish ?? L;
    const uEnd = samples[samples.length - 1].u;

    // A race track: custom-themed floor with glowing/high-contrast edge lines and themed inner walls.
    // Texture x runs along the track (one repeat per 4 units, with fine grain), y across it.
    const LT = 4096;
    const LA = 1024;
    const [fv0, fv1] = floorVRange();
    const [sr, sg, sb] = theme.trackSpeckleRgb;
    const lanes = canvasTexture(
      LA,
      LT,
      (g) => {
        // The walls' inner faces: circuit-themed color
        g.fillStyle = isNight() ? theme.innerWallColor : "#d9d6d0";
        g.fillRect(0, 0, LA, LT);
        g.fillStyle = theme.trackFloorColor;
        g.fillRect(0, fv0 * LT, LA, (fv1 - fv0) * LT);
        // Aggregate grain: speckles of themed stone/ice/crystal/sand.
        for (let i = 0; i < 140000; i++) {
          const x = hash(i * 1.7) * LA;
          const y = (fv0 + hash(i * 2.3) * (fv1 - fv0)) * LT;
          const m = 0.45 + hash(i * 3.1) * 0.65;
          g.fillStyle = `rgba(${Math.round(sr * m)},${Math.round(sg * m)},${Math.round(sb * m)},0.38)`;
          g.fillRect(x, y, 2 + hash(i) * 3, 2 + hash(i + 1) * 3);
        }
        // Circuit-themed edge lines, and a faint darker racing line worn into the middle.
        const edge = 0.032;
        g.fillStyle = theme.trackEdgeColor;
        g.fillRect(0, (fv0 + 0.004) * LT, LA, edge * LT);
        g.fillRect(0, (fv1 - 0.004 - edge) * LT, LA, edge * LT);
        const grad = g.createLinearGradient(0, fv0 * LT, 0, fv1 * LT);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5, "rgba(0,0,0,0.18)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(0, fv0 * LT, LA, (fv1 - fv0) * LT);
        // Rubber laid down along the two racing lines: soft dark streaks of random length, and a few oil spots.
        const fh = (fv1 - fv0) * LT;
        for (let i = 0; i < 90; i++) {
          const lane = i % 2 ? 0.36 : 0.64;
          const y = (fv0 + (fv1 - fv0) * lane) * LT + (hash(i * 5.1) - 0.5) * fh * 0.1;
          const x = hash(i * 7.7) * LA;
          const len = 40 + hash(i * 3.3) * 220;
          g.fillStyle = `rgba(8,8,10,${0.05 + hash(i * 9.1) * 0.08})`;
          g.fillRect(x, y - 3, len, 6 + hash(i) * 6);
          if (x + len > LA) g.fillRect(0, y - 3, x + len - LA, 6 + hash(i) * 6); // wraps with the texture
        }
        for (let i = 0; i < 6; i++) {
          const x = hash(i * 11.3) * LA;
          const y = (fv0 + 0.1 + hash(i * 13.7) * (fv1 - fv0 - 0.2)) * LT;
          const r = 8 + hash(i * 2.9) * 18;
          const spot = g.createRadialGradient(x, y, 0, x, y, r);
          spot.addColorStop(0, "rgba(10,10,14,0.35)");
          spot.addColorStop(1, "rgba(10,10,14,0)");
          g.fillStyle = spot;
          g.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        // Walls: one panel joint per repeat, a thin rail line halfway up, grime where they meet the floor.
        for (const [a, b] of [[0, fv0], [fv1, 1]]) {
          g.fillStyle = "rgba(0,0,0,0.16)";
          g.fillRect(LA * 0.5 - 2, a * LT, 4, (b - a) * LT);
          g.fillStyle = "rgba(0,0,0,0.07)";
          g.fillRect(0, ((a + b) / 2) * LT - 2, LA, 4);
          const gr = g.createLinearGradient(0, a === 0 ? fv0 * LT : fv1 * LT, 0, a === 0 ? (fv0 - 0.05) * LT : (fv1 + 0.05) * LT);
          gr.addColorStop(0, "rgba(40,36,30,0.22)");
          gr.addColorStop(1, "rgba(40,36,30,0)");
          g.fillStyle = gr;
          g.fillRect(0, a === 0 ? (fv0 - 0.05) * LT : fv1 * LT, LA, 0.05 * LT);
        }
      },
      true,
    );
    // Circuit-themed kerbs on the inside of every proper corner.
    const kerbTex = canvasTexture(128, 32, (g) => {
      g.fillStyle = theme.kerbColorA;
      g.fillRect(0, 0, 64, 32);
      g.fillStyle = theme.kerbColorB;
      g.fillRect(64, 0, 64, 32);
    });
    kerbTex.wrapS = kerbTex.wrapT = THREE.RepeatWrapping;
    const kerbs: { geo: THREE.BufferGeometry; tex: THREE.Texture }[] = [];
    {
      let runStart: number | null = null;
      let runSide = 0;
      samples.forEach((s, k) => {
        const tight = Math.abs(s.curv) > 0.07 && s.u > 2 && s.u < race.L - 1;
        const side = s.curv > 0 ? 1 : -1; // inside of the bend
        const ends = !tight || side !== runSide || k === samples.length - 1;
        if (tight && runStart === null) {
          runStart = s.u;
          runSide = side;
        } else if (ends && runStart !== null) {
          if (s.u - runStart > 2) {
            const w = s.w ?? TRACK.width / 2;
            const [l0, l1] = runSide > 0 ? [w - 0.42, w - 0.03] : [-w + 0.03, -w + 0.42];
            const tex = kerbTex.clone();
            tex.repeat.set(1, (s.u - runStart) / 1.2); // one red+white pair every 1.2 units
            tex.needsUpdate = true;
            kerbs.push({ geo: bandGeometry(samples, runStart, s.u, l0, l1, 0.016), tex });
          }
          runStart = tight ? s.u : null;
          runSide = side;
        }
      });
    }

    // A grid box behind each marble's starting spot: one per lane and row.
    const gridMarks: THREE.BufferGeometry[] = [];
    const startHalf = samples[0].w ?? TRACK.width / 2;
    const grid = (race.data as unknown as { grid?: { lanes: number; rows: number; rowGap: number } }).grid ?? { lanes: race.N, rows: 1, rowGap: 1 };
    const laneW = (2 * startHalf) / grid.lanes;
    for (let slot = 0; slot < race.N; slot++) {
      const lat = -startHalf + laneW * ((slot % grid.lanes) + 0.5);
      // Marbles roll down to the gate before the lights: the boxes sit where they rest, a diameter apart per row.
      const ub = -0.3 - Math.floor(slot / grid.lanes) * (2 * race.data.marbleRadius + 0.02);
      gridMarks.push(bandGeometry(samples, ub, ub + 0.08, lat - laneW * 0.32, lat + laneW * 0.32, 0.03));
    }

    // Warning stripe just before every drop.
    // Direction arrows painted on the asphalt every 10 units, and the start
    // lanes numbered 1–10.
    const arrowTex = canvasTexture(256, 256, (g) => {
      g.clearRect(0, 0, 256, 256);
      g.fillStyle = "#f4f4f2";
      g.beginPath();
      g.moveTo(128, 8);
      g.lineTo(236, 128);
      g.lineTo(168, 128);
      g.lineTo(168, 248);
      g.lineTo(88, 248);
      g.lineTo(88, 128);
      g.lineTo(20, 128);
      g.closePath();
      g.fill();
    });
    // Dashed lane lines, three lanes wide: 2.2 units of paint every 4, from the
    // end of the funnel to the finish, as one merged strip geometry.
    const dashes = (() => {
      const parts: THREE.BufferGeometry[] = [];
      const inGap = (a: number, b: number) => samples.some((s) => s.gap && s.u >= a - 0.5 && s.u <= b + 0.5);
      for (let u = 12; u < uEnd - 3; u += 4) {
        if (inGap(u, u + 2.2)) continue;
        for (const lat of [-0.7, 0.7]) parts.push(bandGeometry(samples, u, Math.min(u + 2.2, L - 1), lat - 0.03, lat + 0.03, 0.03));
      }
      return mergeGeometries(parts);
    })();
    const arrows: THREE.BufferGeometry[] = [];
    for (let u = 16; u < uEnd - 6; u += 10) {
      const s = samples[Math.min(samples.length - 1, Math.max(0, Math.round((u - samples[0].u) / 0.5)))];
      if (Math.abs(s.curv) > 0.06 || samples.some((q) => q.gap && Math.abs(q.u - u) < 1.5)) continue;
      arrows.push(bandGeometry(samples, u - 0.9, u + 0.9, -0.55, 0.55, 0.03));
    }
    const laneNumbers = Array.from({ length: grid.lanes }, (_, slot) => {
      const lat = -startHalf + laneW * (slot + 0.5);
      const tex = canvasTexture(128, 128, (g) => {
        g.clearRect(0, 0, 128, 128);
        g.fillStyle = "#eeeee8";
        g.font = "900 110px 'Avenir Next', system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(slot + 1), 64, 70);
      });
      return { geo: bandGeometry(samples, -1.3 - grid.rows * grid.rowGap - 0.6, -1.3 - grid.rows * grid.rowGap, lat - 0.3, lat + 0.3, 0.03), tex };
    });

    const dropLips = (race.data.features as { type: string; u: number }[])
      .filter((f) => f.type === "drop" || f.type === "jump")
      .map((f) => bandGeometry(samples, f.u - 0.9, f.u - 0.05, null, null, 0.015));

    const chevrons = canvasTexture(256, 64, (g) => {
      g.fillStyle = "#111";
      g.fillRect(0, 0, 256, 64);
      g.fillStyle = "#ffcc00";
      for (let x = -64; x < 256; x += 32) {
        g.beginPath();
        g.moveTo(x, 64);
        g.lineTo(x + 16, 64);
        g.lineTo(x + 48, 0);
        g.lineTo(x + 32, 0);
        g.fill();
      }
    });
    const checker = canvasTexture(256, 32, (g) => {
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 2; y++) {
          g.fillStyle = (x + y) % 2 ? "#111" : "#fafafa";
          g.fillRect(x * 16, y * 16, 16, 16);
        }
    });
    checker.magFilter = THREE.NearestFilter;

    const minY = Math.min(...samples.map((s) => s.p[1]));
    const groundY = minY - 1.4;
    const xs = samples.map((s) => s.p[0]);
    const zs = samples.map((s) => s.p[2]);
    // Imperfection maps (fresh textures for this canvas). Track UVs are (units along / 4, 0..1 across), so repeat to ~1 tile per unit.
    const plastic = plasticMaps();
    for (const t of [plastic.normal, plastic.roughness]) t.repeat.set(3, 6); // fine grain: it should show only in the highlights
    const asphalt = asphaltMaps();
    for (const t of [asphalt.normal, asphalt.roughness]) t.repeat.set(1, 4);
    const floor = isNight() ? floorMaps("#16181f") : grassMaps();
    for (const t of [floor.color, floor.roughness, floor.normal]) t.repeat.set(70, 70);
    return {
      plastic,
      asphalt,
      kerbs,
      floor,
      geos: Object.fromEntries(Object.entries(mesh.parts).map(([k, g]) => [k, toGeometry(g)])) as Record<string, THREE.BufferGeometry>,
      lanes,
      chevrons,
      checker,
      gridMarks,
      dropLips,
      arrowTex,
      arrows,
      dashes,
      laneNumbers,
      startLine: bandGeometry(samples, -0.12, 0.12, -(TRACK.width / 2 - TRACK.fillet - 0.03), TRACK.width / 2 - TRACK.fillet - 0.03, 0.014),
      finishLine: bandGeometry(samples, uFinish - 0.35, uFinish + 0.35, -(TRACK.width / 2 - TRACK.fillet - 0.03), TRACK.width / 2 - TRACK.fillet - 0.03, 0.014),
      groundY,
      center: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2] as [number, number],
    };
  }, [race]);
  useEffect(
    () => () => {
      Object.values(built.geos).forEach((g) => g.dispose());
      built.lanes.dispose();
      built.chevrons.dispose();
      built.checker.dispose();
      built.arrowTex.dispose();
      built.dashes.dispose();
      built.startLine.dispose();
      built.finishLine.dispose();
      built.arrows.forEach((g) => g.dispose());
      built.gridMarks.forEach((g) => g.dispose());
      built.dropLips.forEach((g) => g.dispose());
      built.kerbs.forEach((k) => {
        k.geo.dispose();
        k.tex.dispose();
      });
      built.laneNumbers.forEach((l) => {
        l.geo.dispose();
        l.tex.dispose();
      });
    },
    [built],
  );

  const { geos } = built;
  return (
    <>
      <mesh geometry={geos.floor} receiveShadow castShadow>
        <meshStandardMaterial
          map={built.lanes}
          roughness={0.88}
          metalness={0.02}
          roughnessMap={built.asphalt.roughness}
          normalMap={built.asphalt.normal}
          normalScale={new THREE.Vector2(0.28, 0.28)}
          envMapIntensity={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={built.dashes}>
        <meshStandardMaterial color={theme.trackDashColor} roughness={0.65} />
      </mesh>
      {built.arrows.map((g, i) => (
        <mesh key={`a${i}`} geometry={g}>
          <meshStandardMaterial map={built.arrowTex} transparent roughness={0.7} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
      {built.laneNumbers.map((ln, i) => (
        <mesh key={`ln${i}`} geometry={ln.geo}>
          <meshStandardMaterial map={ln.tex} transparent roughness={0.7} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
      {built.kerbs.map((kb, i) => (
        <mesh key={`k${i}`} geometry={kb.geo} receiveShadow>
          <meshStandardMaterial map={kb.tex} roughness={0.7} />
        </mesh>
      ))}
      <mesh geometry={geos.rim} castShadow receiveShadow>
        {isNight() ? <meshStandardMaterial color={theme.rimColor} metalness={0.95} roughness={0.22} /> : <meshStandardMaterial color="#dcdad4" roughness={0.45} />}
      </mesh>
      {/* The walls: themed outer shell with surface texture. */}
      <mesh geometry={geos.shell} castShadow receiveShadow>
        {isNight() ? (
          <meshPhysicalMaterial
            color={theme.outerShellColor}
            metalness={theme.outerShellMetalness}
            roughness={theme.outerShellRoughness}
            roughnessMap={built.plastic.roughness}
            normalMap={built.plastic.normal}
            normalScale={new THREE.Vector2(0.25, 0.25)}
            envMapIntensity={1.1}
          />
        ) : (
          <meshPhysicalMaterial
            color="#c9c6bf"
            roughness={1}
            roughnessMap={built.plastic.roughness}
            normalMap={built.plastic.normal}
            normalScale={new THREE.Vector2(0.14, 0.14)}
            envMapIntensity={0.35}
          />
        )}
      </mesh>
      <mesh geometry={geos.caps} castShadow>
        <meshStandardMaterial color={isNight() ? theme.capsColor : "#eceae6"} metalness={isNight() ? 0.8 : 0} roughness={0.42} />
      </mesh>
      {built.gridMarks.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#f2f2f0" roughness={0.6} />
        </mesh>
      ))}
      {built.dropLips.map((g, i) => (
        <mesh key={`d${i}`} geometry={g}>
          <meshStandardMaterial map={built.chevrons} roughness={0.5} />
        </mesh>
      ))}
      <mesh geometry={built.startLine}>
        <meshStandardMaterial color="#111" roughness={0.5} />
      </mesh>
      <mesh geometry={built.finishLine}>
        <meshStandardMaterial map={built.checker} roughness={0.5} />
      </mesh>

      {/* Circuit-themed terrain ground (Glacier Snow for Alps, Desert Sand for Cairo, Ocean Harbour for Sydney, Cyber/Manhattan Plaza for Tokyo/NYC). */}
      <mesh rotation-x={-Math.PI / 2} position={[built.center[0], built.groundY, built.center[1]]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial color={theme.groundColor} roughness={theme.groundRoughness} metalness={theme.groundMetalness} envMapIntensity={0.08} />
      </mesh>
    </>
  );
}

const chrome = { color: "#eceef3", metalness: 1, roughness: 0.07 } as const;
// three.js objects live per canvas (created in a component's useMemo, freed on
// unmount), never at module level: a geometry, material or texture that a
// renderer has drawn keeps that renderer reachable through its dispose
// listeners, so a module-level one kept every dead canvas's renderer alive.
type Bolt = { geometry: THREE.BufferGeometry; material: THREE.Material };
/** A ring of bolts, in the local frame of the obstacle (y up). */
function BoltRing({ bolt, count, radius, y, phase = 0 }: { bolt: Bolt; count: number; radius: number; y: number; phase?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, k) => {
        const a = phase + (k / count) * Math.PI * 2;
        return <mesh key={k} geometry={bolt.geometry} material={bolt.material} position={[Math.cos(a) * radius, y, Math.sin(a) * radius]} rotation-y={a * 1.7} castShadow />;
      })}
    </>
  );
}
/** Pinball-style score caps on the bumpers: "100", "250" or "500". */
function scoreTexture(i: number) {
  return canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = "#15161b";
    g.beginPath();
    g.arc(128, 128, 126, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffcc00";
    g.font = "900 92px 'Avenir Next', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(["100", "250", "500"][i % 3], 128, 134);
  });
}

/** An amber warning beacon on a short post: every machine carries one. */
function Beacon({ y }: { y: number }) {
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.07, 0.08, 0.12, 20]} />
        <meshStandardMaterial color="#15161b" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.16, 20]} />
        <meshPhysicalMaterial color="#ffb000" emissive="#ff9a00" emissiveIntensity={2.5} roughness={0.2} transmission={0.3} thickness={0.1} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.29, 0]}>
        <sphereGeometry args={[0.075, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#15161b" roughness={0.5} />
      </mesh>
    </group>
  );
}

/** A low flange where an obstacle meets the floor. */
function Flange({ radius, y }: { radius: number; y: number }) {
  return (
    <mesh position={[0, y, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius + 0.015, 0.025, 64]} />
      <meshStandardMaterial color="#d9dce2" metalness={1} roughness={0.25} />
    </mesh>
  );
}
// Machines' body paint: glossy white by day, graphite at night (white glared against the dark set).
/** The drain slot's length along the track (the bake's DQ line sits in its middle). */
export const DRAIN_LEN = 0.75;
const gloss = isNight() ? ({ color: "#2b2e35", roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 } as const) : ({ color: "#ffffff", roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 } as const);

/** The turntable's top: brushed steel rings with eight rubber spokes and a hazard rim. */
function ridgeTexture() {
  const t = canvasTexture(2048, 2048, (g) => {
    const c = 1024;
    g.fillStyle = "#b9bdc6";
    g.fillRect(0, 0, 2048, 2048);
    for (let r = 20; r < 1024; r += 6) {
      g.strokeStyle = `rgba(0,0,0,${0.04 + 0.08 * ((r * 7919) % 11) / 11})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.translate(c, c);
    for (let k = 0; k < 8; k++) {
      g.save();
      g.rotate((k / 8) * Math.PI * 2);
      g.fillStyle = "#1e2026";
      g.fillRect(-26, -1000, 52, 1000);
      g.fillStyle = "#2c2f37";
      g.fillRect(-14, -1000, 28, 1000);
      g.restore();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.strokeStyle = "#ffcc00";
    g.lineWidth = 40;
    g.beginPath();
    g.arc(c, c, 980, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#111";
    g.setLineDash([80, 60]);
    g.beginPath();
    g.arc(c, c, 980, 0, Math.PI * 2);
    g.stroke();
  });
  return t;
}

/** The red disqualification pad: "DQ" between hazard borders. */
/** Yellow and black hazard stripes for the frame painted round a drain. */
function dqTexture() {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = "#111216";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#ffcc00";
    for (let x = -256; x < 512; x += 48) {
      g.beginPath();
      g.moveTo(x, 256);
      g.lineTo(x + 24, 256);
      g.lineTo(x + 280, 0);
      g.lineTo(x + 256, 0);
      g.fill();
    }
  });
}

function chevronTexture() {
  return canvasTexture(256, 64, (g) => {
    g.fillStyle = "#111";
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = "#ffcc00";
    for (let x = -64; x < 320; x += 32) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 16, 64);
      g.lineTo(x + 48, 0);
      g.lineTo(x + 32, 0);
      g.fill();
    }
  }, true);
}

/**
 * Obstacles: chrome pegs with domed caps, pinball bumpers in three sizes,
 * splitter fins, single and four-arm spinners, and hammer pendulums on bridges.
 */
export function Obstacles({ race, t }: { race: Race; t: number }) {
  const view = useView(race);
  const sub = useSubframe();
  const statics = race.data.obstacles as unknown as {
    kind: string;
    shape: string;
    pos: Vec3;
    quat: Quat;
    size?: Vec3;
    radius?: number;
    height?: number;
  }[];
  const spinners = race.data.spinners as unknown as { pos: Vec3; quat: Quat; size: Vec3; speed: number; phase: number; arms?: number }[];
  const swings = (race.data.swings ?? []) as unknown as {
    pos: Vec3;
    quat: Quat;
    length: number;
    head: Vec3;
    amp: number;
    period: number;
    phase: number;
  }[];
  const chev = useMemo(() => chevronTexture(), []);
  const dqTex = useMemo(() => dqTexture(), []);
  // Shared by every bolt and bumper cap on this canvas.
  const shared = useMemo(
    () => ({
      bolt: { geometry: boltGeometry(), material: new THREE.MeshStandardMaterial({ color: "#c9ccd2", metalness: 1, roughness: 0.3 }) },
      scores: statics.some((o) => o.kind === "bumper") ? [0, 1, 2].map(scoreTexture) : [],
    }),
    [race],
  );
  useEffect(
    () => () => {
      shared.bolt.geometry.dispose();
      shared.bolt.material.dispose();
      shared.scores.forEach((tx) => tx.dispose());
    },
    [shared],
  );
  const bolt = shared.bolt;
  const sec = t / race.fps;
  const W = TRACK.width / 2 + TRACK.wall;
  const turntables = (race.data.turntables ?? []) as unknown as { pos: Vec3; quat: Quat; radius: number; thickness: number; speed: number; phase: number; hub?: number; hubHeight?: number; ribs?: number }[];
  const pushers = (race.data.pushers ?? []) as unknown as { pos: Vec3; dir: Vec3; quat: Quat; size: Vec3; travel: number; period: number; phase: number }[];
  const spinRefs = useRef<(THREE.Group | null)[]>([]);
  const swingRefs = useRef<(THREE.Group | null)[]>([]);
  const ttRefs = useRef<(THREE.Group | null)[]>([]);
  const pushRefs = useRef<(THREE.Group | null)[]>([]);
  const rodRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ridges = useMemo(() => ridgeTexture(), []);
  const ttQuat = (tt: (typeof turntables)[number], s: number) =>
    new THREE.Quaternion(...tt.quat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tt.phase + tt.speed * s));
  const pushOut = (p: (typeof pushers)[number], s: number) => (p.travel * (1 - Math.cos((2 * Math.PI * s) / p.period + p.phase))) / 2;
  /** Which local side (±z) the pusher travels toward. */
  const pushSide = (p: (typeof pushers)[number]) => {
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...p.quat));
    return z.dot(new THREE.Vector3(...p.dir)) > 0 ? 1 : -1;
  };
  const applyPusher = (p: (typeof pushers)[number], i: number, s: number) => {
    const d = pushOut(p, s);
    const g = pushRefs.current[i];
    if (g) g.position.set(p.pos[0] + p.dir[0] * d, p.pos[1] + p.dir[1] * d, p.pos[2] + p.dir[2] * d);
    const rod = rodRefs.current[i];
    if (rod) {
      const side = pushSide(p);
      const len = d + 0.7;
      rod.scale.set(1, len, 1);
      rod.position.set(0, 0, -side * (p.size[2] / 2 + len / 2));
    }
  };
  const spinQuat = (sp: (typeof spinners)[number], s: number) =>
    new THREE.Quaternion(...sp.quat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.phase + sp.speed * s));
  const swingQuat = (sw: (typeof swings)[number], s: number) =>
    new THREE.Quaternion(...sw.quat).multiply(
      new THREE.Quaternion().setFromAxisAngle(
        (sw as { axis?: string }).axis === "z" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0),
        (sw as { spin?: number }).spin !== undefined ? sw.phase + (sw as { spin?: number }).spin! * s : sw.amp * Math.sin((2 * Math.PI * s) / sw.period + sw.phase),
      ),
    );
  useEffect(
    () =>
      sub.subscribe((vf) => {
        const s = view.tAt(vf) / race.fps;
        spinners.forEach((sp, i) => spinRefs.current[i]?.quaternion.copy(spinQuat(sp, s)));
        swings.forEach((sw, i) => swingRefs.current[i]?.quaternion.copy(swingQuat(sw, s)));
        turntables.forEach((tt, i) => ttRefs.current[i]?.quaternion.copy(ttQuat(tt, s)));
        pushers.forEach((p, i) => applyPusher(p, i, s));
      }),
    [sub, view, race],
  );
  return (
    <>
      {statics.map((o, i) => {
        if (o.kind === "dq") {
          // The drain: an open slot in the floor at the foot of the wall, a chrome grate rim, hazard
          // paint around it and a dark shaft below. A marble that rolls in drops out of the race.
          const [, , wid] = o.size!;
          const side = (o as unknown as { side: number }).side;
          const L = DRAIN_LEN;
          const W = wid + 0.06;
          const z = side * 0.03; // tucked against the wall
          return (
            <group key={i} position={o.pos} quaternion={o.quat}>
              {/* Hazard frame painted on the floor around the slot. */}
              <mesh position={[0, 0.006, z]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[L + 0.28, W + 0.2]} />
                <meshStandardMaterial map={dqTex} roughness={0.5} polygonOffset polygonOffsetFactor={-2} />
              </mesh>
              {/* The hole: black, with a shaft going down so it reads as depth. */}
              <mesh position={[0, 0.009, z]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[L, W]} />
                <meshBasicMaterial color="#020203" polygonOffset polygonOffsetFactor={-4} />
              </mesh>
              {[-1, 1].map((e) => (
                <mesh key={`sx${e}`} position={[(e * L) / 2, -0.25, z]}>
                  <boxGeometry args={[0.02, 0.5, W]} />
                  <meshStandardMaterial color="#141519" roughness={0.6} />
                </mesh>
              ))}
              {/* Chrome rim. */}
              {[-1, 1].map((e) => (
                <mesh key={`rx${e}`} position={[(e * (L + 0.04)) / 2, 0.015, z]}>
                  <boxGeometry args={[0.04, 0.03, W + 0.04]} />
                  <meshStandardMaterial color="#dfe2e8" metalness={1} roughness={0.2} />
                </mesh>
              ))}
              <mesh position={[0, 0.015, z - side * (W / 2 + 0.01)]}>
                <boxGeometry args={[L + 0.08, 0.03, 0.04]} />
                <meshStandardMaterial color="#dfe2e8" metalness={1} roughness={0.2} />
              </mesh>
              {/* An amber warning lamp on the wall top above it. */}
              <group position={[0, TRACK.wallHeight + 0.1, side * (wid / 2 + 0.04 + 0.08)]}>
                <mesh castShadow>
                  <boxGeometry args={[0.3, 0.2, 0.16]} />
                  <meshStandardMaterial color="#1b1c20" roughness={0.5} />
                </mesh>
                <mesh position={[0, 0, -side * 0.085]}>
                  <sphereGeometry args={[0.07, 24, 12]} />
                  <meshStandardMaterial color="#ffb000" emissive="#ff9a00" emissiveIntensity={3} toneMapped={false} />
                </mesh>
              </group>
            </group>
          );
        }
        // Guard panels are physics only (invisible barriers over the walls where marbles fly):
        // the clear acrylic got in the cameras' way.
        if (o.kind === "guard") return null;
        if (o.shape === "box")
          return (
            <group key={i} position={o.pos} quaternion={o.quat}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={o.size} />
                {o.kind === "fin" || o.kind === "splitter" ? <meshStandardMaterial map={chev} roughness={0.45} /> : <meshPhysicalMaterial {...gloss} />}
              </mesh>
              {(o.kind === "fin" || o.kind === "splitter") && (
                <>
                  <mesh position={[-o.size![0] / 2 + 0.12, 0, 0]} castShadow>
                    <cylinderGeometry args={[0.07, 0.07, o.size![1] + 0.16, 20]} />
                    <meshStandardMaterial {...chrome} />
                  </mesh>
                  <BoltRing bolt={bolt} count={2} radius={0.0001} y={o.size![1] / 2 + 0.02} phase={0} />
                </>
              )}
              <mesh position={[0, o.size![1] / 2 + 0.01, 0]}>
                <boxGeometry args={[o.size![0] - 0.1, 0.03, o.size![2] + 0.01]} />
                <meshStandardMaterial color="#ffcc00" roughness={0.35} />
              </mesh>
              <mesh position={[o.size![0] / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[o.size![2] / 2, o.size![2] / 2, o.size![1], 32]} />
                <meshPhysicalMaterial {...gloss} />
              </mesh>
            </group>
          );
        if (o.kind === "bumper") {
          const r = o.radius!;
          const h = o.height!;
          return (
            <group key={i} position={o.pos} quaternion={o.quat}>
              <mesh castShadow receiveShadow>
                <cylinderGeometry args={[r * 0.96, r, h, 64]} />
                <meshPhysicalMaterial {...gloss} />
              </mesh>
              <mesh position={[0, h / 2 - 0.13, 0]} rotation-x={Math.PI / 2}>
                <torusGeometry args={[r * 0.97, 0.045, 16, 64]} />
                <meshStandardMaterial color="#ffd23a" emissive="#ffb000" emissiveIntensity={0.9} roughness={0.25} />
              </mesh>
              <mesh position={[0, h / 2 + 0.004, 0]} rotation-x={-Math.PI / 2}>
                <circleGeometry args={[r * 0.82, 64]} />
                <meshStandardMaterial color="#15161b" roughness={0.35} />
              </mesh>
              <mesh position={[0, h / 2, 0]} scale={[1, 0.45, 1]}>
                <sphereGeometry args={[r * 0.45, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
              <mesh position={[0, h / 2 + 0.006, 0]} rotation-x={-Math.PI / 2}>
                <circleGeometry args={[r * 0.6, 48]} />
                <meshStandardMaterial map={shared.scores[i % 3]} transparent roughness={0.3} emissive="#ffffff" emissiveMap={shared.scores[i % 3]} emissiveIntensity={0.6} />
              </mesh>
              <Flange radius={r + 0.09} y={-h / 2 + 0.13} />
              <BoltRing bolt={bolt} count={6} radius={r + 0.055} y={-h / 2 + 0.142} phase={0.3} />
            </group>
          );
        }
        // Peg: chrome post, domed cap with an LED, rubber ring.
        const r = o.radius!;
        const h = o.height!;
        return (
          <group key={i} position={o.pos} quaternion={o.quat}>
            <mesh position={[0, h / 2 + r * 0.98, 0]}>
              <sphereGeometry args={[0.035, 16, 8]} />
              <meshStandardMaterial color="#9af0ff" emissive="#55d8ff" emissiveIntensity={4} toneMapped={false} />
            </mesh>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[r, r, h, 48]} />
              <meshStandardMaterial {...chrome} />
            </mesh>
            <mesh position={[0, h / 2, 0]} castShadow>
              <sphereGeometry args={[r, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial {...chrome} />
            </mesh>
            <mesh position={[0, h / 2 - 0.28, 0]} rotation-x={Math.PI / 2}>
              <torusGeometry args={[r + 0.012, 0.03, 12, 48]} />
              <meshStandardMaterial color="#15161b" roughness={0.6} />
            </mesh>
            <Flange radius={r + 0.08} y={-h / 2 + 0.13} />
            <BoltRing bolt={bolt} count={3} radius={r + 0.05} y={-h / 2 + 0.142} phase={i} />
          </group>
        );
      })}

      {spinners.map((sp, i) => {
        const q = spinQuat(sp, sec);
        // The whirlwind: chrome blades with black rubber edges, yellow hooked tips, a domed hub.
        const parts = spinnerParts(sp) as { pos: Vec3; quat: Quat; size: Vec3; kind: string }[];
        return (
          <group key={`s${i}`} ref={(el) => void (spinRefs.current[i] = el)} position={sp.pos} quaternion={q}>
            {parts.map((p, k) => (
              <group key={k} position={p.pos} quaternion={p.quat}>
                <mesh castShadow receiveShadow>
                  <boxGeometry args={p.size} />
                  {p.kind === "hook" ? <meshStandardMaterial color="#ffcc00" roughness={0.3} /> : <meshStandardMaterial {...chrome} />}
                </mesh>
                {/* Rubber strip along the bottom edge and a hazard band on top. */}
                <mesh position={[0, -p.size[1] / 2 + 0.05, 0]}>
                  <boxGeometry args={[p.size[0] + 0.01, 0.1, p.size[2] + 0.02]} />
                  <meshStandardMaterial color="#1b1c20" roughness={0.9} />
                </mesh>
                {p.kind === "blade" && (
                  <mesh position={[0, p.size[1] / 2 + 0.005, 0]}>
                    <boxGeometry args={[p.size[0], 0.01, p.size[2] + 0.005]} />
                    <meshStandardMaterial map={chev} roughness={0.4} />
                  </mesh>
                )}
              </group>
            ))}
            <mesh castShadow>
              <cylinderGeometry args={[0.24, 0.26, sp.size[1] + 0.12, 40]} />
              <meshStandardMaterial color="#15161b" roughness={0.35} />
            </mesh>
            <mesh position={[0, sp.size[1] / 2 + 0.07, 0]}>
              <sphereGeometry args={[0.16, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial {...chrome} />
            </mesh>
            <BoltRing bolt={bolt} count={6} radius={0.2} y={sp.size[1] / 2 + 0.06} phase={0.4} />
          </group>
        );
      })}
      {/* Static base plates under the spinners (they don't turn). */}
      {spinners.map((sp, i) => (
        <group key={`sb${i}`} position={sp.pos} quaternion={sp.quat}>
          <Flange radius={0.36} y={-sp.size[1] / 2 + 0.01} />
          <BoltRing bolt={bolt} count={6} radius={0.3} y={-sp.size[1] / 2 + 0.02} phase={0.2} />
        </group>
      ))}

      {turntables.map((tt, i) => (
        <group key={`t${i}`}>
          <group ref={(el) => void (ttRefs.current[i] = el)} position={tt.pos} quaternion={ttQuat(tt, sec)}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[tt.radius, tt.radius, tt.thickness, 96]} />
              <meshStandardMaterial map={ridges} roughness={0.35} metalness={0.7} />
            </mesh>
            <mesh position={[0, tt.thickness / 2 + 0.002, 0]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[tt.radius - 0.16, tt.radius - 0.02, 96]} />
              <meshStandardMaterial color="#ffcc00" roughness={0.35} />
            </mesh>
            {/* Raised rubber ribs (they kick the marbles) with a yellow top edge, and the chrome hub dome. */}
            {(turntableParts(tt) as unknown as { pos: Vec3; quat: Quat; size: Vec3 }[]).map((r, k) => (
              <group key={k} position={r.pos} quaternion={r.quat}>
                <mesh castShadow receiveShadow>
                  <boxGeometry args={r.size} />
                  <meshStandardMaterial color="#1b1c20" roughness={0.85} />
                </mesh>
                <mesh position={[0, r.size[1] / 2 + 0.004, 0]}>
                  <boxGeometry args={[r.size[0], 0.008, r.size[2] * 0.5]} />
                  <meshStandardMaterial color="#ffcc00" roughness={0.35} />
                </mesh>
              </group>
            ))}
            {tt.hub && tt.hubHeight ? (
              <mesh position={[0, tt.thickness / 2 + tt.hubHeight - tt.hub, 0]} castShadow>
                <sphereGeometry args={[tt.hub, 48, 24, 0, Math.PI * 2, 0, Math.acos(1 - tt.hubHeight / tt.hub)]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
            ) : (
              <mesh position={[0, tt.thickness / 2, 0]}>
                <sphereGeometry args={[0.22, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
            )}
            <BoltRing bolt={bolt} count={6} radius={0.3} y={tt.thickness / 2 + 0.002} phase={0.1} />
          </group>
          {/* Fixed surround ring, flush with the floor. */}
          <group position={tt.pos} quaternion={tt.quat}>
            <mesh position={[0, tt.thickness / 2 - 0.02, 0]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[tt.radius + 0.01, tt.radius + 0.12, 96]} />
              <meshStandardMaterial color="#d9dce2" metalness={1} roughness={0.25} />
            </mesh>
          </group>
        </group>
      ))}

      {pushers.map((p, i) => {
        const side = pushSide(p);
        const d0 = pushOut(p, sec);
        return (
          <group key={`p${i}`}>
            <group ref={(el) => void (pushRefs.current[i] = el)} position={[p.pos[0] + p.dir[0] * d0, p.pos[1] + p.dir[1] * d0, p.pos[2] + p.dir[2] * d0]} quaternion={p.quat}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={p.size} />
                <meshStandardMaterial map={chev} roughness={0.4} />
              </mesh>
              <mesh position={[0, p.size[1] / 2 + 0.01, 0]}>
                <boxGeometry args={[p.size[0] - 0.08, 0.02, p.size[2] - 0.08]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
              {/* Piston rod back to the housing in the wall; its length follows the stroke. */}
              <mesh ref={(el) => void (rodRefs.current[i] = el)} rotation-x={Math.PI / 2} castShadow>
                <cylinderGeometry args={[0.06, 0.06, 1, 24]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
            </group>
            {/* Housing outside the wall. */}
            <group position={p.pos} quaternion={p.quat}>
              <group position={[0, 0.05, -side * (p.size[2] / 2 + TRACK.wall + 0.5)]}>
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[1.5, 0.85, 0.8]} />
                  <meshPhysicalMaterial {...gloss} />
                </mesh>
                <mesh position={[0, 0.44, 0]}>
                  <boxGeometry args={[1.52, 0.04, 0.82]} />
                  <meshStandardMaterial color="#ffcc00" roughness={0.35} />
                </mesh>
                <mesh position={[0.55, 0.1, -side * -0.41]}>
                  <circleGeometry args={[0.035, 16]} />
                  <meshStandardMaterial color="#ff3030" emissive="#ff1010" emissiveIntensity={5} toneMapped={false} />
                </mesh>
                <BoltRing bolt={bolt} count={4} radius={0.55} y={0.43} phase={0.78} />
                <Beacon y={0.5} />
              </group>
            </group>
          </group>
        );
      })}

      {swings.map((sw, i) => {
        const swing = swingQuat(sw, sec);
        return (
          <group key={`h${i}`}>
            {/* The axle across the trough between two posts (the hub sits off-centre: the hammer sweeps one half).
                Nothing above it: the arm turns full circles. */}
            <group position={sw.pos} quaternion={sw.quat}>
              <group position={[0, 0, -((sw as { lat?: number }).lat ?? 0)]}>
              <mesh rotation-x={Math.PI / 2} castShadow>
                <cylinderGeometry args={[0.07, 0.07, 2 * W + 0.7, 24]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
              {[-1, 1].map((e) => (
                <mesh key={e} position={[0, -0.9, e * (W + 0.35)]} castShadow>
                  <boxGeometry args={[0.16, 2.4, 0.16]} />
                  <meshStandardMaterial {...chrome} />
                </mesh>
              ))}
              {/* Drive motor on the bridge, with its status light and hazard stripes on the posts. */}
              <group position={[0, 0.62, W + 0.1]}>
                <mesh castShadow>
                  <boxGeometry args={[0.6, 0.6, 0.55]} />
                  <meshPhysicalMaterial {...gloss} />
                </mesh>
                <mesh position={[0, 0.31, 0]}>
                  <boxGeometry args={[0.62, 0.03, 0.57]} />
                  <meshStandardMaterial color="#ffcc00" roughness={0.35} />
                </mesh>
                <mesh position={[0.31, 0.1, 0]} rotation-y={Math.PI / 2}>
                  <circleGeometry args={[0.035, 16]} />
                  <meshStandardMaterial color="#ff3030" emissive="#ff1010" emissiveIntensity={5} toneMapped={false} />
                </mesh>
                <Beacon y={0.42} />
              </group>
              {[-1, 1].map((e) => (
                <mesh key={`hz${e}`} position={[0, -1.9, e * (W + 0.35)]}>
                  <boxGeometry args={[0.17, 0.5, 0.17]} />
                  <meshStandardMaterial map={chev} roughness={0.5} />
                </mesh>
              ))}
              {[-1, 1].map((e) => (
                <mesh key={`brkt${e}`} position={[0, -1.55, e * (W + 0.17)]} castShadow>
                  <boxGeometry args={[0.24, 0.18, 0.36]} />
                  <meshStandardMaterial {...chrome} />
                </mesh>
              ))}
              </group>
              {/* The hub on the axle. */}
              <mesh rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.09, 0.09, 0.4, 24]} />
                <meshStandardMaterial color="#15161b" roughness={0.4} />
              </mesh>
              {[-1, 1].map((e) => (
                <mesh key={`br${e}`} position={[0, 0, e * 0.2]} rotation-x={Math.PI / 2}>
                  <torusGeometry args={[0.13, 0.035, 10, 24]} />
                  <meshStandardMaterial {...chrome} />
                </mesh>
              ))}
            </group>
            {/* The swinging arm and its striped head, with a counterweight above the pivot. */}
            <group ref={(el) => void (swingRefs.current[i] = el)} position={sw.pos} quaternion={swing}>
              <mesh position={[0, 0.45, 0]} castShadow>
                <cylinderGeometry args={[0.16, 0.16, 0.5, 24]} />
                <meshStandardMaterial color="#1b1c20" roughness={0.5} metalness={0.3} />
              </mesh>
              <mesh position={[0, -sw.length / 2, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.05, sw.length, 20]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
              {/* The head: a striped drum across the track (the axe swings along it), chrome end caps, a steel spine on the arm. */}
              {(sw as { axis?: string }).axis === "z" ? (
                <>
                  <mesh position={[0, -sw.length, 0]} rotation-x={Math.PI / 2} castShadow>
                    <cylinderGeometry args={[sw.head[1] / 2, sw.head[1] / 2, sw.head[2], 48]} />
                    <meshStandardMaterial map={chev} roughness={0.35} />
                  </mesh>
                  {[-1, 1].map((e) => (
                    <mesh key={e} position={[0, -sw.length, (e * sw.head[2]) / 2]} rotation-x={(e * Math.PI) / 2}>
                      <sphereGeometry args={[sw.head[1] / 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                      <meshStandardMaterial {...chrome} />
                    </mesh>
                  ))}
                  <mesh position={[0, -sw.length + 0.32, 0]} castShadow>
                    <boxGeometry args={[0.16, 0.18, sw.head[2] * 0.6]} />
                    <meshStandardMaterial color="#1b1c20" roughness={0.5} metalness={0.4} />
                  </mesh>
                </>
              ) : (
                <>
                  <mesh position={[0, -sw.length, 0]} rotation-z={Math.PI / 2} castShadow>
                    <cylinderGeometry args={[sw.head[1] / 2, sw.head[1] / 2, sw.head[0], 48]} />
                    <meshStandardMaterial map={chev} roughness={0.35} />
                  </mesh>
                  {[-1, 1].map((e) => (
                    <mesh key={e} position={[(e * sw.head[0]) / 2, -sw.length, 0]} rotation-z={(e * Math.PI) / 2}>
                      <sphereGeometry args={[sw.head[1] / 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                      <meshStandardMaterial {...chrome} />
                    </mesh>
                  ))}
                </>
              )}
            </group>
          </group>
        );
      })}
    </>
  );
}

/** Start gantry, rainbow starting lanes, surface-conforming 3D Checkpoint gantries, and the finish arch. */
export function Gantries({ race, frame }: { race: Race; frame: number }) {
  const samples = race.data.samples as unknown as Sample[];
  const at = (u: number) => samples[Math.max(0, Math.min(samples.length - 1, Math.round((u - samples[0].u) / 0.5)))];
  const W = TRACK.width / 2 + TRACK.wall;
  const H = TRACK_DEPTH + 1.3;
  const banner = useMemo(() => finishBanner(), []);
  const startBannerTex = useMemo(() => startBanner(), []);
  const cpOpenBanners = useMemo(
    () => [
      checkpointBanner(1, "TOP 19 ADVANCE · LAST MARBLE OUT!", false),
      checkpointBanner(2, "TOP 18 ADVANCE · LAST MARBLE OUT!", false),
      checkpointBanner(3, "TOP 17 ADVANCE · TOP 15 SCORE POINTS!", false),
    ],
    [],
  );
  const cpLockedBanners = useMemo(
    () => [
      checkpointBanner(1, "CHECKPOINT LOCKED · 20TH PLACE OUT", true),
      checkpointBanner(2, "CHECKPOINT LOCKED · 19TH PLACE OUT", true),
      checkpointBanner(3, "CHECKPOINT LOCKED · 18TH PLACE OUT", true),
    ],
    [],
  );
  const checkerTex = useMemo(() => {
    const t = canvasTexture(256, 32, (g) => {
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 2; y++) {
          g.fillStyle = (x + y) % 2 ? "#111216" : "#f4f4f6";
          g.fillRect(x * 16, y * 16, 16, 16);
        }
    });
    t.magFilter = THREE.NearestFilter;
    return t;
  }, []);
  const chevTex = useMemo(
    () =>
      canvasTexture(256, 64, (g) => {
        g.fillStyle = "#111216";
        g.fillRect(0, 0, 256, 64);
        g.fillStyle = "#ffcc00";
        for (let x = -64; x < 256; x += 32) {
          g.beginPath();
          g.moveTo(x, 64);
          g.lineTo(x + 16, 64);
          g.lineTo(x + 48, 0);
          g.lineTo(x + 32, 0);
          g.fill();
        }
      }),
    [],
  );
  useEffect(
    () => () => {
      banner.dispose();
      startBannerTex.dispose();
      checkerTex.dispose();
      chevTex.dispose();
      cpOpenBanners.forEach((b) => b.dispose());
      cpLockedBanners.forEach((b) => b.dispose());
    },
    [banner, startBannerTex, checkerTex, chevTex, cpOpenBanners, cpLockedBanners],
  );

  // 10 Rainbow Parallel Starting Chute Lanes from uStart to the start gate (-0.16)
  const rainbowGrid = useMemo(() => {
    const startHalf = samples[0].w ?? TRACK.width / 2;
    const grid = (race.data as unknown as { grid?: { lanes: number; rows: number; rowGap: number } }).grid ?? { lanes: 10, rows: 2, rowGap: 1 };
    const laneW = (2 * startHalf) / grid.lanes;
    const u0 = samples[0].u + 0.15;
    const u1 = -0.16;
    const colors = ["#ff1744", "#ff6d00", "#ffea00", "#00e640", "#00e5ff", "#2979ff", "#7c4dff", "#d500f9", "#ff4081", "#00bfa5"];
    return Array.from({ length: grid.lanes }, (_, slot) => {
      const lat = -startHalf + laneW * (slot + 0.5);
      const col = colors[slot % colors.length];
      return {
        color: col,
        geo: bandGeometry(samples, u0, u1, lat - laneW * 0.43, lat + laneW * 0.43, 0.015),
      };
    });
  }, [samples, race]);

  // Surface-conforming 3D Checkpoint floor bands (strictly on the flat floor inside the wall fillets so they are 100% straight)
  const cps = ((race.data as unknown as { checkpoints?: { index: number; u: number; closedFrame: number | null }[] }).checkpoints ?? []).slice(0, 3);
  const flatHalf = TRACK.width / 2 - TRACK.fillet - 0.03;
  const cpGeos = useMemo(
    () =>
      cps.map((cp) => ({
        upCheck: bandGeometry(samples, cp.u - 0.44, cp.u - 0.16, -flatHalf, flatHalf, 0.014),
        laser: bandGeometry(samples, cp.u - 0.16, cp.u + 0.16, -flatHalf, flatHalf, 0.016),
        dnCheck: bandGeometry(samples, cp.u + 0.16, cp.u + 0.44, -flatHalf, flatHalf, 0.014),
      })),
    [samples, race, flatHalf],
  );

  const cpBoardY = H + 0.48;
  const cpArch = (cpIdx: number, u: number, locked: boolean) => {
    const s = at(u);
    const W = (s.w ?? TRACK.width / 2) + TRACK.wall;
    // Align to the true 3D track frame (s.r across, s.n normal out of floor, s.t along slope)
    const xVec = new THREE.Vector3(...s.r).normalize();
    const upVec = new THREE.Vector3(...s.n).normalize();
    const tVec = new THREE.Vector3().crossVectors(xVec, upVec).normalize();
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xVec, upVec, tVec));
    const cpBanner = locked ? (cpLockedBanners[cpIdx] ?? cpLockedBanners[0]) : (cpOpenBanners[cpIdx] ?? cpOpenBanners[0]);
    const accent = locked ? "#ff1744" : "#00e676";
    const geos = cpGeos[cpIdx];
    return (
      <group key={`cp-${cpIdx}`}>
        {geos && (
          <>
            <mesh geometry={geos.upCheck}>
              <meshStandardMaterial map={checkerTex} roughness={0.55} polygonOffset polygonOffsetFactor={-2} />
            </mesh>
            <mesh geometry={geos.laser}>
              <meshStandardMaterial
                color={accent}
                emissive={accent}
                emissiveIntensity={locked ? 2.4 : 1.6}
                roughness={0.25}
                toneMapped={false}
                polygonOffset
                polygonOffsetFactor={-3}
              />
            </mesh>
            <mesh geometry={geos.dnCheck}>
              <meshStandardMaterial map={checkerTex} roughness={0.55} polygonOffset polygonOffsetFactor={-2} />
            </mesh>
          </>
        )}
        <group position={s.p} quaternion={quat}>
          {/* Industrial twin chrome stanchions with hazard base collars and top status beacons */}
          {[-1, 1].map((sd) => (
            <group key={sd} position={[sd * (W + 0.22), 0, 0]}>
              <mesh position={[0, 0.28, 0]} castShadow>
                <boxGeometry args={[0.28, 0.56, 0.36]} />
                <meshStandardMaterial map={chevTex} roughness={0.45} />
              </mesh>
              <mesh position={[0, cpBoardY / 2 + 0.1, 0]} castShadow>
                <cylinderGeometry args={[0.09, 0.11, cpBoardY + 0.2, 24]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
              <mesh position={[0, cpBoardY + 0.32, 0]}>
                <cylinderGeometry args={[0.12, 0.14, 0.12, 20]} />
                <meshStandardMaterial color="#15161b" roughness={0.4} />
              </mesh>
              <mesh position={[0, cpBoardY + 0.44, 0]}>
                <sphereGeometry args={[0.095, 20, 14]} />
                <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3.2} toneMapped={false} />
              </mesh>
            </group>
          ))}
          {/* Overhead dark-steel gantry housing with chrome rails and dual-sided LED matrix board */}
          <group position={[0, cpBoardY, 0]}>
            <mesh castShadow>
              <boxGeometry args={[2 * W + 0.72, 0.68, 0.2]} />
              <meshStandardMaterial color="#101218" roughness={0.35} metalness={0.65} />
            </mesh>
            {[-0.35, 0.35].map((ry) => (
              <mesh key={ry} position={[0, ry, 0]}>
                <boxGeometry args={[2 * W + 0.78, 0.04, 0.24]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
            ))}
            <mesh position={[0, 0, -0.105]} rotation-y={Math.PI}>
              <planeGeometry args={[2 * W + 0.52, 0.58]} />
              <meshBasicMaterial map={cpBanner} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 0, 0.105]}>
              <planeGeometry args={[2 * W + 0.52, 0.58]} />
              <meshBasicMaterial map={cpBanner} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      </group>
    );
  };

  const arch = (u: number, children: React.ReactNode) => {
    const s = at(u);
    const W = (s.w ?? TRACK.width / 2) + TRACK.wall;
    const xVec = new THREE.Vector3(...s.r).normalize();
    const upVec = new THREE.Vector3(...s.n).normalize();
    const tVec = new THREE.Vector3().crossVectors(xVec, upVec).normalize();
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xVec, upVec, tVec));
    return (
      <group position={s.p} quaternion={quat}>
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * (W + 0.15), H / 2, 0]} castShadow>
            <boxGeometry args={[0.18, H, 0.18]} />
            <meshStandardMaterial color="#e8eaef" metalness={1} roughness={0.12} />
          </mesh>
        ))}
        <mesh position={[0, H, 0]} castShadow>
          <boxGeometry args={[2 * W + 0.5, 0.34, 0.28]} />
          <meshPhysicalMaterial color="#14161d" roughness={0.28} metalness={0.5} clearcoat={0.6} />
        </mesh>
        {children}
      </group>
    );
  };

  return (
    <>
      {/* Satin Rainbow Starting Grid Lanes beneath the 20 marbles */}
      {rainbowGrid.map((rg, idx) => (
        <mesh key={`rg-${idx}`} geometry={rg.geo} receiveShadow>
          <meshStandardMaterial
            color={rg.color}
            emissive={rg.color}
            emissiveIntensity={0.22}
            roughness={0.58}
            metalness={0.05}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      ))}
      {arch(
        -0.15,
        <mesh position={[0, H, -0.15]} rotation-y={Math.PI}>
          <planeGeometry args={[2 * (at(-0.15).w ?? TRACK.width / 2) + 0.4, 0.3]} />
          <meshStandardMaterial map={startBannerTex} roughness={0.5} side={THREE.DoubleSide} />
        </mesh>,
      )}
      {cps.map((cp, idx) => cpArch(idx, cp.u, cp.closedFrame != null && frame >= cp.closedFrame))}
      {/* Grand Prix Finish Portal + 3D Gold Championship Trophy on a Stepped Plinth */}
      {(() => {
        const uFin = race.data.info.finish ?? race.L;
        const s = at(uFin);
        const Wf = (s.w ?? TRACK.width / 2) + TRACK.wall;
        const xVec = new THREE.Vector3(...s.r).normalize();
        const upVec = new THREE.Vector3(...s.n).normalize();
        const tVec = new THREE.Vector3().crossVectors(xVec, upVec).normalize();
        const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xVec, upVec, tVec));
        const gold = { color: "#ffd54f", metalness: 0.96, roughness: 0.14 } as const;
        return (
          <group position={s.p} quaternion={quat}>
            {/* Twin Checkered & Gold Finish Towers */}
            {[-1, 1].map((sd) => (
              <group key={sd} position={[sd * (Wf + 0.24), 0, 0]}>
                <mesh position={[0, 0.32, 0]} castShadow>
                  <boxGeometry args={[0.34, 0.64, 0.42]} />
                  <meshStandardMaterial map={checkerTex} roughness={0.45} />
                </mesh>
                <mesh position={[0, cpBoardY / 2 + 0.12, 0]} castShadow>
                  <cylinderGeometry args={[0.1, 0.12, cpBoardY + 0.24, 24]} />
                  <meshStandardMaterial {...chrome} />
                </mesh>
                <mesh position={[0, cpBoardY + 0.46, 0]}>
                  <sphereGeometry args={[0.11, 20, 14]} />
                  <meshStandardMaterial color="#ffcc00" emissive="#ffaa00" emissiveIntensity={3.5} toneMapped={false} />
                </mesh>
              </group>
            ))}
            {/* Overhead Grand Prix Finish Bridge */}
            <group position={[0, cpBoardY, 0]}>
              <mesh castShadow>
                <boxGeometry args={[2 * Wf + 0.84, 0.74, 0.24]} />
                <meshStandardMaterial color="#101218" roughness={0.32} metalness={0.7} />
              </mesh>
              {[-0.38, 0.38].map((ry) => (
                <mesh key={ry} position={[0, ry, 0]}>
                  <boxGeometry args={[2 * Wf + 0.9, 0.05, 0.28]} />
                  <meshStandardMaterial {...gold} />
                </mesh>
              ))}
              <mesh position={[0, 0, -0.125]} rotation-y={Math.PI}>
                <planeGeometry args={[2 * Wf + 0.64, 0.62]} />
                <meshBasicMaterial map={banner} side={THREE.DoubleSide} />
              </mesh>
              <mesh position={[0, 0, 0.125]}>
                <planeGeometry args={[2 * Wf + 0.64, 0.62]} />
                <meshBasicMaterial map={banner} side={THREE.DoubleSide} />
              </mesh>
            </group>
            {/* 3D Gold Championship Trophy Cup on a Stepped Plinth beside the Finish Arch */}
            <group position={[Wf + 1.05, 0, 0]}>
              {/* Stepped obsidian & gold plinth */}
              <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.46, 0.54, 0.44, 32]} />
                <meshStandardMaterial color="#141720" metalness={0.75} roughness={0.28} />
              </mesh>
              <mesh position={[0, 0.46, 0]}>
                <cylinderGeometry args={[0.48, 0.48, 0.05, 32]} />
                <meshStandardMaterial {...gold} />
              </mesh>
              {/* Trophy pedestal base & stem */}
              <mesh position={[0, 0.62, 0]} castShadow>
                <cylinderGeometry args={[0.16, 0.28, 0.28, 28]} />
                <meshStandardMaterial {...gold} />
              </mesh>
              <mesh position={[0, 0.92, 0]} castShadow>
                <cylinderGeometry args={[0.08, 0.12, 0.36, 24]} />
                <meshStandardMaterial {...gold} />
              </mesh>
              {/* Sculpted Gold Trophy Cup Bowl + Twin Handles + Crown Globe */}
              <mesh position={[0, 1.32, 0]} castShadow>
                <cylinderGeometry args={[0.34, 0.12, 0.52, 32]} />
                <meshStandardMaterial {...gold} />
              </mesh>
              <mesh position={[0, 1.58, 0]} rotation-x={Math.PI / 2}>
                <torusGeometry args={[0.34, 0.032, 14, 32]} />
                <meshStandardMaterial {...gold} />
              </mesh>
              {[-1, 1].map((hd) => (
                <mesh key={hd} position={[hd * 0.28, 1.34, 0]}>
                  <torusGeometry args={[0.13, 0.028, 14, 28]} />
                  <meshStandardMaterial {...gold} />
                </mesh>
              ))}
              <mesh position={[0, 1.72, 0]} castShadow>
                <sphereGeometry args={[0.14, 24, 18]} />
                <meshStandardMaterial color="#ffe082" emissive="#ffb300" emissiveIntensity={0.65} metalness={0.95} roughness={0.1} />
              </mesh>
            </group>
          </group>
        );
      })()}
    </>
  );
}

/** 3D Checkpoint Gantry Signboard ("CHECKPOINT X · TOP N ADVANCE") */
function checkpointBanner(idx: number, subtitle: string, locked: boolean) {
  return canvasTexture(1024, 224, (g) => {
    const accent = locked ? "#ff1744" : "#00e676";
    g.fillStyle = "#0a0c12";
    g.fillRect(0, 0, 1024, 224);
    g.strokeStyle = accent;
    g.lineWidth = 8;
    g.strokeRect(6, 6, 1012, 212);

    // Checkered end-caps on left and right
    for (let side of [18, 942]) {
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 2; c++) {
          g.fillStyle = (r + c) % 2 === 0 ? accent : "#141822";
          g.fillRect(side + c * 32, 20 + r * 30, 32, 30);
        }
      }
    }

    g.fillStyle = "#ffffff";
    g.font = "900 76px 'Avenir Next', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(`CHECKPOINT ${idx}`, 512, 82);

    g.fillStyle = accent;
    g.font = "800 36px 'Avenir Next', system-ui, sans-serif";
    g.fillText(subtitle, 512, 162);
  });
}

function startBanner() {
  return canvasTexture(512, 64, (g) => {
    g.fillStyle = "#111216";
    g.fillRect(0, 0, 512, 64);
    g.fillStyle = "#ffcc00";
    g.fillRect(0, 0, 512, 6);
    g.fillRect(0, 58, 512, 6);
    g.fillStyle = "#ffffff";
    g.font = "900 36px 'Avenir Next', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("DON'T BE LAST · START", 256, 34);
  });
}

/** The chequered FINISH banner on the Grand Prix finish arch. */
function finishBanner() {
  return canvasTexture(1024, 224, (g) => {
    g.fillStyle = "#0a0c12";
    g.fillRect(0, 0, 1024, 224);
    g.strokeStyle = "#ffcc00";
    g.lineWidth = 8;
    g.strokeRect(6, 6, 1012, 212);
    // Checkered flags on left and right sides (2 columns wide so center text has full clearance)
    for (const side of [18, 942]) {
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 2; c++) {
          g.fillStyle = (r + c) % 2 === 0 ? "#ffffff" : "#141822";
          g.fillRect(side + c * 32, 20 + r * 30, 32, 30);
        }
      }
    }
    g.fillStyle = "#ffcc00";
    g.font = "900 68px 'Avenir Next', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("GRAND PRIX FINISH", 512, 82);
    g.fillStyle = "#ffffff";
    g.font = "800 32px 'Avenir Next', system-ui, sans-serif";
    g.fillText("CHAMPIONSHIP SHOWDOWN · DON'T BE LAST!", 512, 162);
  });
}

/**
 * Start gate: a flap cut to the trough's U profile, hinged on a chrome bar along
 * its top edge. At lights out it swings forward and up, like a starting gate.
 */
export function Gate({ race, t }: { race: Race; t: number }) {
  const view = useView(race);
  const sub = useSubframe();
  const gate = race.data.gate as unknown as { hinge: Vec3; quat: Quat; height: number; lightsOut: number; swing: number; time: number };
  const { geometry, faceTex } = useMemo(() => {
    const startHalf = (race.data.samples[0] as unknown as Sample).w ?? TRACK.width / 2;
    const { inner } = troughProfile(8, startHalf) as unknown as { inner: [number, number, number][] };
    const shape = new THREE.Shape();
    const inset = 0.04;
    inner.forEach(([l, u], k) => {
      const x = l * (1 - inset / startHalf);
      const y = u + (u < 0.05 ? inset : 0) - gate.height;
      if (k === 0) shape.moveTo(x, 0); // top-left corner, at the hinge
      shape.lineTo(x, y);
    });
    shape.lineTo(inner[inner.length - 1][0] * 0.98, 0);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 24 });
    geometry.translate(0, 0, -0.04);
    // Face: white, with a yellow/black band along the top and a black START.
    const faceTex = canvasTexture(1024, 600, (g) => {
      g.fillStyle = "#fbfbfc";
      g.fillRect(0, 0, 1024, 600);
      g.fillStyle = "#111";
      g.fillRect(0, 0, 1024, 110);
      g.fillStyle = "#ffcc00";
      for (let x = -120; x < 1100; x += 60) {
        g.beginPath();
        g.moveTo(x, 110);
        g.lineTo(x + 30, 110);
        g.lineTo(x + 90, 0);
        g.lineTo(x + 60, 0);
        g.fill();
      }
      g.fillStyle = "#111";
      g.font = "900 150px 'Avenir Next', system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("START", 512, 260);
    });
    // Shape coordinates are in track units: map the 4.2 × 2.35 face onto the texture.
    // Shape coordinates are in track units: map the face onto the texture (reads from the grid side).
    faceTex.repeat.set(1 / (2 * startHalf), 1 / gate.height);
    faceTex.offset.set(0.5, 1);
    faceTex.wrapS = faceTex.wrapT = THREE.ClampToEdgeWrapping;
    return { geometry, faceTex };
  }, [gate.height, race]);

  const angleAt = (s: number) => gate.swing * (1 - (1 - Math.min(Math.max((s - gate.lightsOut) / gate.time, 0), 1)) ** 3);
  const swingAt = (s: number) => new THREE.Quaternion(...gate.quat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angleAt(s)));
  const W = ((race.data.samples[0] as unknown as Sample).w ?? TRACK.width / 2) + TRACK.wall;
  /** Post e's piston at flap angle a: from its foot on the post to the flap's side. */
  const pistonAt = (e: number, a: number) => {
    const base = new THREE.Vector3(-0.35, -0.75, e * (W + 0.25));
    const dir = new THREE.Vector3(Math.sin(a) * 1.0, -Math.cos(a) * 1.0, e * (W - 0.02)).sub(base);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { base, q, len, body: Math.min(0.62, len * 0.6) };
  };
  // The pistons stretch by scaling unit-height cylinders, moved like the flap on every sub-frame.
  const pistonRefs = useRef([-1, 1].map(() => ({ group: null as THREE.Group | null, body: null as THREE.Mesh | null, rod: null as THREE.Mesh | null, tip: null as THREE.Mesh | null })));
  const placePistons = (a: number) =>
    [-1, 1].forEach((e, i) => {
      const p = pistonAt(e, a);
      const r = pistonRefs.current[i];
      r.group?.quaternion.copy(p.q);
      r.body?.scale.set(1, p.body, 1);
      r.body?.position.set(0, p.body / 2, 0);
      r.rod?.scale.set(1, p.len - p.body, 1);
      r.rod?.position.set(0, p.body + (p.len - p.body) / 2, 0);
      r.tip?.position.set(0, p.len, 0);
    });
  const sec = t / race.fps;
  const angle = angleAt(sec);
  const swing = swingAt(sec);
  const flapRef = useRef<THREE.Group>(null);
  useEffect(
    () =>
      sub.subscribe((vf) => {
        const s = view.tAt(vf) / race.fps;
        flapRef.current?.quaternion.copy(swingAt(s));
        placePistons(angleAt(s));
      }),
    [sub, view, race, gate],
  );
  return (
    <>
      <group position={gate.hinge} quaternion={gate.quat}>
        {/* Hinge bar and its two chrome posts. */}
        <mesh rotation-x={Math.PI / 2} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 2 * W + 0.5, 32]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        {[-1, 1].map((e) => (
          <group key={e} position={[0, 0, e * (W + 0.25)]}>
            <mesh position={[0, -gate.height / 2 - 0.2, 0]} castShadow>
              <boxGeometry args={[0.18, gate.height + 0.6, 0.18]} />
              <meshStandardMaterial {...chrome} />
            </mesh>
            <mesh rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.13, 0.13, 0.12, 32]} />
              <meshStandardMaterial color="#15161b" roughness={0.4} />
            </mesh>
          </group>
        ))}
      </group>
      {/* Pneumatic pistons: from each post to the flap's side, stretching as it opens. */}
      <group position={gate.hinge} quaternion={gate.quat}>
        {[-1, 1].map((e, i) => {
          const { base, q, len, body } = pistonAt(e, angle);
          const r = pistonRefs.current[i];
          return (
            <group key={e} ref={(el) => void (r.group = el)} position={base} quaternion={q}>
              <mesh ref={(el) => void (r.body = el)} position={[0, body / 2, 0]} scale={[1, body, 1]} castShadow>
                <cylinderGeometry args={[0.045, 0.045, 1, 24]} />
                <meshStandardMaterial color="#1c1d22" roughness={0.35} metalness={0.4} />
              </mesh>
              <mesh ref={(el) => void (r.rod = el)} position={[0, body + (len - body) / 2, 0]} scale={[1, len - body, 1]} castShadow>
                <cylinderGeometry args={[0.018, 0.018, 1, 16]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
              <mesh key="foot" position={[0, 0, 0]} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.04, 0.04, 0.05, 20]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
              <mesh key="tip" ref={(el) => void (r.tip = el)} position={[0, len, 0]} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.04, 0.04, 0.05, 20]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
            </group>
          );
        })}
      </group>
      <group ref={flapRef} position={gate.hinge} quaternion={swing}>
        {/* The flap: shape x across the track (local z), y up (local y), thickness along the track. */}
        <mesh geometry={geometry} rotation-y={-Math.PI / 2} castShadow receiveShadow>
          <meshPhysicalMaterial map={faceTex} roughness={0.25} clearcoat={1} clearcoatRoughness={0.06} />
        </mesh>
      </group>
    </>
  );
}

/**
 * Chrome marble with painted bands: a colour equator band carrying the name,
 * two thin pinstripes, and a sunburst at each pole (in an equirectangular map
 * the top and bottom rows converge on the poles, so vertical rays become a
 * burst). Paint is glossy and non-metallic; everything else is mirror chrome.
 */
/**
 * A marble painted in its country's colour (the main colour of its flag, from
 * the season's marble list) with the flag wrapped round the equator as a wide
 * band (twice round, so it reads from any side), the country code in a roundel
 * at the seams, and thin chrome pinstripes as the only bare metal. The paint is
 * a metallic-flake finish under a clear coat: it reflects the sky softly
 * instead of mirroring every cloud, so the colour and the flag read first.
 */
export function marbleTextures(name: string, code: string, color?: string) {
  // 1024×512: combines the swirled art-glass / agate polar domes with the country flag
  // wrapped twice around the equator, country-code roundels at the seams, and chrome pinstripes.
  const W = 1024;
  const H = 512;
  const flag = (FLAGS as Record<string, { colors: readonly string[] }>)[code];
  const base = color ?? flag?.colors[0] ?? "#888";
  const accent = flag?.colors.find((c) => c.toLowerCase() !== base.toLowerCase()) ?? "#ffffff";
  const palette = flag?.colors?.length ? [...flag.colors] : [base, accent, "#ffcc00"];
  if (palette.length === 1) palette.push("#ffffff", base);
  if (palette.length === 2) palette.push(palette[0]);

  const parseHex = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const c0 = parseHex(base);
  const c1 = parseHex(palette[1] ?? "#ffffff");
  const c2 = parseHex(palette[2] ?? palette[0]);

  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) & 0xffff;
  const sx = (seed % 97) * 0.13;
  const sy = ((seed >> 4) % 89) * 0.17;
  const sz = ((seed >> 8) % 73) * 0.19;

  // Metal/rough map values: G = roughness, B = metalness
  const PAINT = "rgb(0,52,46)"; // glossy swirled glass base coat: roughness ~0.20, metalness ~0.18
  const FLAG = "rgb(0,48,18)"; // printed flag band under clearcoat: roughness ~0.19, low metal
  const CHROME = "rgb(0,14,255)"; // pinstripes: mirror chrome
  const bandY = H * 0.3;
  const bandH = H * 0.4;

  const paint = (g: CanvasRenderingContext2D, metalMap: boolean) => {
    if (metalMap) {
      g.fillStyle = PAINT;
      g.fillRect(0, 0, W, H);
    } else {
      // Paint swirled art-glass ribbons across the upper and lower domes so the poles have rich 3D depth
      const img = g.createImageData(W, H);
      const d = img.data;
      for (let y = 0; y < H; y++) {
        const v = (y + 0.5) / H;
        const theta = v * Math.PI;
        const sinT = Math.sin(theta);
        const ny = Math.cos(theta);
        for (let x = 0; x < W; x++) {
          const u = (x + 0.5) / W;
          const phi = u * Math.PI * 2;
          const nx = sinT * Math.cos(phi);
          const nz = sinT * Math.sin(phi);

          const wx = nx * 2.4 + Math.sin(ny * 3.2 + sz) * 0.65 + Math.cos(nz * 2.7 + sx) * 0.45;
          const wy = ny * 2.4 + Math.sin(nz * 3.1 + sx) * 0.65 + Math.cos(nx * 2.9 + sy) * 0.45;
          const wz = nz * 2.4 + Math.sin(nx * 3.3 + sy) * 0.65 + Math.cos(ny * 2.6 + sz) * 0.45;

          const f1 = Math.sin(wx * 2.4 + Math.cos(wy * 2.7 + wz * 2.1));
          const f2 = Math.cos(wy * 2.9 - Math.sin(wz * 2.5 - wx * 2.3));
          const ribbon1 = Math.max(0, Math.min(1, 0.5 + 0.5 * Math.sin((f1 + f2) * 2.4)));
          const ribbon2 = Math.max(0, Math.min(1, Math.pow(0.5 + 0.5 * Math.cos(f1 * 3.8 - f2 * 2.8), 2.2)));
          const depth = 0.72 + 0.32 * (0.5 + 0.5 * (f1 * 0.6 + f2 * 0.4));

          const w1 = ribbon1 * 0.65;
          const w2 = ribbon2 * 0.48;
          const w0 = Math.max(0.15, 1 - w1 - w2 * 0.6);
          const norm = w0 + w1 + w2 || 1;

          const idx = (y * W + x) * 4;
          d[idx] = Math.min(255, Math.max(0, Math.round(((c0[0] * w0 + c1[0] * w1 + c2[0] * w2) / norm) * depth)));
          d[idx + 1] = Math.min(255, Math.max(0, Math.round(((c0[1] * w0 + c1[1] * w1 + c2[1] * w2) / norm) * depth)));
          d[idx + 2] = Math.min(255, Math.max(0, Math.round(((c0[2] * w0 + c1[2] * w1 + c2[2] * w2) / norm) * depth)));
          d[idx + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);

      // Soft darkening toward the poles so the paint looks deep
      const shade = g.createLinearGradient(0, 0, 0, H);
      shade.addColorStop(0, "rgba(0,0,0,0.24)");
      shade.addColorStop(0.28, "rgba(0,0,0,0)");
      shade.addColorStop(0.72, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(0,0,0,0.24)");
      g.fillStyle = shade;
      g.fillRect(0, 0, W, H);
    }

    // The country flag band, wrapped twice around the equator, each with a crisp dark frame.
    if (metalMap) {
      g.fillStyle = FLAG;
      g.fillRect(0, bandY, W, bandH);
    } else {
      for (let k = 0; k < 2; k++) {
        drawFlag(g, code, (W / 2) * k, bandY, W / 2, bandH);
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect((W / 2) * k, bandY, 6, bandH);
        g.fillRect((W / 2) * k, bandY, W / 2, 5);
        g.fillRect((W / 2) * k, bandY + bandH - 5, W / 2, 5);
      }
    }

    // Country code roundels at the seams.
    if (!metalMap) {
      for (let k = 0; k < 2; k++) {
        const cx = (W / 2) * k + W / 4;
        g.fillStyle = "#111216";
        g.beginPath();
        g.arc(cx, H / 2, H * 0.09, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#ffffff";
        g.lineWidth = H * 0.009;
        g.stroke();
        g.fillStyle = "#ffffff";
        g.font = `900 ${H * 0.066}px 'Avenir Next', system-ui, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(code, cx, H / 2 + 2);
      }
    }

    // Chrome pinstripes edging the flag band, and an accent stripe in the flag's second colour.
    g.fillStyle = metalMap ? CHROME : "#ffffff";
    g.fillRect(0, bandY - H * 0.022, W, H * 0.012);
    g.fillRect(0, bandY + bandH + H * 0.01, W, H * 0.012);
    g.fillStyle = metalMap ? PAINT : accent;
    g.fillRect(0, H * 0.2, W, H * 0.025);
    g.fillRect(0, H * 0.775, W, H * 0.025);
  };
  const map = bakedTexture(W, H, (g) => paint(g, false));
  const mr = bakedTexture(W, H, (g) => paint(g, true));
  mr.colorSpace = THREE.NoColorSpace;
  void name;
  return { map, mr };
}

/**
 * Paints a canvas and copies it into a plain data texture, then frees the canvas.
 * Forty live 2048×1024 canvases (two per marble) made Chrome drop canvas
 * backings under memory pressure: parts of the marbles rendered blank white.
 */
function bakedTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  draw(g);
  const src = g.getImageData(0, 0, w, h).data;
  // Rows flipped: a data texture's first row is the bottom (v = 0).
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  c.width = c.height = 0;
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Dedicated plan-view (top + flanks) 1024×1024 racing livery texture for 3D lofted cars:
 * u ∈ [0,1] runs from rear tail (0) to front nosecone (1);
 * v ∈ [0,1] runs from left flank (0) across centerline (0.5) to right flank (1).
 */
function carLiveryTexture(code: string, color?: string, carNum = 1) {
  const W = 1024;
  const H = 1024;
  const flag = (FLAGS as Record<string, { colors: readonly string[] }>)[code];
  const base = color ?? flag?.colors[0] ?? "#d82828";
  const accent = flag?.colors.find((c) => c.toLowerCase() !== base.toLowerCase()) ?? "#ffffff";
  const third = flag?.colors[2] ?? "#ffcc00";

  return bakedTexture(W, H, (g) => {
    // 1. Metallic team paint base with 3D crown highlight & dark carbon lower skirts
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.0, "#10131a");
    grad.addColorStop(0.11, "#161a24");
    grad.addColorStop(0.14, base);
    grad.addColorStop(0.42, base);
    grad.addColorStop(0.5, "#ffffff");
    grad.addColorStop(0.58, base);
    grad.addColorStop(0.86, base);
    grad.addColorStop(0.89, "#161a24");
    grad.addColorStop(1.0, "#10131a");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Blend base over centerline so the highlight is a soft metallic sheen
    g.globalAlpha = 0.72;
    g.fillStyle = base;
    g.fillRect(0, H * 0.14, W, H * 0.72);
    g.globalAlpha = 1;

    // 2. Carbon-fiber weave & neon edge pin-stripes on side skirts
    g.fillStyle = accent;
    g.fillRect(0, H * 0.135, W, 6);
    g.fillRect(0, H * 0.859, W, 6);

    // 3. Twin Le Mans / Formula center racing stripes running nose-to-tail
    g.fillStyle = accent;
    g.fillRect(0, H * 0.452, W, H * 0.034);
    g.fillRect(0, H * 0.514, W, H * 0.034);
    g.fillStyle = third;
    g.fillRect(0, H * 0.488, W, H * 0.024);

    // 4. Prominent Country Flag on the Front Hood / Nosecone (u ∈ [0.64, 0.88])
    const fx = W * 0.64;
    const fw = W * 0.24;
    const fy = H * 0.32;
    const fh = H * 0.36;
    drawFlag(g, code, fx, fy, fw, fh);
    g.strokeStyle = "#11141c";
    g.lineWidth = 6;
    g.strokeRect(fx, fy, fw, fh);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 2.5;
    g.strokeRect(fx - 3, fy - 3, fw + 6, fh + 6);

    // 5. Prominent Country Flag on Rear Engine Cover / Deck (u ∈ [0.12, 0.36], visible from chase & grid cameras!)
    drawFlag(g, code, W * 0.12, H * 0.30, W * 0.24, H * 0.40);
    g.strokeStyle = "#11141c";
    g.lineWidth = 6;
    g.strokeRect(W * 0.12, H * 0.30, W * 0.24, H * 0.40);

    // 6. Twin Country Flags on Left & Right Sidepods (u ∈ [0.34, 0.58])
    for (const sy of [H * 0.155, H * 0.665]) {
      drawFlag(g, code, W * 0.34, sy, W * 0.24, H * 0.18);
      g.strokeStyle = "#11141c";
      g.lineWidth = 5;
      g.strokeRect(W * 0.34, sy, W * 0.24, H * 0.18);
    }

    // 7. Aero heat-extractor carbon louvers on rear sidepods (u ∈ [0.16, 0.29])
    g.fillStyle = "rgba(10,12,18,0.82)";
    for (let k = 0; k < 6; k++) {
      const lx = W * (0.16 + k * 0.02);
      g.fillRect(lx, H * 0.18, W * 0.009, H * 0.09);
      g.fillRect(lx, H * 0.73, W * 0.009, H * 0.09);
    }

    // 8. Racing Number Roundel on Nosecone (u = 0.91), Rear Deck (u = 0.24), & Both Flanks (u = 0.46)
    const drawRoundel = (cx: number, cy: number, r: number) => {
      g.fillStyle = "#f8fafd";
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = Math.max(3, r * 0.12);
      g.strokeStyle = "#11131a";
      g.stroke();
      g.fillStyle = "#11131a";
      g.font = `900 ${Math.round(r * 1.25)}px 'Avenir Next', system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(carNum), cx, cy + r * 0.06);
    };
    drawRoundel(W * 0.91, H * 0.5, 38);
    drawRoundel(W * 0.24, H * 0.5, 42);
    drawRoundel(W * 0.46, H * 0.245, 38);
    drawRoundel(W * 0.46, H * 0.755, 38);
  });
}

export function Marbles({ race, t }: { race: Race; t: number }) {
  const view = useView(race);
  const sub = useSubframe();
  const isCar = (race.data.info as { vehicle?: string })?.vehicle === "car";
  const tex = useMemo(() => race.marbles.map((m) => marbleTextures(m.name, (m as { flag?: string }).flag ?? "", (m as { color?: string }).color)), [race]);
  const carTex = useMemo(
    () => (isCar ? race.marbles.map((m, i) => carLiveryTexture((m as { flag?: string }).flag ?? "", (m as { color?: string }).color, i + 1)) : []),
    [race, isCar],
  );
  // The largest textures on a canvas (two 1024×512 maps per marble): freed with it, not whenever it is collected.
  useEffect(
    () => () => {
      tex.forEach((t) => {
        t.map.dispose();
        t.mr.dispose();
      });
      carTex.forEach((ct) => ct.dispose());
    },
    [tex, carTex],
  );
  const refs = useRef<(THREE.Object3D | null)[]>([]);
  const wheelRefs = useRef<(THREE.Object3D | null)[][]>([]);
  const flameRefs = useRef<(THREE.Object3D | null)[][]>([]);
  const brakeRefs = useRef<(THREE.Mesh | null)[]>([]);
  useEffect(
    () =>
      sub.subscribe((vf) => {
        const tt = view.tAt(vf);
        const f0 = Math.max(0, Math.min(Math.floor(tt), race.lastFrame));
        const f1 = Math.min(f0 + 1, race.lastFrame);
        const a = Math.min(Math.max(tt - f0, 0), 1);
        const frames = race.data.frames as number[][][];
        const qNow = new THREE.Quaternion();
        const qInv = new THREE.Quaternion();
        const qAhead = new THREE.Quaternion();
        const fwdLocal = new THREE.Vector3();
        race.marbles.forEach((_, i) => {
          const m = refs.current[i];
          if (!m) return;
          const { pos, quat } = race.marblePose(i, tt);
          const drained = race.drainPose(i, tt);
          m.position.set(...(drained ? drained.pos : pos));
          m.quaternion.set(...quat);
          m.visible = drained ? drained.visible : !race.dqBy(i, tt);
          if (isCar && wheelRefs.current[i]) {
            const u = frames[f0][i][7] + (frames[f1][i][7] - frames[f0][i][7]) * a;
            const spin = -u / 0.135;
            // Compute Ackermann front-wheel steering angle from upcoming chassis heading change
            const fAhead = Math.min(race.lastFrame, f0 + 4);
            qNow.set(quat[0], quat[1], quat[2], quat[3]);
            qInv.copy(qNow).invert();
            const fA = frames[fAhead][i];
            qAhead.set(fA[3], fA[4], fA[5], fA[6]);
            fwdLocal.set(1, 0, 0).applyQuaternion(qAhead).applyQuaternion(qInv);
            const steerYaw = Math.max(-0.42, Math.min(0.42, -Math.atan2(fwdLocal.z, Math.max(0.25, fwdLocal.x)) * 2.1));
            wheelRefs.current[i].forEach((w, wIdx) => {
              if (!w) return;
              if (wIdx < 2) {
                // Front wheels: Ackermann inside-wheel steering amplification around Y + axle spin around Z
                const isInside = (wIdx === 0 && steerYaw > 0) || (wIdx === 1 && steerYaw < 0);
                const ack = isInside ? 1.14 : 0.92;
                w.rotation.order = "YZX";
                w.rotation.set(0, steerYaw * ack, spin);
              } else {
                w.rotation.set(0, 0, spin);
              }
            });
          }
          if (isCar && (flameRefs.current[i] || brakeRefs.current[i])) {
            const fPrev = Math.max(0, f0 - 2);
            const fPrev2 = Math.max(0, f0 - 5);
            const vNow = (frames[f1][i][7] - frames[fPrev][i][7]) * (race.fps / Math.max(1, f1 - fPrev));
            const vBefore = (frames[fPrev][i][7] - frames[fPrev2][i][7]) * (race.fps / Math.max(1, fPrev - fPrev2));
            const aLong = (vNow - vBefore) * (race.fps / 2.5);
            const boostK = Math.max(0, Math.min(1.6, (vNow - 14.2) * 0.28 + Math.max(0, aLong - 2.0) * 0.12));
            const flicker = 0.85 + 0.3 * Math.sin(tt * 1.9 + i * 2.3);
            if (flameRefs.current[i]) {
              for (const fl of flameRefs.current[i]) {
                if (fl) {
                  fl.visible = boostK > 0.05;
                  fl.scale.set(0.8 + boostK * 0.35, (0.4 + boostK * 1.15) * flicker, 0.8 + boostK * 0.35);
                }
              }
            }
            const brk = brakeRefs.current[i];
            if (brk) {
              const isBraking = aLong < -1.1 && vNow > 4.0;
              const mat = brk.material as THREE.MeshStandardMaterial;
              if (mat) mat.emissiveIntensity = isBraking ? 11.5 : 2.2;
              brk.scale.set(isBraking ? 1.45 : 1, isBraking ? 1.35 : 1, isBraking ? 1.08 : 1);
            }
          }
        });
      }),
    [sub, view, race, isCar],
  );
  const night = isNight();
  const smokePack = useMemo(() => {
    if (!isCar) return null;
    const frames = race.data.frames as number[][][];
    const fps = race.fps;
    const MAX_SMOKE = 360;
    const list: { t0: number; life: number; origin: Vec3; vel: Vec3; size0: number }[] = [];
    const qTmp = new THREE.Quaternion();
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    for (let i = 0; i < race.N; i++) {
      let lastPuff = -999;
      for (let f = Math.max(2, race.timeline.raceStart + 12); f < race.lastFrame; f += 2) {
        if (f - lastPuff < 3 || race.dqBy(i, f)) continue;
        const P0 = frames[f - 2][i];
        const P1 = frames[f - 1][i];
        const P2 = frames[f][i];
        const vx = (P2[0] - P1[0]) * fps;
        const vy = (P2[1] - P1[1]) * fps;
        const vz = (P2[2] - P1[2]) * fps;
        const speed = Math.hypot(vx, vy, vz);
        if (speed < 5.2 || speed > 42) continue;
        const v1x = (P1[0] - P0[0]) * fps;
        const v1z = (P1[2] - P0[2]) * fps;
        const latAcc = Math.hypot(vx - v1x, vz - v1z);
        qTmp.set(P2[3], P2[4], P2[5], P2[6]);
        fwd.set(1, 0, 0).applyQuaternion(qTmp);
        right.set(0, 0, 1).applyQuaternion(qTmp);
        const invSpd = 1 / Math.max(0.001, Math.hypot(vx, vz));
        const sinSlip = Math.abs(fwd.x * vz * invSpd - fwd.z * vx * invSpd);
        if (sinSlip < 0.18 && latAcc < 4.2) continue;
        lastPuff = f;
        const intensity = Math.min(1.4, Math.max((sinSlip - 0.16) * 2.6, (latAcc - 3.8) * 0.25));
        const seed = f * 41 + i * 19;
        for (const side of [-1, 1] as const) {
          const s = seed + (side > 0 ? 7.1 : 0);
          const ox = P2[0] - fwd.x * 0.31 + right.x * (side * 0.25);
          const oy = P2[1] - 0.25;
          const oz = P2[2] - fwd.z * 0.31 + right.z * (side * 0.25);
          list.push({
            t0: f + hash(s) * 1.0,
            life: 0.24 + hash(s + 2.3) * 0.18,
            origin: [ox, oy, oz],
            vel: [
              vx * 0.35 + right.x * side * (0.25 + hash(s + 4.1) * 0.5),
              0.32 + hash(s + 6.9) * 0.45,
              vz * 0.35 + right.z * side * (0.25 + hash(s + 8.3) * 0.5),
            ],
            size0: 0.055 + intensity * 0.038,
          });
        }
      }
    }
    list.sort((a, b) => a.t0 - b.t0);
    const geo = new THREE.OctahedronGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: "#eef4fc",
      emissive: "#a8b8cc",
      emissiveIntensity: 0.28,
      roughness: 0.96,
      metalness: 0.0,
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
    });
    const inst = new THREE.InstancedMesh(geo, mat, MAX_SMOKE);
    inst.frustumCulled = false;
    return { mesh: inst, puffs: list, max: MAX_SMOKE, geo, mat };
  }, [race, isCar]);

  useEffect(
    () => () => {
      if (smokePack) {
        smokePack.geo.dispose();
        smokePack.mat.dispose();
      }
    },
    [smokePack],
  );

  const updateSmoke = (simT: number) => {
    if (!smokePack) return;
    const { mesh, puffs, max } = smokePack;
    const fps = race.fps;
    const minT0 = simT - 0.5 * fps;
    let lo = 0;
    let hi = puffs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (puffs[mid].t0 < minT0) lo = mid + 1;
      else hi = mid;
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const zero = new THREE.Vector3(0, 0, 0);
    let count = 0;
    for (let idx = lo; idx < puffs.length && count < max; idx++) {
      const pf = puffs[idx];
      if (pf.t0 > simT) break;
      const age = (simT - pf.t0) / fps;
      if (age <= 0 || age >= pf.life) continue;
      const u = age / pf.life;
      const grow = Math.sin(u * Math.PI) * (0.9 + u * 1.4);
      pos.set(pf.origin[0] + pf.vel[0] * age, pf.origin[1] + pf.vel[1] * age, pf.origin[2] + pf.vel[2] * age);
      dir.set(pf.vel[0], pf.vel[1] * 0.3, pf.vel[2]);
      const spd = dir.length();
      if (spd > 0.001) q.setFromUnitVectors(up, dir.divideScalar(spd));
      else q.identity();
      const r = pf.size0 * grow;
      sc.set(r * 0.85, r * 2.1, r * 0.42);
      mesh.setMatrixAt(count++, m.compose(pos, q, sc));
    }
    mesh.visible = count > 0;
    if (mesh.visible) {
      for (let k = count; k < max; k++) mesh.setMatrixAt(k, m.compose(zero, q, zero));
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  updateSmoke(t);
  useEffect(() => sub.subscribe((vf) => updateSmoke(view.tAt(vf))), [sub, view, race, smokePack]);

  const carGeoms = useMemo(() => {
    if (!isCar) return null;
    const bump = (x: number, c: number, w: number) => Math.exp(-Math.pow((x - c) / w, 2));

    // True 3D multi-station lofted car body with plan-view UVs (u along length X, v across width Z)
    const buildLoftedHull = (style: 0 | 1 | 2 | 3) => {
      const NX = 56;
      const NR = 48;
      const xMin = -0.43;
      const xMax = 0.55;
      const pos: number[] = [];
      const uvs: number[] = [];
      const idx: number[] = [];

      for (let ix = 0; ix <= NX; ix++) {
        const u = ix / NX;
        const x = xMin + u * (xMax - xMin);
        const noseT = Math.max(0, (x - 0.16) / (xMax - 0.16));
        const tailT = Math.max(0, (-0.18 - x) / (-0.18 - xMin));

        // 1) Half-width profile w(x) for each racing class
        let halfW = 0.21;
        if (style === 0) {
          // Formula Apex: needle nosecone -> wide Venturi sidepods -> tight coke-bottle rear
          const noseW = 0.036 + 0.068 * (1 - Math.pow(noseT, 1.35));
          const podBulge = 0.135 * bump(x, -0.03, 0.22);
          const rearTap = 1 - 0.38 * Math.pow(tailT, 1.4);
          halfW = x > 0.18 ? noseW : (0.102 + podBulge) * rearTap;
        } else if (style === 1) {
          // Le Mans Hypercar / Cyber-GT: wide low nose + muscular front/rear wheel arches + pinched waist
          const fArch = 0.038 * bump(x, 0.25, 0.13);
          const rArch = 0.045 * bump(x, -0.24, 0.14);
          const waist = -0.022 * bump(x, 0.01, 0.14);
          const noseRound = x > 0.42 ? 1 - 0.32 * Math.pow((x - 0.42) / (xMax - 0.42), 2) : 1;
          halfW = (0.225 + fArch + rArch + waist) * noseRound;
        } else if (style === 2) {
          // Dakar / WRC Rally Raid Prototype: wide muscular off-road stance with flared arches
          const arch = 0.034 * bump(x, 0.25, 0.13) + 0.038 * bump(x, -0.24, 0.14);
          const noseRound = x > 0.38 ? 1 - 0.28 * Math.pow((x - 0.38) / (xMax - 0.38), 2) : 1;
          halfW = (0.215 + arch) * noseRound;
        } else {
          // Bonneville Jet-Streamliner: supersonic needle nose + twin side nacelles + turbine tail
          const noseTap = x > 0.15 ? 1 - 0.72 * Math.pow((x - 0.15) / (xMax - 0.15), 1.45) : 1;
          const nacelle = 0.065 * bump(x, -0.06, 0.25);
          halfW = (0.145 + nacelle) * noseTap;
        }

        // Longitudinal tip closure at very front/back
        const tipScale = ix === 0 || ix === NX ? 0.08 : ix === 1 || ix === NX - 1 ? 0.68 : 1;
        const w = halfW * tipScale;

        // 2) Vertical profile: floor yBot(x), central spine yCenter(x), and outer pontoon/fender ySide(x)
        const noseLift = x > 0.35 ? 0.028 * Math.pow((x - 0.35) / 0.2, 1.6) : 0;
        const tailDiffuser = x < -0.26 ? 0.032 * Math.pow((-0.26 - x) / 0.17, 1.5) : 0;
        const yBot = (style === 2 ? -0.225 : -0.242) + noseLift + tailDiffuser;

        // Centerline height (nose slope + recessed cockpit tub + raised airbox / engine cover spine)
        const cockpitDip = -0.065 * bump(x, 0.02, 0.115);
        const airboxHump = (style === 2 ? 0.095 : style === 1 ? 0.075 : 0.088) * bump(x, -0.17, 0.16);
        const noseSlope = x > 0.12 ? -0.085 * Math.pow((x - 0.12) / (xMax - 0.12), 1.25) : 0;
        const tailSlope = x < -0.22 ? -0.045 * Math.pow((-0.22 - x) / (-0.22 - xMin), 1.4) : 0;
        const yCenterBase = (style === 2 ? -0.078 : -0.102) + cockpitDip + airboxHump + noseSlope + tailSlope;

        // Outer flank / fender / sidepod shoulder height
        let yFlankBase = yCenterBase - 0.028;
        if (style === 0) {
          // F1 Venturi sidepod shoulder
          yFlankBase = -0.158 + 0.052 * bump(x, 0.03, 0.17) - 0.035 * noseT;
        } else if (style === 1) {
          // LMP / GT3 tall sculpted front & rear wheel-arch fenders with low central hood channel
          const fenderH = 0.078 * bump(x, 0.25, 0.13) + 0.086 * bump(x, -0.24, 0.14);
          yFlankBase = -0.155 + fenderH;
        } else if (style === 2) {
          // Rally Raid high fender arches
          const fenderH = 0.065 * bump(x, 0.25, 0.13) + 0.068 * bump(x, -0.24, 0.14);
          yFlankBase = -0.125 + fenderH;
        }

        for (let ir = 0; ir <= NR; ir++) {
          const vRing = ir / NR;
          const theta = vRing * Math.PI * 2; // 0 = top-center, π/2 = right flank, π = bottom-center, 3π/2 = left flank
          const sinT = Math.sin(theta);
          const cosT = Math.cos(theta);

          // Super-elliptical cross-section with aerodynamic sidepod undercut
          const absSin = Math.abs(sinT);
          const signZ = sinT >= 0 ? 1 : -1;
          const zNorm = signZ * Math.pow(absSin, 0.82);
          let z = zNorm * w;

          // Undercut on lower sidepods so flanks curve inward at the floor
          if (cosT < 0 && style !== 3) {
            const undercut = 1 - 0.18 * Math.pow(-cosT, 0.8) * bump(x, -0.04, 0.24);
            z *= undercut;
          }

          let y: number;
          if (cosT >= 0) {
            // Upper deck: blend smoothly between centerline (airbox / cockpit tub) and outer fender/sidepod shoulders
            const lat = absSin;
            const shoulderBlend = Math.sin(lat * Math.PI * 0.88);
            const yDeck = yCenterBase * (1 - 0.68 * shoulderBlend) + yFlankBase * (0.68 * shoulderBlend);
            // Cockpit coaming rim around the driver opening
            const coaming = 0.022 * bump(x, 0.02, 0.12) * bump(lat, 0.42, 0.16);
            const crown = Math.pow(cosT, 0.55);
            y = yBot + (yDeck + coaming - yBot) * (0.32 + 0.68 * crown);
          } else {
            // Lower hull: flat Venturi floor with beveled outer chine
            const bottomFlat = Math.pow(-cosT, 0.42);
            const yMid = 0.5 * (yBot + yFlankBase);
            y = yMid - (yMid - yBot) * bottomFlat;
          }

          if (ix === 0 || ix === NX) {
            y = 0.5 * (yBot + yCenterBase) + 0.08 * cosT * tipScale;
          }

          pos.push(x, y, z);
          // Plan-view UV mapping: u along length, v across width from left flank (0) to right flank (1)
          const uvU = Math.max(0.01, Math.min(0.99, u));
          const uvV = Math.max(0.02, Math.min(0.98, 0.5 + (z / Math.max(0.18, halfW * 2.15))));
          uvs.push(uvU, uvV);
        }
      }

      for (let ix = 0; ix < NX; ix++) {
        for (let ir = 0; ir < NR; ir++) {
          const a = ix * (NR + 1) + ir;
          const b = a + NR + 1;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    };

    // Sculpted 3D Swept Delta Front Wing Mainplane
    const fwShape = new THREE.Shape();
    fwShape.moveTo(0.08, 0);
    fwShape.quadraticCurveTo(0.07, 0.16, 0.015, 0.285);
    fwShape.lineTo(-0.075, 0.285);
    fwShape.quadraticCurveTo(-0.03, 0.14, -0.045, 0);
    fwShape.quadraticCurveTo(-0.03, -0.14, -0.075, -0.285);
    fwShape.lineTo(0.015, -0.285);
    fwShape.quadraticCurveTo(0.07, -0.16, 0.08, 0);
    const f1FrontWing = new THREE.ExtrudeGeometry(fwShape, {
      depth: 0.018,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.006,
      bevelThickness: 0.006,
      curveSegments: 24,
    });
    f1FrontWing.rotateX(Math.PI / 2);
    f1FrontWing.computeVertexNormals();

    // Sculpted 3D Swept Rear Wing Airfoil Plane
    const rwShape = new THREE.Shape();
    rwShape.moveTo(0.065, 0);
    rwShape.quadraticCurveTo(0.055, 0.15, 0.03, 0.255);
    rwShape.lineTo(-0.065, 0.255);
    rwShape.quadraticCurveTo(-0.045, 0.14, -0.055, 0);
    rwShape.quadraticCurveTo(-0.045, -0.14, -0.065, -0.255);
    rwShape.lineTo(0.03, -0.255);
    rwShape.quadraticCurveTo(0.055, -0.15, 0.065, 0);
    const rearWingPlane = new THREE.ExtrudeGeometry(rwShape, {
      depth: 0.014,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.005,
      bevelThickness: 0.005,
      curveSegments: 24,
    });
    rearWingPlane.rotateX(Math.PI / 2);
    rearWingPlane.computeVertexNormals();

    // Sculpted Wing Endplate (curved profile)
    const epShape = new THREE.Shape();
    epShape.moveTo(-0.09, -0.03);
    epShape.lineTo(0.09, -0.03);
    epShape.quadraticCurveTo(0.11, 0.02, 0.06, 0.075);
    epShape.lineTo(-0.08, 0.085);
    epShape.quadraticCurveTo(-0.11, 0.03, -0.09, -0.03);
    const wingEndplate = new THREE.ExtrudeGeometry(epShape, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      curveSegments: 20,
    });
    wingEndplate.translate(0, 0, -0.006);
    wingEndplate.computeVertexNormals();

    // 3D Titanium Halo Hoop (TubeGeometry along a 3D curve around the cockpit)
    const haloCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.09, -0.055, -0.095),
      new THREE.Vector3(0.03, -0.012, -0.082),
      new THREE.Vector3(0.145, -0.018, 0),
      new THREE.Vector3(0.03, -0.012, 0.082),
      new THREE.Vector3(-0.09, -0.055, 0.095),
    ]);
    const haloHoop = new THREE.TubeGeometry(haloCurve, 32, 0.014, 12, false);

    // LatheGeometry Rounded-Shoulder Racing Slick Tire (aligned with Z-axis via rotation-x = Math/2)
    const buildTireGeo = (rOuter: number, rInner: number, width: number) => {
      const hw = width / 2;
      const sh = width * 0.18;
      const pts = [
        new THREE.Vector2(rInner, -hw * 0.88),
        new THREE.Vector2(rOuter * 0.92, -hw),
        new THREE.Vector2(rOuter, -hw + sh),
        new THREE.Vector2(rOuter, hw - sh),
        new THREE.Vector2(rOuter * 0.92, hw),
        new THREE.Vector2(rInner, hw * 0.88),
        new THREE.Vector2(rInner * 0.92, 0),
        new THREE.Vector2(rInner, -hw * 0.88),
      ];
      const g = new THREE.LatheGeometry(pts, 40);
      g.rotateX(Math.PI / 2);
      g.computeVertexNormals();
      return g;
    };

    // 6-Spoke 3D Star Alloy Wheel Rim (3D torus rim lips + 6 radial 3D spokes)
    const buildSpokeRim = (rRim: number, width: number) => {
      const parts: THREE.BufferGeometry[] = [];
      const lipOut = new THREE.TorusGeometry(rRim * 0.92, rRim * 0.095, 14, 36);
      const lipIn = lipOut.clone();
      lipOut.translate(0, 0, width * 0.36);
      lipIn.translate(0, 0, -width * 0.36);
      parts.push(lipOut, lipIn);
      for (let k = 0; k < 6; k++) {
        const ang = (k * Math.PI) / 3;
        const sp = new THREE.BoxGeometry(rRim * 1.72, rRim * 0.15, width * 0.22);
        sp.rotateZ(ang);
        sp.translate(0, 0, width * 0.18);
        const spIn = sp.clone();
        spIn.translate(0, 0, -width * 0.36);
        parts.push(sp, spIn);
      }
      const merged = mergeGeometries(parts);
      merged.computeVertexNormals();
      return merged;
    };

    return {
      hulls: [buildLoftedHull(0), buildLoftedHull(1), buildLoftedHull(2), buildLoftedHull(3)],
      f1FrontWing,
      rearWingPlane,
      wingEndplate,
      haloHoop,
      tireFront: buildTireGeo(0.132, 0.076, 0.112),
      tireRear: buildTireGeo(0.144, 0.082, 0.134),
      tireRally: buildTireGeo(0.146, 0.08, 0.128),
      rimFront: buildSpokeRim(0.078, 0.112),
      rimRear: buildSpokeRim(0.085, 0.134),
    };
  }, [isCar]);

  if (isCar && carGeoms) {
    return (
      <>
        {smokePack && <primitive object={smokePack.mesh} />}
        {race.marbles.map((m, i) => {
          const { pos, quat } = race.marblePose(i, t);
          const drained = race.drainPose(i, t);
          const teamColor = (m as { color?: string }).color ?? "#ff3300";
          const cls = (m as { stats?: { cls?: string } }).stats?.cls;
          const carStyle = (cls === "F1" ? 0 : cls === "GT" ? 1 : cls === "BGY" ? 2 : cls === "JET" ? 3 : i % 4) as 0 | 1 | 2 | 3;
          if (!wheelRefs.current[i]) wheelRefs.current[i] = [null, null, null, null];
          if (!flameRefs.current[i]) flameRefs.current[i] = [null, null];
          return (
            <group
              key={i}
              ref={(el) => void (refs.current[i] = el)}
              position={drained ? drained.pos : pos}
              quaternion={quat}
              visible={drained ? drained.visible : !race.dqBy(i, t)}
            >
              {/* Authentic 3D Lofted & Sculpted Motorsport Chassis */}
              <group scale={[1.22, 0.92, 1.05]}>
                {/* 1. Ground-Effect Carbon-Fiber Underbody Floor Plank & Rear Diffuser */}
                <mesh position={[0.02, -0.242, 0]} castShadow receiveShadow>
                  <boxGeometry args={[0.78, 0.016, carStyle === 1 ? 0.48 : 0.42]} />
                  <meshStandardMaterial color="#12151d" metalness={0.55} roughness={0.32} />
                </mesh>
                {/* Glowing Constructor Floor Edge LED Underglow Strips */}
                {([-1, 1] as const).map((side) => (
                  <mesh key={`fl${side}`} position={[0.0, -0.236, side * (carStyle === 1 ? 0.242 : 0.212)]}>
                    <boxGeometry args={[0.48, 0.012, 0.012]} />
                    <meshStandardMaterial color="#ffffff" emissive={teamColor} emissiveIntensity={2.4} toneMapped={false} />
                  </mesh>
                ))}

                {/* 2. True 3D Lofted Aerodynamic Bodywork with Plan-View Country Flag & Racing Livery */}
                <mesh geometry={carGeoms.hulls[carStyle]} castShadow receiveShadow>
                  <meshPhysicalMaterial
                    map={carTex[i]}
                    emissiveMap={carTex[i]}
                    emissive="#ffffff"
                    emissiveIntensity={0.14}
                    metalness={0.42}
                    roughness={0.18}
                    clearcoat={1}
                    clearcoatRoughness={0.04}
                    envMapIntensity={night ? 1.4 : 1.1}
                  />
                </mesh>

                {/* 3. Sidepod Radiator Intakes & Aero Mirrors (Styles 0 & 1) */}
                {(carStyle === 0 || carStyle === 1) &&
                  ([-1, 1] as const).map((side) => (
                    <group key={`sp${side}`}>
                      {/* Dark carbon radiator intake mouth on front of sidepods */}
                      <mesh position={[0.14, -0.145, side * 0.165]} rotation={[0, side * 0.18, 0]}>
                        <boxGeometry args={[0.03, 0.068, 0.095]} />
                        <meshStandardMaterial color="#0b0d12" roughness={0.85} metalness={0.2} />
                      </mesh>
                      {/* Sculpted wing mirror pod on stalk */}
                      <mesh position={[0.11, -0.055, side * 0.155]} rotation={[0.3 * side, 0, -0.2]}>
                        <boxGeometry args={[0.045, 0.022, 0.036]} />
                        <meshPhysicalMaterial color={teamColor} metalness={0.6} roughness={0.18} clearcoat={1} />
                      </mesh>
                    </group>
                  ))}

                {/* 4. Class 0 (Formula Apex): Swept Delta Multi-Element Front Wing + 3D Titanium Halo + Airbox Intake */}
                {carStyle === 0 && (
                  <group>
                    {/* Swept 3D Delta Carbon Front Wing + Team Secondary Flap + Curved Endplates */}
                    <group position={[0.49, -0.238, 0]}>
                      <mesh geometry={carGeoms.f1FrontWing} castShadow receiveShadow>
                        <meshStandardMaterial color="#161a22" metalness={0.65} roughness={0.26} />
                      </mesh>
                      <mesh geometry={carGeoms.f1FrontWing} position={[-0.025, 0.018, 0]} scale={[0.72, 1, 0.94]} rotation={[0, 0, 0.18]} castShadow>
                        <meshPhysicalMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.2} metalness={0.5} roughness={0.2} clearcoat={1} />
                      </mesh>
                      {([-1, 1] as const).map((side) => (
                        <mesh key={side} geometry={carGeoms.wingEndplate} position={[-0.01, 0.02, side * 0.282]} castShadow>
                          <meshPhysicalMaterial color="#f4f7fc" metalness={0.35} roughness={0.22} clearcoat={1} />
                        </mesh>
                      ))}
                    </group>
                    {/* 3D Titanium FIA Halo Protection Hoop + Front Pylon */}
                    <mesh geometry={carGeoms.haloHoop} castShadow>
                      <meshStandardMaterial color="#202530" metalness={0.88} roughness={0.18} />
                    </mesh>
                    <mesh position={[0.135, -0.055, 0]} rotation={[0, 0, -0.38]} castShadow>
                      <cylinderGeometry args={[0.011, 0.013, 0.085, 16]} />
                      <meshStandardMaterial color="#202530" metalness={0.88} roughness={0.18} />
                    </mesh>
                    {/* Overhead Roll-Hoop Ram-Air Intake Scoop */}
                    <mesh position={[-0.105, -0.005, 0]} rotation={[0, 0, Math.PI / 2]}>
                      <cylinderGeometry args={[0.032, 0.038, 0.06, 20]} />
                      <meshStandardMaterial color="#0c0e14" metalness={0.5} roughness={0.4} />
                    </mesh>
                  </group>
                )}

                {/* 5. Class 1 (Le Mans Hypercar / Cyber-GT): Wraparound GT Windshield, Roof Scoop, Splitter, Dorsal Fin & Quad LEDs */}
                {carStyle === 1 && (
                  <group>
                    {/* Front Carbon GT Splitter Lip */}
                    <mesh position={[0.48, -0.242, 0]} castShadow>
                      <boxGeometry args={[0.14, 0.018, 0.52]} />
                      <meshStandardMaterial color="#11141c" metalness={0.7} roughness={0.24} />
                    </mesh>
                    {/* Curved Wraparound Smoked-Glass GT Windshield Visor */}
                    <mesh position={[0.09, -0.052, 0]} rotation={[0, Math.PI / 2, -0.32]}>
                      <cylinderGeometry args={[0.115, 0.138, 0.068, 32, 1, true, -Math.PI * 0.45, Math.PI * 0.9]} />
                      <meshPhysicalMaterial color="#090e18" emissive={teamColor} emissiveIntensity={0.25} metalness={0.92} roughness={0.05} clearcoat={1} side={THREE.DoubleSide} />
                    </mesh>
                    {/* GT3 Roof Halo Hoop + Overhead Ram-Air Scoop */}
                    <mesh geometry={carGeoms.haloHoop} scale={[1.05, 1.02, 1.08]} castShadow>
                      <meshPhysicalMaterial color={teamColor} metalness={0.65} roughness={0.18} clearcoat={1} />
                    </mesh>
                    {/* LMP Central Carbon Dorsal Shark-Fin */}
                    <mesh position={[-0.24, -0.015, 0]} castShadow>
                      <boxGeometry args={[0.24, 0.11, 0.014]} />
                      <meshPhysicalMaterial color={teamColor} metalness={0.55} roughness={0.2} clearcoat={1} />
                    </mesh>
                    {/* Glowing Quad Cyber-GT Laser Headlights on Front Fenders */}
                    {([-1, 1] as const).map((side) => (
                      <mesh key={side} position={[0.42, -0.115, side * 0.195]} rotation={[0, -side * 0.22, 0.18]}>
                        <boxGeometry args={[0.055, 0.02, 0.082]} />
                        <meshStandardMaterial color="#e0ffff" emissive="#00f0ff" emissiveIntensity={3.6} toneMapped={false} />
                      </mesh>
                    ))}
                  </group>
                )}

                {/* 6. Class 2 (Dakar / WRC Rally Raid): Tubular Bull-Bar, Full Roll Cage, 4-Pod Roof Lightbar & Twin Spare Tires */}
                {carStyle === 2 && (
                  <group>
                    {/* Front Aluminum Skid-Plate & Bull-Bar */}
                    <mesh position={[0.48, -0.195, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                      <cylinderGeometry args={[0.022, 0.022, 0.36, 20]} />
                      <meshStandardMaterial color="#2a303c" metalness={0.85} roughness={0.22} />
                    </mesh>
                    {/* 3D Tubular Rally Roll Cage + Roof Rack */}
                    <mesh geometry={carGeoms.haloHoop} position={[0, 0.025, 0]} scale={[1.15, 1.15, 1.18]} castShadow>
                      <meshStandardMaterial color={teamColor} metalness={0.7} roughness={0.22} />
                    </mesh>
                    {/* 4-Pod Rally Raid LED Roof Lightbar */}
                    {[-0.075, -0.025, 0.025, 0.075].map((lz, li) => (
                      <mesh key={li} position={[0.12, 0.055, lz]} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.02, 0.018, 0.032, 16]} />
                        <meshStandardMaterial color="#fffbe6" emissive="#ffdd66" emissiveIntensity={3.6} toneMapped={false} />
                      </mesh>
                    ))}
                    {/* Angled Rear Dakar Spare Wheel & Tire in Rear Bed */}
                    <group position={[-0.32, -0.055, 0]} rotation={[Math.PI / 2, 0.42, 0]}>
                      <mesh geometry={carGeoms.tireFront} scale={[0.82, 0.82, 0.82]} castShadow>
                        <meshStandardMaterial color="#15181f" roughness={0.72} metalness={0.18} />
                      </mesh>
                      <mesh geometry={carGeoms.rimFront} scale={[0.82, 0.82, 0.82]}>
                        <meshStandardMaterial color={teamColor} metalness={0.85} roughness={0.2} />
                      </mesh>
                    </group>
                  </group>
                )}

                {/* 7. Class 3 (Bonneville Jet-Streamliner): 8 Individual Chrome V8 Exhaust Headers, Twin Tailfins & Jet Turbine */}
                {carStyle === 3 && (
                  <group>
                    {/* 4 Individual Curved Chrome V8 Exhaust Pipes per Flank */}
                    {([-1, 1] as const).map((side) =>
                      [0.2, 0.09, -0.02, -0.13].map((px, pi) => (
                        <mesh key={`${side}-${pi}`} position={[px, -0.155, side * 0.175]} rotation={[side * 0.25, -side * 0.35, Math.PI / 2]} castShadow>
                          <cylinderGeometry args={[0.016, 0.021, 0.14, 16]} />
                          <meshStandardMaterial color="#eef4ff" metalness={0.96} roughness={0.07} />
                        </mesh>
                      )),
                    )}
                    {/* Twin Swept Supersonic Tailfins */}
                    {([-1, 1] as const).map((side) => (
                      <mesh key={side} geometry={carGeoms.wingEndplate} position={[-0.31, -0.04, side * 0.155]} scale={[1.35, 1.45, 1.2]} castShadow>
                        <meshPhysicalMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.22} metalness={0.55} roughness={0.18} clearcoat={1} />
                      </mesh>
                    ))}
                    {/* Massive Rear Jet-Turbine Nozzle & Multi-Stage Afterburner Plume */}
                    <mesh position={[-0.41, -0.145, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                      <cylinderGeometry args={[0.078, 0.062, 0.12, 32]} />
                      <meshStandardMaterial color="#1d222c" metalness={0.88} roughness={0.2} />
                    </mesh>
                    <mesh
                      ref={(el) => void (flameRefs.current[i][0] = el)}
                      position={[-0.52, -0.145, 0]}
                      rotation={[0, 0, Math.PI / 2]}
                    >
                      <coneGeometry args={[0.056, 0.22, 28]} />
                      <meshStandardMaterial color="#88f0ff" emissive="#ff6600" emissiveIntensity={3.8} toneMapped={false} />
                    </mesh>
                  </group>
                )}

                {/* 8. Recessed Driver Helmet + Iridescent Visor inside the Cockpit */}
                <group position={[0.01, -0.068, 0]}>
                  <mesh castShadow>
                    <sphereGeometry args={[0.088, 36, 28]} />
                    <meshPhysicalMaterial
                      map={tex[i].map}
                      emissiveMap={tex[i].map}
                      emissive="#ffffff"
                      emissiveIntensity={0.18}
                      metalness={0.75}
                      roughness={0.14}
                      clearcoat={1}
                    />
                  </mesh>
                  <mesh position={[0.022, 0.008, 0]} rotation={[0, Math.PI / 2, -0.12]}>
                    <cylinderGeometry args={[0.091, 0.091, 0.044, 28, 1, true, -Math.PI * 0.36, Math.PI * 0.72]} />
                    <meshStandardMaterial color="#080c14" emissive={teamColor} emissiveIntensity={0.45} metalness={0.96} roughness={0.05} side={THREE.DoubleSide} />
                  </mesh>
                </group>

                {/* 9. Swan-Neck Dual-Plane Rear Wing + Curved Endplates + Rear Diffuser Strakes + FIA Rain Light & Twin Exhausts */}
                {carStyle !== 3 && (
                  <group position={[-0.37, -0.025, 0]}>
                    {/* Twin Swan-Neck Wing Pylons */}
                    {([-1, 1] as const).map((side) => (
                      <mesh key={`py${side}`} position={[0.04, -0.045, side * 0.068]} rotation={[0, 0, -0.22]} castShadow>
                        <boxGeometry args={[0.065, 0.105, 0.012]} />
                        <meshStandardMaterial color="#151922" metalness={0.75} roughness={0.25} />
                      </mesh>
                    ))}
                    {/* Lower Sculpted Carbon Mainplane + Upper Team-Colored DRS Swept Wing */}
                    <mesh geometry={carGeoms.rearWingPlane} position={[0.015, -0.008, 0]} scale={[1, 1, carStyle === 1 ? 1.06 : 0.96]} rotation={[0, 0, 0.06]} castShadow>
                      <meshStandardMaterial color="#151922" metalness={0.65} roughness={0.24} />
                    </mesh>
                    <mesh geometry={carGeoms.rearWingPlane} position={[-0.018, 0.024, 0]} scale={[0.88, 1, carStyle === 1 ? 1.06 : 0.96]} rotation={[0, 0, 0.14]} castShadow>
                      <meshPhysicalMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.26} metalness={0.55} roughness={0.16} clearcoat={1} />
                    </mesh>
                    {/* Sculpted Curved Rear Wing Endplates */}
                    {([-1, 1] as const).map((side) => (
                      <mesh key={side} geometry={carGeoms.wingEndplate} position={[0, -0.015, side * (carStyle === 1 ? 0.272 : 0.246)]} scale={[1.02, 1.22, 1]} castShadow>
                        <meshPhysicalMaterial color={teamColor} metalness={0.5} roughness={0.2} clearcoat={1} />
                      </mesh>
                    ))}
                    {/* 4 Vertical Carbon Venturi Diffuser Strakes under Rear Bumper */}
                    {[-0.15, -0.055, 0.055, 0.15].map((dz, di) => (
                      <mesh key={`df${di}`} position={[-0.02, -0.175, dz]}>
                        <boxGeometry args={[0.08, 0.048, 0.008]} />
                        <meshStandardMaterial color="#10131a" metalness={0.6} roughness={0.3} />
                      </mesh>
                    ))}
                    {/* Glowing Red FIA Rain Light / Cyber-GT Full-Width LED Taillight Bar (flares intensely under braking!) */}
                    <mesh ref={(el) => void (brakeRefs.current[i] = el)} position={[-0.045, -0.135, 0]}>
                      <boxGeometry args={[0.026, 0.032, carStyle === 1 ? 0.46 : 0.052]} />
                      <meshStandardMaterial color="#ff2233" emissive="#ff1122" emissiveIntensity={2.2} toneMapped={false} />
                    </mesh>
                    {/* Twin Titanium Exhaust Pipes with Recessed Glowing Core & Dynamic DRS/Overtake Afterburner Flames */}
                    {([-1, 1] as const).map((side, exIdx) => (
                      <group key={`ex${side}`} position={[-0.052, -0.132, side * 0.092]}>
                        <mesh rotation={[0, 0, Math.PI / 2]}>
                          <cylinderGeometry args={[0.022, 0.024, 0.062, 24]} />
                          <meshStandardMaterial color="#c8d4e8" metalness={0.92} roughness={0.15} />
                        </mesh>
                        <mesh position={[-0.029, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                          <cylinderGeometry args={[0.016, 0.016, 0.008, 20]} />
                          <meshStandardMaterial color="#77e8ff" emissive="#00c8ff" emissiveIntensity={2.8} toneMapped={false} />
                        </mesh>
                        <mesh
                          ref={(el) => void (flameRefs.current[i][exIdx] = el)}
                          position={[-0.11, 0, 0]}
                          rotation={[0, 0, Math.PI / 2]}
                        >
                          <coneGeometry args={[0.024, 0.16, 20]} />
                          <meshStandardMaterial color="#88f8ff" emissive="#00d8ff" emissiveIntensity={3.6} transparent opacity={0.88} toneMapped={false} />
                        </mesh>
                      </group>
                    ))}
                  </group>
                )}

                {/* 10. Double-Wishbone Carbon Suspension Arms & Pushrods connecting Chassis to Wheel Hubs */}
                {(
                  [
                    [0.26, -0.195, -1],
                    [0.26, -0.195, 1],
                    [-0.25, -0.19, -1],
                    [-0.25, -0.19, 1],
                  ] as const
                ).map(([sx, sy, side], sIdx) => (
                  <group key={`susp${sIdx}`}>
                    {/* Upper & Lower Carbon Wishbone Arms */}
                    <mesh position={[sx, sy + 0.022, side * 0.165]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                      <cylinderGeometry args={[0.008, 0.008, 0.17, 10]} />
                      <meshStandardMaterial color="#181c24" metalness={0.75} roughness={0.25} />
                    </mesh>
                    <mesh position={[sx, sy - 0.022, side * 0.165]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                      <cylinderGeometry args={[0.009, 0.009, 0.17, 10]} />
                      <meshStandardMaterial color="#181c24" metalness={0.75} roughness={0.25} />
                    </mesh>
                    {/* Angled Coilover Pushrod */}
                    <mesh position={[sx - 0.01, sy + 0.035, side * 0.155]} rotation={[side * 0.62, 0, 0]}>
                      <cylinderGeometry args={[0.007, 0.007, 0.15, 10]} />
                      <meshStandardMaterial color={teamColor} metalness={0.8} roughness={0.2} />
                    </mesh>
                    {/* Non-rotating Slotted Carbon Brake Disc & Glowing Red Brembo Caliper */}
                    <mesh position={[sx, sy, side * (sIdx < 2 ? 0.24 : 0.25)]}>
                      <cylinderGeometry args={[0.064, 0.064, 0.016, 24]} />
                      <meshStandardMaterial color="#383e4c" metalness={0.85} roughness={0.28} />
                    </mesh>
                  </group>
                ))}

                {/* 11. 4 Rounded-Shoulder LatheGeometry Racing Slicks + 6-Spoke 3D Star Alloy Rims + Center-Lock Nuts */}
                {(
                  [
                    [0.26, -0.195, -0.262, true, 0],
                    [0.26, -0.195, 0.262, true, 1],
                    [-0.25, -0.185, -0.272, false, 2],
                    [-0.25, -0.185, 0.272, false, 3],
                  ] as const
                ).map(([wx, wy, wz, isFront, wIdx]) => {
                  const wr = isFront ? 0.132 : 0.144;
                  const ww = isFront ? 0.112 : 0.134;
                  const signZ = wz >= 0 ? 1 : -1;
                  return (
                    <group key={wIdx} position={[wx, wy, wz]} ref={(el) => void (wheelRefs.current[i][wIdx] = el)}>
                      {/* LatheGeometry Rounded-Shoulder Racing Slick Tire */}
                      <mesh
                        geometry={carStyle === 2 ? carGeoms.tireRally : isFront ? carGeoms.tireFront : carGeoms.tireRear}
                        castShadow
                        receiveShadow
                      >
                        <meshStandardMaterial color="#121419" roughness={0.68} metalness={0.16} />
                      </mesh>
                      {/* Pirelli-Style Colored Sidewall Stripe Ring on Outer Face */}
                      <mesh position={[0, 0, signZ * (ww * 0.495)]} rotation={[0, signZ > 0 ? 0 : Math.PI, 0]}>
                        <ringGeometry args={[wr * 0.66, wr * 0.78, 36]} />
                        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.48} roughness={0.22} metalness={0.6} side={THREE.DoubleSide} />
                      </mesh>
                      {/* 6-Spoke 3D Star Forged Alloy Wheel Rim */}
                      <mesh
                        geometry={isFront ? carGeoms.rimFront : carGeoms.rimRear}
                        rotation={[0, signZ > 0 ? 0 : Math.PI, 0]}
                        castShadow
                      >
                        <meshStandardMaterial color="#e6ecf5" roughness={0.15} metalness={0.94} />
                      </mesh>
                      {/* Anodized Center-Lock Wheel Nut */}
                      <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[wr * 0.16, wr * 0.16, ww * 0.92, 18]} />
                        <meshStandardMaterial color={teamColor} roughness={0.18} metalness={0.88} />
                      </mesh>
                    </group>
                  );
                })}
              </group>
            </group>
          );
        })}
      </>
    );
  }
  return (
    <>
      {race.marbles.map((_, i) => {
        const { pos, quat } = race.marblePose(i, t);
        const drained = race.drainPose(i, t);
        return (
          <mesh key={i} ref={(el) => void (refs.current[i] = el)} position={drained ? drained.pos : pos} quaternion={quat} visible={drained ? drained.visible : !race.dqBy(i, t)} castShadow receiveShadow>
            <sphereGeometry args={[race.data.marbleRadius, 96, 64]} />
            <meshPhysicalMaterial
              map={tex[i].map}
              emissiveMap={tex[i].map}
              emissive="#ffffff"
              emissiveIntensity={0.14}
              metalnessMap={tex[i].mr}
              roughnessMap={tex[i].mr}
              metalness={1}
              roughness={1}
              clearcoat={1}
              clearcoatRoughness={0.025}
              ior={1.58}
              reflectivity={0.95}
              envMapIntensity={night ? 1.25 : 1.0}
            />
          </mesh>
        );
      })}
    </>
  );
}

/** High-energy collision sparks emitted deterministically from hard marble/car impacts; closed-form for any frame or slow-mo replay. */
export function ImpactSparks({ race, t }: { race: Race; t: number }) {
  const view = useView(race);
  const sub = useSubframe();
  const isCar = (race.data.info as { vehicle?: string })?.vehicle === "car";
  const MAX = isCar ? 420 : 160;
  const { mesh, sparks, geo, mat } = useMemo(() => {
    const frames = race.data.frames as number[][][];
    const fps = race.fps;
    const minImp = isCar ? 3.2 : 5.2;
    const list: { t0: number; life: number; origin: Vec3; vel: Vec3; hot: number }[] = [];
    for (let i = 0; i < race.N; i++) {
      let lastBurst = -999;
      let lastSkid = -999;
      for (let f = Math.max(2, race.timeline.raceStart + 10); f < race.lastFrame; f++) {
        if (race.dqBy(i, f)) continue;
        const P0 = frames[f - 2][i];
        const P1 = frames[f - 1][i];
        const P2 = frames[f][i];
        const v1x = (P1[0] - P0[0]) * fps;
        const v1y = (P1[1] - P0[1]) * fps;
        const v1z = (P1[2] - P0[2]) * fps;
        const v2x = (P2[0] - P1[0]) * fps;
        const v2y = (P2[1] - P1[1]) * fps;
        const v2z = (P2[2] - P1[2]) * fps;
        const speed = Math.hypot(v2x, v2y, v2z);
        if (speed < 3.8 || speed > 42) continue;
        const dvx = v2x - v1x;
        const dvy = v2y - v1y;
        const dvz = v2z - v1z;
        const impulse = Math.hypot(dvx, dvy, dvz);
        // Underbody titanium skid-block sparks on jump ramps, landings, crests & peak-speed aero compression
        if (isCar && f - lastSkid >= 4 && ((dvy > 1.05 && speed > 7.5) || (speed > 13.2 && (f + i * 3) % 5 === 0))) {
          lastSkid = f;
          const invSpd = 1 / speed;
          const fx = v2x * invSpd;
          const fz = v2z * invSpd;
          const skidCount = dvy > 1.05 ? 7 : 3;
          const skidSeed = f * 53 + i * 29;
          for (let k = 0; k < skidCount; k++) {
            const s = skidSeed + k * 5.9;
            const lat = (hash(s) - 0.5) * 1.4;
            list.push({
              t0: f - 0.3 + hash(s + 1.7) * 0.5,
              life: 0.14 + hash(s + 3.1) * 0.18,
              origin: [P2[0] - fx * 0.34 + fz * (hash(s + 4.3) - 0.5) * 0.18, P2[1] - 0.24, P2[2] - fz * 0.34 - fx * (hash(s + 4.3) - 0.5) * 0.18],
              vel: [
                v2x * 0.28 + fz * lat,
                0.8 + hash(s + 6.1) * 2.1,
                v2z * 0.28 - fx * lat,
              ],
              hot: 1,
            });
          }
        }
        if (f - lastBurst < (isCar ? 8 : 12) || impulse < minImp) continue;
        lastBurst = f;
        const count = Math.min(isCar ? 14 : 8, Math.floor((isCar ? 5 : 3) + (impulse - minImp) * 0.55));
        const seed = f * 37 + i * 13;
        for (let k = 0; k < count; k++) {
          const s = seed + k * 7.3;
          const a = hash(s) * Math.PI * 2;
          const spread = 1.8 + hash(s + 1.9) * 3.8;
          const up = 1.2 + hash(s + 3.7) * 3.2;
          list.push({
            t0: f - 0.5 + hash(s + 5.1) * 0.6,
            life: 0.18 + hash(s + 8.3) * 0.22,
            origin: [P1[0], P1[1] + 0.04, P1[2]],
            vel: [
              v2x * 0.48 + dvx * 0.22 + Math.cos(a) * spread,
              Math.max(0.5, v2y * 0.35 + up),
              v2z * 0.48 + dvz * 0.22 + Math.sin(a) * spread,
            ],
            hot: k % 3 === 0 ? 1 : 0,
          });
        }
      }
    }
    list.sort((a, b) => a.t0 - b.t0);
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: "#fff5d6",
      emissive: "#ff8814",
      emissiveIntensity: 3.4,
      roughness: 0.2,
      toneMapped: false,
    });
    const inst = new THREE.InstancedMesh(geo, mat, MAX);
    inst.frustumCulled = false;
    const warm = new THREE.Color("#ff9922");
    const whiteHot = new THREE.Color("#fff7df");
    for (let k = 0; k < MAX; k++) inst.setColorAt(k, k % 3 === 0 ? whiteHot : warm);
    return { mesh: inst, sparks: list, geo, mat };
  }, [race, isCar, MAX]);

  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  const update = (simT: number) => {
    const fps = race.fps;
    const minT0 = simT - 0.45 * fps;
    let lo = 0;
    let hi = sparks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sparks[mid].t0 < minT0) lo = mid + 1;
      else hi = mid;
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const zero = new THREE.Vector3(0, 0, 0);
    const DRAG = 3.2;
    const G = 9.8;
    let count = 0;
    for (let idx = lo; idx < sparks.length && count < MAX; idx++) {
      const sp = sparks[idx];
      if (sp.t0 > simT) break;
      const age = (simT - sp.t0) / fps;
      if (age <= 0 || age >= sp.life) continue;
      const decay = Math.exp(-DRAG * age);
      const ex = (1 - decay) / DRAG;
      pos.set(
        sp.origin[0] + sp.vel[0] * ex,
        sp.origin[1] + sp.vel[1] * ex - (G / DRAG) * (age - ex),
        sp.origin[2] + sp.vel[2] * ex,
      );
      dir.set(sp.vel[0] * decay, sp.vel[1] * decay - (G / DRAG) * (1 - decay), sp.vel[2] * decay);
      const spd = dir.length();
      if (spd > 0.001) q.setFromUnitVectors(up, dir.divideScalar(spd));
      else q.identity();
      const fade = 1 - age / sp.life;
      const r = 0.015 * (0.4 + 0.6 * fade);
      const len = Math.min(0.32, (0.06 + spd * 0.014) * fade);
      sc.set(r, len, r);
      mesh.setMatrixAt(count++, m.compose(pos, q, sc));
    }
    mesh.visible = count > 0;
    if (mesh.visible) {
      for (let k = count; k < MAX; k++) mesh.setMatrixAt(k, m.compose(zero, q, zero));
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  update(t);
  useEffect(() => sub.subscribe((vf) => update(view.tAt(vf))), [sub, view, race, mesh]);
  return <primitive object={mesh} />;
}

/** Confetti over the finish line when the winner crosses; closed-form, so any frame is direct. */
export function Confetti({ race, t }: { race: Race; t: number }) {
  const view = useView(race);
  const sub = useSubframe();
  const { mesh, pieces, origin } = useMemo(() => {
    const samples = race.data.samples as unknown as Sample[];
    const uF = (race.data.info as { finish?: number }).finish ?? race.L;
    const s = samples[Math.min(samples.length - 1, Math.max(0, Math.round((uF - samples[0].u) / 0.5)))];
    const geo = new THREE.PlaneGeometry(0.14, 0.08);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.4, metalness: 0.4 });
    const mesh = new THREE.InstancedMesh(geo, mat, 300);
    mesh.frustumCulled = false;
    const colors = LANES.map((c) => new THREE.Color(c));
    const pieces = Array.from({ length: 300 }, (_, k) => {
      const a = hash(k * 3.1) * Math.PI * 2;
      const out = 1.5 + hash(k * 7.7) * 4;
      mesh.setColorAt(k, colors[k % colors.length]);
      return {
        v: new THREE.Vector3(Math.cos(a) * out, 6 + hash(k * 5.3) * 6, Math.sin(a) * out),
        spin: new THREE.Vector3(hash(k) * 12 - 6, hash(k + 9) * 12 - 6, hash(k + 17) * 12 - 6),
        delay: hash(k * 11.3) * 0.25,
      };
    });
    return { mesh, pieces, origin: new THREE.Vector3(...pointInFrame(s, 0, TRACK_DEPTH + 1.3)) };
  }, [race]);

  const update = (simT: number) => {
    const age = (simT - race.winnerFrame) / race.fps;
    mesh.visible = age > 0 && age < 6;
    if (!mesh.visible) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const DRAG = 1.6;
    const G = 4.5;
    pieces.forEach((p, k) => {
      const tt = Math.max(0, age - p.delay);
      const ex = (1 - Math.exp(-DRAG * tt)) / DRAG;
      const pos = origin.clone().addScaledVector(p.v, ex).add(new THREE.Vector3(0, (-G / DRAG) * (tt - ex), 0));
      q.setFromEuler(e.set(p.spin.x * tt, p.spin.y * tt, p.spin.z * tt));
      sc.setScalar(tt > 0 ? 1 : 0);
      mesh.setMatrixAt(k, m.compose(pos, q, sc));
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  update(t);
  useEffect(() => sub.subscribe((vf) => update(view.tAt(vf))), [sub, view, race, mesh]);
  return <primitive object={mesh} />;
}
