import { useEffect, useMemo, useRef } from "react";
import { useSubframe } from "./subframe";
import * as THREE from "three";
import { useView } from "./view";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { liftCleatPose, pointInFrame, TRACK, TRACK_DEPTH, troughProfile } from "./trackMesh.js";
import type { Race, Vec3 } from "./race";
import { isNight } from "./look";

// The small things that make the track read as a real object: rounded rims,
// joints every few units with a collar and hex bolts, saddle clamps where the
// pillars hold the trough, and bolted base plates on the floor. Render-only;
// built from the same samples as the physics.

type Sample = { u: number; p: Vec3; t: Vec3; r: Vec3; n: Vec3; curv: number; w?: number; gap?: boolean };
type Profile = { inner: [number, number, number][]; outer: [number, number][] };

const JOINT_SPACING = 4;
const HALF = TRACK.width / 2;

const v = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);

/** Track frame interpolated at any u. */
function frameAt(samples: Sample[], u: number): Sample {
  const x = Math.max(0, Math.min(samples.length - 1.001, (u - samples[0].u) / 0.5));
  const k = Math.floor(x);
  const a = x - k;
  const A = samples[k];
  const B = samples[k + 1];
  const mix = (p: Vec3, q: Vec3) => p.map((c, j) => c + (q[j] - c) * a) as Vec3;
  const unit = (p: Vec3) => {
    const l = Math.hypot(...p) || 1;
    return p.map((c) => c / l) as Vec3;
  };
  const wA = A.w ?? HALF;
  const wB = B.w ?? HALF;
  return { u, p: mix(A.p, B.p), t: unit(mix(A.t, B.t)), r: unit(mix(A.r, B.r)), n: unit(mix(A.n, B.n)), curv: A.curv, w: wA + (wB - wA) * a };
}

