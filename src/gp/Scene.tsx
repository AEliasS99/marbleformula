import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { MeshReflectorMaterial } from "@react-three/drei";
import { continueRender, delayRender } from "remotion";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import skyExr from "@pmndrs/assets/hdri/sky.exr.js";
import { subframe } from "./subframe";
import { drawFlag, FLAGS } from "./flags";
import { buildTrackMesh, floorVRange, pointInFrame, pointOnTrack, TRACK, TRACK_DEPTH, troughProfile } from "./trackMesh.js";
import { fovFor, type Layout, type Race, type Vec3 } from "./race";
import { spinnerParts } from "./rotor.js";
import { turntableParts } from "./obstacles/turntable.js";
import { asphaltMaps, grassMaps, plasticMaps, wearChrome } from "./surfaces";
import { boltGeometry } from "./Details";

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
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const set = (vf: number) => {
    const shot = race.shotAt(vf);
    camera.fov = fovFor(shot.fov, layout);
    camera.near = 0.05;
    camera.far = 1500;
    camera.updateProjectionMatrix();
    camera.position.set(...shot.pos);
    camera.lookAt(...shot.target);
  };
  set(frame);
  useEffect(() => subframe.subscribe(set), [race, layout, camera]);
  return null;
}

/**
 * A photo studio built as a tiny scene and baked into the environment map:
 * dark grey walls, a big overhead softbox, two tall strip lights and a warm
 * kicker behind. Chrome reflects real black-and-white structure (that's what
 * makes it read as chrome), and the diffuse light it gives is directional
 * instead of flat.
 */
