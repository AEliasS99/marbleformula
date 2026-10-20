import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { sweep } from "./Details";
import { TRACK, TRACK_DEPTH } from "./trackMesh.js";
import type { Race, Vec3 } from "./race";

// The night look's light show: LED strips along both walls, under the inside
// of the rim (they light the track and the marbles' paint) and along the
// outside (they draw the circuit in the dark). The colour runs through the
// rainbow along the lap, so every stretch has its own colour on camera.
type Sample = { u: number; p: Vec3; t: Vec3; r: Vec3; n: Vec3; curv: number; w?: number; gap?: boolean };

export function Neon({ race }: { race: Race }) {
  const geo = useMemo(() => {
    const samples = race.data.samples as unknown as Sample[];
    const u0 = samples[0].u;
    const u1 = samples[samples.length - 1].u;
    const W = TRACK.wall;
    const tube = (lat: (w: number) => number, h: number, r: number) => (w: number): [number, number][] =>
      Array.from({ length: 10 }, (_, k) => {
        const a = (k / 10) * Math.PI * 2;
        return [lat(w) + Math.cos(a) * r, h + Math.sin(a) * r];
      });
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      parts.push(sweep(samples, tube((w) => side * (w - 0.004), TRACK_DEPTH - 0.07, 0.022), u0, u1, 0.25, true));
      parts.push(sweep(samples, tube((w) => side * (w + W + 0.01), TRACK_DEPTH - 0.14, 0.03), u0, u1, 0.25, true));
    }
    const g = mergeGeometries(parts)!;
    // Colour by place along the lap (uv.x = u): a rainbow every 60 units.
    const uv = g.getAttribute("uv");
    const col = new Float32Array(uv.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < uv.count; i++) {
      const hue = (((uv.getX(i) / 60) % 1) + 1) % 1;
      c.setHSL(hue, 1, 0.55);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [race]);
  // Unlit and above 1: the bloom pass makes it glow.
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors color={new THREE.Color(9, 9, 9)} toneMapped={false} />
    </mesh>
  );
}

/**
 * The tubes on the tight bends: lit arches over the track every 1.2 units (the
 * marbles ride up the walls there, held in by high invisible guards).
 */
export function Hoops({ race }: { race: Race }) {
  const geo = useMemo(() => {
    const samples = race.data.samples as unknown as Sample[];
    const u0 = samples[0].u;
    const at = (u: number) => samples[Math.max(0, Math.min(samples.length - 1, Math.round((u - u0) / 0.5)))];
    const tubes = (race.data.features as { type: string; u: number; span: number[] }[]).filter((f) => f.type === "tube");
    const parts: THREE.BufferGeometry[] = [];
    for (const f of tubes)
      for (let u = f.u; u <= f.u + f.span[1]; u += 1.2) {
        const s = at(u);
        const W = (s.w ?? TRACK.width / 2) + TRACK.wall;
        const g = new THREE.TorusGeometry(W, 0.035, 8, 40, Math.PI);
        // The arch stands in the cross-section plane: x across the track, y up, centred on the wall tops.
        const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...s.r), new THREE.Vector3(...s.n), new THREE.Vector3(...s.t));
        g.applyMatrix4(basis);
        const c = new THREE.Vector3(...s.p).addScaledVector(new THREE.Vector3(...s.n), TRACK_DEPTH);
        g.translate(c.x, c.y, c.z);
        parts.push(g);
      }
    return parts.length ? mergeGeometries(parts) : null;
  }, [race]);
  if (!geo) return null;
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#dfe8ff" emissive="#7fe9ff" emissiveIntensity={3.5} metalness={0.6} roughness={0.3} toneMapped={false} />
    </mesh>
  );
}