/** Sweeps a closed or open 2D ring (lateral, up) along the track from u0 to u1. */
export function sweep(
  samples: Sample[],
  ringIn: [number, number][] | ((w: number) => [number, number][]),
  u0: number,
  u1: number,
  step = 0.25,
  closed = false,
) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ringAt = (w: number) => (typeof ringIn === "function" ? ringIn(w) : ringIn);
  const n = ringAt(HALF).length;
  let rows = 0;
  // Gap samples (a vortex bowl): rows there get no quads, like the track mesh.
  const gapAt = (u: number) => !!samples[Math.max(0, Math.min(samples.length - 1, Math.round((u - samples[0].u) / (samples[1].u - samples[0].u))))].gap;
  const rowGap: boolean[] = [];
  for (let u = u0; u <= u1 + 1e-6; u += step) {
    const s = frameAt(samples, u);
    ringAt(s.w ?? HALF).forEach(([l, h], j) => {
      pos.push(...pointInFrame(s, l, h));
      uv.push(u, j / (n - 1));
    });
    rowGap.push(gapAt(u));
    rows++;
  }
  const w = closed ? n : n - 1;
  for (let r = 0; r < rows - 1; r++)
    for (let j = 0; j < w; j++) {
      if (rowGap[r] && rowGap[r + 1]) continue;
      const a = r * n + j;
      const b = r * n + ((j + 1) % n);
      idx.push(a, a + n, b, b, a + n, b + n);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A hex bolt head on a washer, standing on +y. */
export function boltGeometry() {
  const washer = new THREE.CylinderGeometry(0.05, 0.05, 0.007, 24);
  washer.translate(0, 0.0035, 0);
  const head = new THREE.CylinderGeometry(0.031, 0.031, 0.022, 6);
  head.translate(0, 0.007 + 0.011, 0);
  const top = new THREE.SphereGeometry(0.031, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  top.scale(1, 0.25, 1);
  top.translate(0, 0.029, 0);
  return mergeGeometries([washer.toNonIndexed(), head.toNonIndexed(), top.toNonIndexed()])!;
}

/** Instanced placement helper: position + "up" (the bolt's axis). */
function placeAll(mesh: THREE.InstancedMesh, items: { pos: THREE.Vector3; up: THREE.Vector3; spin?: number }[]) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    q.setFromUnitVectors(yAxis, it.up.clone().normalize());
    if (it.spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, it.spin));
    m.compose(it.pos, q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

/** Offsets a profile point outward along its local normal. */
function outward(points: [number, number][], i: number, d: number): [number, number] {
  const a = points[Math.max(0, i - 1)];
  const b = points[Math.min(points.length - 1, i + 1)];
  const tx = b[0] - a[0];
  const ty = b[1] - a[1];
  const l = Math.hypot(tx, ty) || 1;
  // Outer profile runs left → right along the outside, so its outward normal is (ty, -tx).
  return [points[i][0] + (ty / l) * d, points[i][1] + (-tx / l) * d];
}

export function TrackDetails({ race }: { race: Race }) {
  const built = useMemo(() => {
    const samples = race.data.samples as unknown as Sample[];
    const { outer } = troughProfile(18) as Profile;
    const uStart = samples[0].u;
    const uEnd = samples[samples.length - 1].u;
    const W = TRACK.wall;

    // Rounded rims: a tube along each lip.
    const tube = (side: number) => (w: number): [number, number][] =>
      Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * Math.PI * 2;
        const r = W / 2 + 0.014;
        return [side * (w + W / 2) + Math.cos(a) * r, TRACK_DEPTH + Math.sin(a) * r];
      });
    const rims = mergeGeometries([sweep(samples, tube(-1), uStart, uEnd, 0.25, true), sweep(samples, tube(1), uStart, uEnd, 0.25, true)])!;

    // Joints: a collar around the outside and a fine seam inside.
    const joints: number[] = [];
    const gapNear = (u: number) => samples.some((q) => q.gap && Math.abs(q.u - u) < 1.5);
    for (let u = uStart + 1; u < uEnd - 0.5; u += JOINT_SPACING) if (!gapNear(u)) joints.push(u);
    const profileAt = (w: number) => troughProfile(18, w) as unknown as Profile;
    const collarRing = (w: number) => {
      const o = profileAt(w).outer;
      return o.map((_, i) => outward(o, i, 0.014));
    };
    const collars = mergeGeometries(joints.map((u) => sweep(samples, collarRing, u - 0.06, u + 0.06, 0.06)))!;
    const seamRing = (w: number) => profileAt(w).inner.map(([l, h]) => [l * 0.999, h + 0.004] as [number, number]);
    const seams = mergeGeometries(joints.map((u) => sweep(samples, seamRing, u - 0.008, u + 0.008, 0.008)))!;

    // Bolts on each collar (down the sides and underneath) and screws on the rim tops.
    const boltIdx = [2, 5, 9, Math.floor(outer.length / 2), outer.length - 10, outer.length - 6, outer.length - 3];
    const bolts: { pos: THREE.Vector3; up: THREE.Vector3; spin: number }[] = [];
    joints.forEach((u, j) => {
      const s = frameAt(samples, u);
      const outer = profileAt(s.w ?? HALF).outer;
      for (const i of boltIdx) {
        const [l, h] = outward(outer, i, 0.028);
        const [l2, h2] = outward(outer, i, 0.2);
        const p = v(pointInFrame(s, l, h));
        const dir = v(pointInFrame(s, l2, h2)).sub(p);
        bolts.push({ pos: p, up: dir, spin: (j * 1.7 + i) % 1.05 });
      }
      for (const side of [-1, 1]) {
        const p = v(pointInFrame(s, side * ((s.w ?? HALF) + W / 2), TRACK_DEPTH + W / 2 + 0.012));
        bolts.push({ pos: p, up: v(s.n), spin: (j * 0.9 + side) % 1.05 });
      }
    });

    // Pillars, saddle clamps and base plates, wherever no other track runs below.
    const minY = Math.min(...samples.map((s) => s.p[1]));
    const groundY = minY - 1.4;
    const elevators = ((race.data as unknown as { elevators?: { center: Vec3; width: number; length: number }[] }).elevators ?? []);
    const pillars: { top: THREE.Vector3; h: number; sleeveH: number; s: Sample }[] = [];
    for (let k = 0; k < samples.length; k += 14) {
      const s = samples[k];
      if (gapNear(s.u)) continue;
      const bottom = v(pointInFrame(s, 0, -TRACK.wall - 0.14));
      const h = bottom.y - groundY;
      if (h < 0.5) continue;
      const sw = s.w ?? HALF;
      const blocked =
        samples.some(
          (q) => Math.abs(q.u - s.u) > 6 && q.p[1] < s.p[1] && Math.hypot(q.p[0] - s.p[0], q.p[2] - s.p[2]) < Math.max(HALF, q.w ?? HALF) + sw * 0.35 + 1.2,
        ) ||
        elevators.some((ev) => Math.hypot(ev.center[0] - s.p[0], ev.center[2] - s.p[2]) < Math.max(ev.width, ev.length) + 2.2);
      if (!blocked) pillars.push({ top: bottom, h, sleeveH: Math.max(0.25, Math.min(1.65, h * 0.45)), s });
    }
    const bottomArc = outer.slice(Math.floor(outer.length / 2) - 6, Math.floor(outer.length / 2) + 7).map((_, i, arr) => {
      const idx = Math.floor(outer.length / 2) - 6 + i;
      void arr;
      return outward(outer, idx, 0.02);
    });
    const saddles = mergeGeometries(pillars.map((p) => sweep(samples, bottomArc, p.s.u - 0.09, p.s.u + 0.09, 0.09)))!;
    const night = isNight();
    const plateBolts: { pos: THREE.Vector3; up: THREE.Vector3; spin: number }[] = [];
    if (!night) {
      pillars.forEach((p, k) => {
        for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]])
          plateBolts.push({ pos: new THREE.Vector3(p.top.x + dx, groundY + 0.04, p.top.z + dz), up: new THREE.Vector3(0, 1, 0), spin: k * 0.37 });
      });
    }

    const steel = new THREE.MeshStandardMaterial({
      color: night ? "#343944" : "#c9ccd2",
      metalness: night ? 0.85 : 1,
      roughness: 0.32,
      envMapIntensity: night ? 0.4 : 1,
    });
    const boltMesh = new THREE.InstancedMesh(boltGeometry(), steel, bolts.length + plateBolts.length);
    placeAll(boltMesh, [...bolts, ...plateBolts]);
    const pillarMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.105, 0.105, 1, 32),
      new THREE.MeshStandardMaterial({
        color: night ? "#2a2e37" : "#dfe2e8",
        metalness: night ? 0.85 : 1,
        roughness: night ? 0.32 : 0.16,
        envMapIntensity: night ? 0.42 : 1,
      }),
      pillars.length,
    );
    const sleeveMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.15, 0.165, 1, 32),
      new THREE.MeshStandardMaterial({
        color: night ? "#1e2128" : "#9aa0ac",
        metalness: 0.85,
        roughness: night ? 0.36 : 0.24,
        envMapIntensity: night ? 0.38 : 1,
      }),
      pillars.length,
    );
    const blockMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.38, 0.14, 0.38),
      new THREE.MeshPhysicalMaterial({
        color: night ? "#252830" : "#f2f3f6",
        roughness: 0.32,
        clearcoat: 0.6,
        envMapIntensity: night ? 0.42 : 1,
      }),
      pillars.length,
    );
    const plateMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.56, 0.04, 0.56),
      new THREE.MeshStandardMaterial({
        color: night ? "#22252c" : "#b9bdc6",
        metalness: 0.85,
        roughness: 0.38,
        envMapIntensity: night ? 0.38 : 1,
      }),
      pillars.length,
    );
    const m = new THREE.Matrix4();
    pillars.forEach((p, i) => {
      const yaw = Math.atan2(p.s.t[0], p.s.t[2]);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      pillarMesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.top.x, groundY + p.h / 2, p.top.z), new THREE.Quaternion(), new THREE.Vector3(1, p.h, 1)));
      sleeveMesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.top.x, groundY + p.sleeveH / 2, p.top.z), new THREE.Quaternion(), new THREE.Vector3(1, p.sleeveH, 1)));
      blockMesh.setMatrixAt(i, m.compose(p.top.clone().add(new THREE.Vector3(0, 0.06, 0)), q, new THREE.Vector3(1, 1, 1)));
      plateMesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.top.x, groundY + 0.02, p.top.z), q, new THREE.Vector3(1, 1, 1)));
    });
    for (const mesh of [pillarMesh, sleeveMesh, blockMesh, plateMesh]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
    }

    // Height-adjustment collars (knurled) at the top of each pillar just beneath the saddle block.
    const collarGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.22, 36, 1);
    const knurl = canvasStripes();
    const collarMesh = new THREE.InstancedMesh(
      collarGeo,
      new THREE.MeshStandardMaterial({
        color: night ? "#4a4335" : "#d4af37",
        metalness: 0.92,
        roughness: 0.32,
        bumpMap: knurl,
        bumpScale: 0.6,
        envMapIntensity: night ? 0.45 : 1,
      }),
      pillars.length,
    );
    // Gaffer-tape marks on the floor around each pillar foot, the way a real set is laid out.
    const tapeMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 0.075), new THREE.MeshStandardMaterial({ color: "#2b2d33", roughness: 0.85 }), pillars.length * 2);
    pillars.forEach((p, i) => {
      const yaw = Math.atan2(p.s.t[0], p.s.t[2]);
      collarMesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.top.x, p.top.y - 0.24, p.top.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
      for (let k = 0; k < 2; k++) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw + Math.PI / 4 + (k * Math.PI) / 2 + (i % 5) * 0.05));
        const off = new THREE.Vector3(Math.sin(yaw + 0.9) * 0.36, 0, Math.cos(yaw + 0.9) * 0.36);
        tapeMesh.setMatrixAt(i * 2 + k, m.compose(new THREE.Vector3(p.top.x + off.x, groundY + 0.003, p.top.z + off.z), q, new THREE.Vector3(1, 1, 1)));
      }
    });
    collarMesh.castShadow = true;
    collarMesh.instanceMatrix.needsUpdate = true;
    tapeMesh.receiveShadow = true;
    tapeMesh.instanceMatrix.needsUpdate = true;

    return { rims, collars, seams, saddles, boltMesh, pillarMesh, sleeveMesh, blockMesh, plateMesh, collarMesh, tapeMesh };
  }, [race]);

  return (
    <>
      <mesh geometry={built.rims} castShadow receiveShadow>
        {isNight() ? <meshStandardMaterial color="#d6d9df" metalness={1} roughness={0.18} /> : <meshPhysicalMaterial color="#ffffff" roughness={0.18} clearcoat={1} clearcoatRoughness={0.05} />}
      </mesh>
      <mesh geometry={built.collars} castShadow receiveShadow>
        <meshPhysicalMaterial color="#eceef2" roughness={0.3} clearcoat={0.7} />
      </mesh>
      <mesh geometry={built.seams}>
        <meshStandardMaterial color="#b4b9c3" roughness={0.6} />
      </mesh>
      <mesh geometry={built.saddles} castShadow receiveShadow>
        <meshStandardMaterial color={isNight() ? "#2c3038" : "#d6d9df"} metalness={isNight() ? 0.85 : 1} roughness={isNight() ? 0.32 : 0.22} envMapIntensity={isNight() ? 0.42 : 1} />
      </mesh>
      <primitive object={built.boltMesh} />
      <primitive object={built.pillarMesh} />
      <primitive object={built.sleeveMesh} />
      <primitive object={built.blockMesh} />
      <primitive object={built.plateMesh} />
      <primitive object={built.collarMesh} />
      <primitive object={built.tapeMesh} />
    </>
  );
}