function studioScene() {
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
export function Environment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const advance = useThree((s) => s.advance);
  useMemo(() => {
    // Tone mapping happens once, at the end of the effect chain (src/gp/Effects.tsx).
    gl.toneMapping = THREE.NoToneMapping;
    const pmrem = new THREE.PMREMGenerator(gl);
    scene.environment = pmrem.fromScene(studioScene(), 0, 0.1, 200, { size: 512 }).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }, [gl, scene]);
  useEffect(() => {
    const handle = delayRender("Loading the studio HDRI");
    let cancelled = false;
    new EXRLoader()
      .loadAsync(skyExr)
      .then((tex) => {
        if (cancelled) return;
        const pmrem = new THREE.PMREMGenerator(gl);
        scene.environment = pmrem.fromEquirectangular(tex).texture;
        scene.environmentIntensity = 0.55; // less fill from the sky: the sun does the modelling
        tex.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = tex;
        scene.backgroundBlurriness = 0.015;
        scene.backgroundIntensity = 0.9;
        gl.toneMappingExposure = 0.9;
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
 * An overhead area light adds long soft highlights on glossy surfaces.
 */
export function Sun({ target }: { target: Vec3 }) {
  const sun = useMemo(() => {
    RectAreaLightUniformsLib.init();
    // Late-afternoon sun, low and warm: long shadows from posts, guards and marbles.
    const l = new THREE.DirectionalLight("#ffd9a6", 3.6);
    l.castShadow = true;
    l.shadow.mapSize.set(4096, 4096);
    l.shadow.bias = -0.00025;
    l.shadow.normalBias = 0.02;
    l.shadow.radius = 2;
    l.shadow.blurSamples = 12;
    Object.assign(l.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 120 });
    return l;
  }, []);
  const [x, y, z] = target;
  sun.position.set(x + 30, y + 21, z + 14); // ~32° above the horizon
  sun.target.position.set(x, y, z);
  sun.target.updateMatrixWorld();
  return (
    <>
      <primitive object={sun} />
      <primitive object={sun.target} />
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
  const built = useMemo(() => {
    const samples = race.data.samples as unknown as Sample[];
    const mesh = buildTrackMesh(densify(samples), { arcSteps: 18 });
    const L = race.L;
    const uFinish = (race.data.info as { finish?: number }).finish ?? L;
    const uEnd = samples[samples.length - 1].u;

    // A race track: asphalt across the flat floor with white edge lines, the
    // walls white. Texture x runs along the track (one repeat per 4 units,
    // with fine grain), y across it.
    const LT = 4096;
    const LA = 1024;
    const [fv0, fv1] = floorVRange();
    const lanes = canvasTexture(
      LA,
      LT,
      (g) => {
        g.fillStyle = "#f6f7f9";
        g.fillRect(0, 0, LA, LT);
        g.fillStyle = "#34363b";
        g.fillRect(0, fv0 * LT, LA, (fv1 - fv0) * LT);
        // Aggregate grain: speckles of lighter and darker stone.
        for (let i = 0; i < 140000; i++) {
          const x = hash(i * 1.7) * LA;
          const y = (fv0 + hash(i * 2.3) * (fv1 - fv0)) * LT;
          const v = 40 + hash(i * 3.1) * 60;
          g.fillStyle = `rgba(${v},${v},${v + 4},0.55)`;
          g.fillRect(x, y, 2 + hash(i) * 3, 2 + hash(i + 1) * 3);
        }
        // White edge lines, and a faint darker racing line worn into the middle.
        const edge = 0.028;
        g.fillStyle = "#f2f2f0";
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
    // Red-and-white kerbs on the inside of every proper corner.
    const kerbTex = canvasTexture(128, 32, (g) => {
      g.fillStyle = "#d8232a";
      g.fillRect(0, 0, 64, 32);
      g.fillStyle = "#f4f4f2";
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

    // Slim chrome pillars under the raised track, wherever no other track runs below.
    const minY = Math.min(...samples.map((s) => s.p[1]));
    const groundY = minY - 1.4;
    const pillars: { x: number; y: number; z: number; h: number }[] = [];
    for (let k = 0; k < samples.length; k += 8) {
      const s = samples[k];
      const bottom = pointInFrame(s, 0, -TRACK.wall);
      const h = bottom[1] - groundY;
      if (h < 0.4) continue;
      const blocked = samples.some(
        (q) => Math.abs(q.u - s.u) > 6 && q.p[1] < s.p[1] && Math.hypot(q.p[0] - s.p[0], q.p[2] - s.p[2]) < TRACK.width / 2 + 1.2,
      );
      if (!blocked) pillars.push({ x: bottom[0], y: groundY + h / 2, z: bottom[2], h });
    }
    const pillarMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.09, 0.09, 1, 24),
      new THREE.MeshStandardMaterial({ color: "#d9dce3", metalness: 0.9, roughness: 0.18 }),
      pillars.length,
    );
    pillars.forEach((p, i) =>
      pillarMesh.setMatrixAt(
        i,
        new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion(), new THREE.Vector3(1, p.h, 1)),
      ),
    );
    pillarMesh.castShadow = true;

    const xs = samples.map((s) => s.p[0]);
    const zs = samples.map((s) => s.p[2]);
    // Imperfection maps. Track UVs are (units along / 4, 0..1 across), so repeat to ~1 tile per unit.
    const plasticBase = plasticMaps();
    const plastic = { normal: plasticBase.normal.clone(), roughness: plasticBase.roughness.clone() };
    for (const t of [plastic.normal, plastic.roughness]) {
      t.repeat.set(3, 6); // fine grain: it should show only in the highlights
      t.needsUpdate = true;
    }
    const asphaltBase = asphaltMaps();
    const asphalt = { normal: asphaltBase.normal.clone(), roughness: asphaltBase.roughness.clone() };
    for (const t of [asphalt.normal, asphalt.roughness]) {
      t.repeat.set(1, 4);
      t.needsUpdate = true;
    }
    const grassBase = grassMaps();
    const floor = { color: grassBase.color.clone(), roughness: grassBase.roughness.clone(), normal: grassBase.normal.clone() };
    for (const t of [floor.color, floor.roughness, floor.normal]) {
      t.repeat.set(70, 70);
      t.needsUpdate = true;
    }
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
      startLine: bandGeometry(samples, -0.12, 0.12, null, null, 0.014),
      finishLine: bandGeometry(samples, uFinish - 0.3, uFinish + 0.3, null, null, 0.014),
      pillarMesh,
      groundY,
      center: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2] as [number, number],
    };
  }, [race]);

  const { geos } = built;
  return (
    <>
      <mesh geometry={geos.floor} receiveShadow castShadow>
        <meshStandardMaterial
          map={built.lanes}
          roughness={1}
          roughnessMap={built.asphalt.roughness}
          normalMap={built.asphalt.normal}
          normalScale={new THREE.Vector2(0.35, 0.35)}
          envMapIntensity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={built.dashes}>
        <meshStandardMaterial color="#f4f4f2" roughness={0.7} />
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
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh geometry={geos.shell} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#f4f5f8"
          roughness={1}
          roughnessMap={built.plastic.roughness}
          normalMap={built.plastic.normal}
          normalScale={new THREE.Vector2(0.04, 0.04)}
          clearcoat={0.4}
          envMapIntensity={0.8}
        />
      </mesh>
      <mesh geometry={geos.caps} castShadow>
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
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

      {/* Grass around the circuit. */}
      <mesh rotation-x={-Math.PI / 2} position={[built.center[0], built.groundY, built.center[1]]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        {/* A polished studio floor: a blurred planar reflection of the track grounds it in the room. */}
        <meshStandardMaterial map={built.floor.color} roughnessMap={built.floor.roughness} roughness={1} normalMap={built.floor.normal} normalScale={new THREE.Vector2(0.5, 0.5)} />
      </mesh>
    </>
  );
}

const chrome = { color: "#eceef3", metalness: 1, roughness: 0.07 } as const;
const BOLT = { geometry: null as THREE.BufferGeometry | null, material: new THREE.MeshStandardMaterial({ color: "#c9ccd2", metalness: 1, roughness: 0.3 }) };
/** A ring of bolts, in the local frame of the obstacle (y up). */
function BoltRing({ count, radius, y, phase = 0 }: { count: number; radius: number; y: number; phase?: number }) {
  BOLT.geometry ??= boltGeometry();
  return (
    <>
      {Array.from({ length: count }, (_, k) => {
        const a = phase + (k / count) * Math.PI * 2;
        return <mesh key={k} geometry={BOLT.geometry!} material={BOLT.material} position={[Math.cos(a) * radius, y, Math.sin(a) * radius]} rotation-y={a * 1.7} castShadow />;
      })}
    </>
  );
}
const scoreCache = new Map<number, THREE.Texture>();
/** Pinball-style score caps on the bumpers. */
function scoreTex(i: number) {
  const hit = scoreCache.get(i % 3);
  if (hit) return hit;
  const t = canvasTexture(256, 256, (g) => {
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
  scoreCache.set(i % 3, t);
  return t;
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
const gloss = { color: "#ffffff", roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 } as const;

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
function dqTexture() {
  return canvasTexture(512, 512, (g) => {
    g.fillStyle = "#d8232a";
    g.fillRect(0, 0, 512, 512);
    for (let x = 0; x < 512; x += 64) {
      g.fillStyle = (x / 64) % 2 ? "#ffffff" : "#1b1c20";
      g.fillRect(x, 0, 64, 40);
      g.fillRect(x + 32, 472, 64, 40);
    }
    g.fillStyle = "#ffffff";
    g.font = "900 300px 'Avenir Next', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("DQ", 256, 262);
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
    new THREE.Quaternion(...sw.quat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), sw.amp * Math.sin((2 * Math.PI * s) / sw.period + sw.phase)));
  useEffect(
    () =>
      subframe.subscribe((vf) => {
        const s = race.simAt(vf).t / race.fps;
        spinners.forEach((sp, i) => spinRefs.current[i]?.quaternion.copy(spinQuat(sp, s)));
        swings.forEach((sw, i) => swingRefs.current[i]?.quaternion.copy(swingQuat(sw, s)));
        turntables.forEach((tt, i) => ttRefs.current[i]?.quaternion.copy(ttQuat(tt, s)));
        pushers.forEach((p, i) => applyPusher(p, i, s));
      }),
    [race],
  );
  return (
    <>
      {statics.map((o, i) => {
        if (o.kind === "dq") {
          // Disqualification pad: a red plate flush with the floor at the wall's
          // foot, "DQ" on it, a red lamp on the wall top above it.
          const [len, , wid] = o.size!;
          const side = (o as unknown as { side: number }).side;
          return (
            <group key={i} position={o.pos} quaternion={o.quat}>
              <mesh position={[0, 0.02, 0]} receiveShadow>
                <boxGeometry args={[len, 0.03, wid]} />
                <meshStandardMaterial map={dqTex} emissive="#ff2030" emissiveMap={dqTex} emissiveIntensity={0.35} roughness={0.35} />
              </mesh>
              <mesh position={[0, 0.045, 0]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[len, wid]} />
                <meshStandardMaterial map={dqTex} transparent roughness={0.35} polygonOffset polygonOffsetFactor={-2} />
              </mesh>
              {/* A red panel on the wall above the pad, so the zone reads from any angle. */}
              <mesh position={[0, TRACK.wallHeight / 2, side * (wid / 2 + 0.04 - 0.012)]}>
                <boxGeometry args={[len + 0.1, TRACK.wallHeight - 0.08, 0.02]} />
                <meshStandardMaterial color="#d8232a" emissive="#ff2030" emissiveIntensity={0.25} roughness={0.4} />
              </mesh>
              {/* Lamp housing on the wall top, lens facing the track. */}
              <group position={[0, TRACK.wallHeight + 0.1, side * (wid / 2 + 0.04 + 0.08)]}>
                <mesh castShadow>
                  <boxGeometry args={[0.3, 0.2, 0.16]} />
                  <meshStandardMaterial color="#1b1c20" roughness={0.5} />
                </mesh>
                <mesh position={[0, 0, -side * 0.085]}>
                  <sphereGeometry args={[0.07, 24, 12]} />
                  <meshStandardMaterial color="#ff5560" emissive="#ff1f2f" emissiveIntensity={3} toneMapped={false} />
                </mesh>
              </group>
            </group>
          );
        }
        if (o.kind === "guard")
          return (
            <group key={i} position={o.pos} quaternion={o.quat}>
              <mesh castShadow={false} receiveShadow renderOrder={6}>
                <boxGeometry args={o.size} />
                {/* Plain clear acrylic: screen-space refraction shifted the stripes seen through it. */}
                {/* Barely there: low opacity and little reflection, so it never reads as a grey wall. */}
                <meshPhysicalMaterial color="#f4f8ff" transparent opacity={0.09} roughness={0.02} clearcoat={1} clearcoatRoughness={0.02} envMapIntensity={0.45} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
              <mesh position={[0, o.size![1] / 2, 0]} rotation-z={Math.PI / 2}>
                <cylinderGeometry args={[0.02, 0.02, o.size![0] + 0.02, 10]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
              {/* Chrome clips holding the panel to the wall top. */}
              {[-0.3, 0.3].map((k) => (
                <mesh key={k} position={[k * o.size![0], -o.size![1] / 2 + 0.08, 0]} castShadow>
                  <boxGeometry args={[0.12, 0.18, 0.11]} />
                  <meshStandardMaterial {...chrome} />
                </mesh>
              ))}
            </group>
          );
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
                  <BoltRing count={2} radius={0.0001} y={o.size![1] / 2 + 0.02} phase={0} />
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
                <meshStandardMaterial map={scoreTex(i)} transparent roughness={0.3} emissive="#ffffff" emissiveMap={scoreTex(i)} emissiveIntensity={0.6} />
              </mesh>
              <Flange radius={r + 0.09} y={-h / 2 + 0.13} />
              <BoltRing count={6} radius={r + 0.055} y={-h / 2 + 0.142} phase={0.3} />
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
            <BoltRing count={3} radius={r + 0.05} y={-h / 2 + 0.142} phase={i} />
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
            <BoltRing count={6} radius={0.2} y={sp.size[1] / 2 + 0.06} phase={0.4} />
          </group>
        );
      })}
      {/* Static base plates under the spinners (they don't turn). */}
      {spinners.map((sp, i) => (
        <group key={`sb${i}`} position={sp.pos} quaternion={sp.quat}>
          <Flange radius={0.36} y={-sp.size[1] / 2 + 0.01} />
          <BoltRing count={6} radius={0.3} y={-sp.size[1] / 2 + 0.02} phase={0.2} />
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
            <BoltRing count={6} radius={0.3} y={tt.thickness / 2 + 0.002} phase={0.1} />
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
                <BoltRing count={4} radius={0.55} y={0.43} phase={0.78} />
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
            {/* Bridge over the trough holding the pivot (the pivot sits off-centre: the hammer sweeps one half). */}
            <group position={sw.pos} quaternion={sw.quat}>
              <group position={[0, 0, -((sw as { lat?: number }).lat ?? 0)]}>
              <mesh position={[0, 0.22, 0]} castShadow>
                <boxGeometry args={[0.24, 0.2, 2 * W + 0.8]} />
                <meshPhysicalMaterial {...gloss} />
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
              </group>
              {/* Pivot bearing under the bridge. */}
              <mesh position={[0, 0.11, 0]}>
                <boxGeometry args={[0.18, 0.22, 0.18]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
              <mesh rotation-z={Math.PI / 2}>
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
            </group>
          </group>
        );
      })}
    </>
  );
}

/** Start gantry with the five pairs of red lights, and the finish arch. */
export function Gantries({ race, frame }: { race: Race; frame: number }) {
  const samples = race.data.samples as unknown as Sample[];
  const at = (u: number) => samples[Math.max(0, Math.min(samples.length - 1, Math.round((u - samples[0].u) / 0.5)))];
  const W = TRACK.width / 2 + TRACK.wall;
  const H = TRACK_DEPTH + 1.3;
  const lit = race.timeline.lights.filter((lf) => frame >= lf).length;
  const out = frame >= race.timeline.raceStart;

  const arch = (u: number, children: React.ReactNode) => {
    const s = at(u);
    const W = (s.w ?? TRACK.width / 2) + TRACK.wall;
    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...s.r).setY(0).normalize(),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(...s.t).setY(0).normalize(),
      ),
    );
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
          <meshPhysicalMaterial color="#ffffff" roughness={0.25} clearcoat={1} />
        </mesh>
        {children}
      </group>
    );
  };

  return (
    <>
      {arch(
        -0.15,
        [0, 1, 2, 3, 4].map((k) => (
          <group key={k} position={[(k - 2) * 0.5, H - 0.36, -0.16]}>
            <mesh>
              <boxGeometry args={[0.38, 0.64, 0.08]} />
              <meshStandardMaterial color="#111" roughness={0.4} />
            </mesh>
            {[0.14, -0.14].map((y) => (
              <mesh key={y} position={[0, y, -0.05]}>
                <sphereGeometry args={[0.1, 16, 12]} />
                <meshStandardMaterial
                  color={!out && k < lit ? "#ff1010" : "#3a0d0d"}
                  emissive={!out && k < lit ? "#ff0000" : "#000"}
                  emissiveIntensity={!out && k < lit ? 1.4 : 0}
                />
              </mesh>
            ))}
          </group>
        )),
      )}
      {arch(
        race.L,
        <mesh position={[0, H, -0.15]} rotation-y={Math.PI /* face the approaching marbles */}>
          <planeGeometry args={[2 * W + 0.4, 0.3]} />
          <meshStandardMaterial map={finishBanner()} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>,
      )}
    </>
  );
}

let banner: THREE.Texture | null = null;
function finishBanner() {
  if (banner) return banner;
  banner = canvasTexture(512, 64, (g) => {
    for (let x = 0; x < 64; x++)
      for (let y = 0; y < 8; y++) {
        g.fillStyle = (x + y) % 2 ? "#111" : "#fafafa";
        g.fillRect(x * 8, y * 8, 8, 8);
      }
    g.fillStyle = "#ffcc00";
    g.fillRect(150, 6, 212, 52);
    g.fillStyle = "#111";
    g.font = "900 40px 'Avenir Next', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("FINISH", 256, 34);
  });
  return banner;
}

/**
 * Start gate: a flap cut to the trough's U profile, hinged on a chrome bar along
 * its top edge. At lights out it swings forward and up, like a starting gate.
 */
export function Gate({ race, t }: { race: Race; t: number }) {
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
  const sec = t / race.fps;
  const angle = angleAt(sec);
  const swing = swingAt(sec);
  const flapRef = useRef<THREE.Group>(null);
  useEffect(() => subframe.subscribe((vf) => flapRef.current?.quaternion.copy(swingAt(race.simAt(vf).t / race.fps))), [race, gate]);
  const W = ((race.data.samples[0] as unknown as Sample).w ?? TRACK.width / 2) + TRACK.wall;
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
        {[-1, 1].map((e) => {
          const base = new THREE.Vector3(-0.35, -0.75, e * (W + 0.25));
          const attach = new THREE.Vector3(Math.sin(angle) * 1.0, -Math.cos(angle) * 1.0, e * (W - 0.02));
          const dir = attach.clone().sub(base);
          const len = dir.length();
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
          const body = Math.min(0.62, len * 0.6);
          return (
            <group key={e} position={base} quaternion={q}>
              <mesh position={[0, body / 2, 0]} castShadow>
                <cylinderGeometry args={[0.045, 0.045, body, 24]} />
                <meshStandardMaterial color="#1c1d22" roughness={0.35} metalness={0.4} />
              </mesh>
              <mesh position={[0, body + (len - body) / 2, 0]} castShadow>
                <cylinderGeometry args={[0.018, 0.018, len - body, 16]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
              {[0, len].map((y) => (
                <mesh key={y} position={[0, y, 0]} rotation-x={Math.PI / 2}>
                  <cylinderGeometry args={[0.04, 0.04, 0.05, 20]} />
                  <meshStandardMaterial {...chrome} />
                </mesh>
              ))}
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
 * Chrome marble wearing its country's flag: the flag wraps the equator as a
 * painted band (repeated twice around, so it reads from any side), with the
 * country code in a roundel at the seams, pinstripes in the flag's colours,
 * and a sunburst at each pole in its first colour. Paint is glossy and
 * non-metallic; everything else is mirror chrome.
 */
function marbleTextures(name: string, code: string) {
  // Twenty marbles: 2048×1024 each keeps the texture memory in check (a marble is 0.7 units across).
  const W = 2048;
  const H = 1024;
  const flag = (FLAGS as Record<string, { colors: readonly string[] }>)[code];
  const c1 = flag?.colors[0] ?? "#888";
  const c2 = flag?.colors[1] ?? "#444";
  const paint = (g: CanvasRenderingContext2D, metalMap: boolean) => {
    // Colour map: white under chrome (keeps the metal neutral), colour on paint.
    // Metal/rough map: G = roughness, B = metalness.
    const chrome = metalMap ? "rgb(0,8,255)" : "#ffffff";
    const paintTone = "rgb(0,80,30)";
    g.fillStyle = chrome;
    g.fillRect(0, 0, W, H);
    const bandY = H * 0.36;
    const bandH = H * 0.28;
    if (metalMap) {
      g.fillStyle = paintTone;
      g.fillRect(0, bandY, W, bandH);
    } else {
      // Two flags around the equator, each with a thin dark frame.
      for (let k = 0; k < 2; k++) {
        drawFlag(g, code, (W / 2) * k, bandY, W / 2, bandH);
        g.fillStyle = "rgba(0,0,0,0.3)";
        g.fillRect((W / 2) * k, bandY, 6, bandH);
        g.fillRect((W / 2) * k, bandY, W / 2, 5);
        g.fillRect((W / 2) * k, bandY + bandH - 5, W / 2, 5);
      }
      // Country code roundels at the seams.
      for (let k = 0; k < 2; k++) {
        const cx = (W / 2) * k + W / 4;
        g.fillStyle = "#111216";
        g.beginPath();
        g.arc(cx, H / 2, H * 0.085, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#ffffff";
        g.lineWidth = H * 0.008;
        g.stroke();
        g.fillStyle = "#ffffff";
        g.font = `900 ${H * 0.062}px 'Avenir Next', system-ui, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(code, cx, H / 2 + 2);
      }
    }
    g.fillStyle = metalMap ? paintTone : c1;
    g.fillRect(0, H * 0.27, W, H * 0.035);
    g.fillStyle = metalMap ? paintTone : c2;
    g.fillRect(0, H * 0.695, W, H * 0.035);
    g.fillStyle = metalMap ? paintTone : c1;
    for (let k = 0; k < 36; k++) {
      const x = (W / 36) * k;
      g.fillRect(x, 0, W / 108, H * 0.12);
      g.fillRect(x, H * 0.88, W / 108, H * 0.12);
    }
  };
  const map = canvasTexture(W, H, (g) => paint(g, false));
  const mr = canvasTexture(W, H, (g) => {
    paint(g, true);
    wearChrome(g, W, H, name.length * 7 + name.charCodeAt(0));
  });
  mr.colorSpace = THREE.NoColorSpace;
  return { map, mr };
}

export function Marbles({ race, t }: { race: Race; t: number }) {
  const tex = useMemo(() => race.marbles.map((m) => marbleTextures(m.name, (m as { flag?: string }).flag ?? "")), [race]);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useEffect(
    () =>
      subframe.subscribe((vf) => {
        const tt = race.simAt(vf).t;
        race.marbles.forEach((_, i) => {
          const m = refs.current[i];
          if (!m) return;
          const { pos, quat } = race.marblePose(i, tt);
          m.position.set(...pos);
          m.quaternion.set(...quat);
          m.visible = !race.dqBy(i, tt);
        });
      }),
    [race],
  );
  return (
    <>
      {race.marbles.map((_, i) => {
        const { pos, quat } = race.marblePose(i, t);
        return (
          <mesh key={i} ref={(el) => void (refs.current[i] = el)} position={pos} quaternion={quat} visible={!race.dqBy(i, t)} castShadow receiveShadow>
            <sphereGeometry args={[race.data.marbleRadius, 96, 64]} />
            <meshPhysicalMaterial
              map={tex[i].map}
              metalnessMap={tex[i].mr}
              roughnessMap={tex[i].mr}
              metalness={1}
              roughness={1}
              clearcoat={1}
              clearcoatRoughness={0.03}
              envMapIntensity={1.5}
            />
          </mesh>
        );
      })}
    </>
  );
}

/** Confetti over the finish line when the winner crosses; closed-form, so any frame is direct. */
export function Confetti({ race, t }: { race: Race; t: number }) {
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
  useEffect(() => subframe.subscribe((vf) => update(race.simAt(vf).t)), [race, mesh]);
  return <primitive object={mesh} />;
}