/** Fine vertical stripes, used as a bump map for knurling. */
function canvasStripes() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 16;
  const g = c.getContext("2d")!;
  for (let x = 0; x < 256; x += 4) {
    g.fillStyle = x % 8 ? "#000" : "#fff";
    g.fillRect(x, 0, 4, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Timing gate at the finish: emitter boxes on both rims and a faint red beam across. */
export function TimingGate({ race }: { race: Race }) {
  const samples = race.data.samples as unknown as Sample[];
  const s = frameAt(samples, (race.data.info as { finish?: number }).finish ?? race.L);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(s.t), v(s.n), v(s.r)));
  const W = HALF + TRACK.wall / 2;
  const h = TRACK_DEPTH + 0.12;
  return (
    <group position={s.p} quaternion={q}>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, h, side * W]}>
          <mesh castShadow>
            <boxGeometry args={[0.16, 0.2, 0.14]} />
            <meshStandardMaterial color="#1b1c21" roughness={0.4} />
          </mesh>
          <mesh position={[0.05, 0.06, -side * 0.071]}>
            <circleGeometry args={[0.018, 16]} />
            <meshStandardMaterial color="#ff2a2a" emissive="#ff0000" emissiveIntensity={6} toneMapped={false} />
          </mesh>
          <mesh position={[-0.03, -0.04, -side * 0.071]} rotation-y={side > 0 ? Math.PI : 0}>
            <circleGeometry args={[0.03, 24]} />
            <meshStandardMaterial color="#0d0e12" metalness={0.5} roughness={0.1} />
          </mesh>
        </group>
      ))}
      {/* The beam itself: barely visible, as in a hazy studio. */}
      <mesh position={[0, h - 0.04, 0]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.006, 0.006, 2 * W, 8]} />
        <meshBasicMaterial color="#ff3030" transparent opacity={0.45} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * Printed branding on the outside of the trough, like real track pieces: the
 * series logo with a rainbow bar, alternating with the circuit name. Each decal
 * is a strip that follows the shell's curve.
 */
export function Decals({ race }: { race: Race }) {
  const built = useMemo(() => {
    const samples = race.data.samples as unknown as Sample[];
    const { outer } = troughProfile(18) as Profile;
    const label = (text: string, sub: string) => {
      const c = document.createElement("canvas");
      c.width = 1024;
      c.height = 256;
      const g = c.getContext("2d")!;
      g.clearRect(0, 0, 1024, 256);
      g.fillStyle = isNight() ? "#f0f3fa" : "#16171c";
      g.font = "900 120px 'Avenir Next', system-ui, sans-serif";
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillText(text, 40, 104);
      const lanes = ["#c13fd6", "#e8414a", "#f7862c", "#f5c824", "#43c25a", "#2bc0d6", "#3c6fe0", "#7a4ee0"];
      lanes.forEach((col, k) => {
        g.fillStyle = col;
        g.fillRect(44 + k * 52, 176, 48, 14);
      });
      g.fillStyle = isNight() ? "#b8c0d0" : "#5b606e";
      g.font = "700 40px 'Avenir Next', system-ui, sans-serif";
      g.fillText(sub, 480, 186);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 16;
      return t;
    };
    const logo = label("MFC 2027", "MARBLE FORMULA CHAMPIONSHIP");
    const place = label(race.data.info.location.toUpperCase(), race.data.info.circuit.toUpperCase().slice(0, 28));
    const strips: { geo: THREE.BufferGeometry; tex: THREE.Texture }[] = [];
    const sideBand = (side: number) => {
      // A band on the upper outside of the shell, slightly proud of it.
      const idx = side < 0 ? [2, 3, 4, 5, 6] : [outer.length - 7, outer.length - 6, outer.length - 5, outer.length - 4, outer.length - 3];
      const ring = idx.map((i) => outward(outer, i, 0.006));
      return side < 0 ? ring : ring.reverse();
    };
    let k = 0;
    for (let u = 22; u < race.L - 6; u += 14, k++) {
      if (samples.some((q) => (q as { gap?: boolean }).gap && Math.abs(q.u - u) < 4)) continue;
      for (const side of [-1, 1]) {
        const g = sweep(samples, sideBand(side), u, u + 3.6, 0.12);
        // Re-map u along the strip to 0..1 (flipped on the right so text reads from outside).
        const uv = g.getAttribute("uv") as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
          const x = (uv.getX(i) - u) / 3.6;
          uv.setXY(i, side < 0 ? 1 - x : x, uv.getY(i));
        }
        strips.push({ geo: g, tex: k % 2 ? place : logo });
      }
    }
    return strips;
  }, [race]);
  return (
    <>
      {built.map((d, i) => (
        <mesh key={i} geometry={d.geo} renderOrder={2}>
          <meshStandardMaterial map={d.tex} transparent roughness={0.4} polygonOffset polygonOffsetFactor={-2} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

type Lift = { u0: number; len: number; lead: number; speed: number; spacing: number; count: number; half: number };

/** A spur gear: a disc with square-ish teeth, as an extruded shape lying in XY. */
function gearGeometry(r: number, teeth: number, depth: number) {
  const shape = new THREE.Shape();
  const steps = teeth * 4;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = i % 4 < 2 ? r : r * 0.86;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.22, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/**
 * The chain lift: a ribbed rubber belt up the ramp moving with the cleats,
 * the yellow cleats themselves (same kinematics as the physics), toothed
 * gears turning at both ends, and a motor housing at the top.
 */
export function Lifts({ race, t }: { race: Race; t: number }) {
  const view = useView(race);
  const sub = useSubframe();
  const lifts = (race.data.lifts ?? []) as unknown as Lift[];
  const samples = race.data.samples as unknown as Sample[];
  const built = useMemo(() => {
    const belt = new THREE.CanvasTexture(
      (() => {
        const c = document.createElement("canvas");
        c.width = 256;
        c.height = 64;
        const g = c.getContext("2d")!;
        g.fillStyle = "#24262c";
        g.fillRect(0, 0, 256, 64);
        for (let x = 0; x < 256; x += 32) {
          g.fillStyle = "#33363e";
          g.fillRect(x, 0, 10, 64);
          g.fillStyle = "#1a1b20";
          g.fillRect(x + 10, 0, 3, 64);
        }
        return c;
      })(),
    );
    belt.colorSpace = THREE.SRGBColorSpace;
    belt.wrapS = belt.wrapT = THREE.RepeatWrapping;
    belt.anisotropy = 16;
    return {
      belt,
      gear: gearGeometry(0.42, 18, 0.08),
      parts: lifts.map((lift) => {
        const beltGeo = sweep(samples, [[-(lift.half - 0.02), 0.03], [lift.half - 0.02, 0.03]], lift.u0 - lift.lead - 0.3, lift.u0 + lift.len + 0.3, 0.1);
        return { beltGeo };
      }),
    };
  }, [race]);

  const sec = t / race.fps;
  // uv.x runs in track units along the belt: 1 unit = one texture repeat.
  built.belt.repeat.set(1, 1);
  built.belt.offset.set(-((lifts[0]?.speed ?? 0) * sec), 0);
  const fAt = (u: number) => frameAt(samples, u);
  const cleatRefs = useRef<(THREE.Group | null)[]>([]);
  const gearRefs = useRef<(THREE.Mesh | null)[]>([]);
  useEffect(
    () =>
      sub.subscribe((vf) => {
        const s = view.tAt(vf) / race.fps;
        built.belt.offset.set(-((lifts[0]?.speed ?? 0) * s), 0);
        lifts.forEach((lift, li) => {
          for (let k = 0; k < lift.count; k++) {
            const g = cleatRefs.current[li * 100 + k];
            if (!g) continue;
            const pose = liftCleatPose(lift, k, s, fAt);
            g.visible = pose.visible;
            g.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
            g.quaternion.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3]);
          }
          gearRefs.current.forEach((gear, gi) => {
            if (gear && Math.floor(gi / 4) === li) gear.rotation.z = -(lift.speed * s) / 0.42;
          });
        });
      }),
    [sub, view, race, built],
  );
  return (
    <>
      {lifts.map((lift, li) => {
        const ends = [lift.u0 - lift.lead, lift.u0 + lift.len];
        return (
          <group key={li}>
            <mesh geometry={built.parts[li].beltGeo} receiveShadow>
              <meshStandardMaterial map={built.belt} roughness={0.85} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-4} />
            </mesh>
            {Array.from({ length: lift.count }, (_, k) => {
              const pose = liftCleatPose(lift, k, sec, fAt);
              return (
                <group key={k} ref={(el) => void (cleatRefs.current[li * 100 + k] = el)} visible={pose.visible} position={pose.pos as Vec3} quaternion={pose.quat as [number, number, number, number]}>
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[0.12, 0.34, lift.half * 2]} />
                    <meshPhysicalMaterial color="#ffcc00" roughness={0.3} clearcoat={0.8} />
                  </mesh>
                  <mesh position={[0.065, 0.1, 0]}>
                    <boxGeometry args={[0.012, 0.1, lift.half * 2 - 0.04]} />
                    <meshStandardMaterial color="#15161b" roughness={0.7} />
                  </mesh>
                  <mesh position={[0, 0.18, 0]}>
                    <boxGeometry args={[0.13, 0.02, lift.half * 2 + 0.01]} />
                    <meshStandardMaterial color="#dfe2e8" metalness={1} roughness={0.2} />
                  </mesh>
                </group>
              );
            })}
            {/* Chrome side rails along the belt. */}
            {[-1, 1].map((side) => {
              const a = fAt(lift.u0 - lift.lead - 0.3);
              const b = fAt(lift.u0 + lift.len + 0.3);
              const pa = new THREE.Vector3(...pointInFrame(a, side * (lift.half - 0.05), 0.4));
              const pb = new THREE.Vector3(...pointInFrame(b, side * (lift.half - 0.05), 0.4));
              const mid = pa.clone().add(pb).multiplyScalar(0.5);
              const dir = pb.clone().sub(pa);
              const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
              return (
                <mesh key={`rail${side}`} position={mid} quaternion={q} castShadow>
                  <cylinderGeometry args={[0.035, 0.035, dir.length(), 16]} />
                  <meshStandardMaterial color="#dfe2e8" metalness={1} roughness={0.2} />
                </mesh>
              );
            })}
            {ends.map((u, e) =>
              [-1, 1].map((side) => {
                const s = fAt(u);
                const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(s.t), v(s.n), v(s.r)));
                const spin = (lift.speed * sec) / 0.42;
                return (
                  <group key={`${e}${side}`} position={pointInFrame(s, side * ((s.w ?? HALF) + TRACK.wall + 0.06), 0.25) as Vec3} quaternion={q}>
                    <mesh ref={(el) => void (gearRefs.current[li * 4 + e * 2 + (side > 0 ? 1 : 0)] = el)} geometry={built.gear} rotation-z={-spin} castShadow>
                      <meshStandardMaterial color="#c9ccd2" metalness={1} roughness={0.28} />
                    </mesh>
                    <mesh rotation-x={Math.PI / 2}>
                      <cylinderGeometry args={[0.07, 0.07, 0.16, 24]} />
                      <meshStandardMaterial color="#15161b" roughness={0.4} />
                    </mesh>
                  </group>
                );
              }),
            )}
            {/* Motor housing beside the top of the lift. */}
            {(() => {
              const s = fAt(lift.u0 + lift.len - 0.6);
              const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(s.t), v(s.n), v(s.r)));
              return (
                <group position={pointInFrame(s, (s.w ?? HALF) + TRACK.wall + 0.45, 0.1) as Vec3} quaternion={q}>
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[0.9, 0.55, 0.55]} />
                    <meshPhysicalMaterial color="#f2f3f6" roughness={0.3} clearcoat={0.8} />
                  </mesh>
                  <mesh position={[0, 0.28, 0]}>
                    <boxGeometry args={[0.92, 0.05, 0.57]} />
                    <meshStandardMaterial color="#ffcc00" roughness={0.35} />
                  </mesh>
                  <mesh position={[0.2, 0.05, 0.28]}>
                    <circleGeometry args={[0.03, 16]} />
                    <meshStandardMaterial color="#3cff6a" emissive="#20ff50" emissiveIntensity={5} toneMapped={false} />
                  </mesh>
                </group>
              );
            })()}
          </group>
        );
      })}
    </>
  );
}
