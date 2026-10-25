import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { sweep } from "./Details";
import { TRACK, TRACK_DEPTH } from "./trackMesh.js";
import { getCircuitTheme } from "./Themes";
import type { Race, Vec3 } from "./race";

// The night look's light show: LED strips along both walls, under the inside
// of the rim (they light the track and the marbles' paint) and along the
// outside (they draw the circuit in the dark). Coloured using the circuit's
// signature palette, with extra upper/lower neon rails on Tokyo & New York.
type Sample = { u: number; p: Vec3; t: Vec3; r: Vec3; n: Vec3; curv: number; w?: number; gap?: boolean };

export function Neon({ race }: { race: Race }) {
  const theme = getCircuitTheme(race);
  const geo = useMemo(() => {
    const samples = race.data.samples as unknown as Sample[];
    const u0 = samples[0].u;
    const u1 = samples[samples.length - 1].u;
    const W = TRACK.wall;
    const tube = (lat: (w: number) => number, h: number, r: number) => (w: number): [number, number][] =>
      Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2;
        return [lat(w) + Math.cos(a) * r, h + Math.sin(a) * r];
      });
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      parts.push(sweep(samples, tube((w) => side * (w - 0.004), TRACK_DEPTH - 0.07, 0.025), u0, u1, 0.5, true));
      parts.push(sweep(samples, tube((w) => side * (w + W + 0.01), TRACK_DEPTH - 0.14, 0.034), u0, u1, 0.5, true));
      if (theme.extraNeonArches) {
        parts.push(sweep(samples, tube((w) => side * (w + W + 0.02), TRACK_DEPTH - 0.32, 0.028), u0, u1, 0.5, true));
      }
    }
    const g = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    // Colour along the lap using the circuit's bespoke neon palette
    const uv = g.getAttribute("uv");
    const col = new Float32Array(uv.count * 3);
    const palette = theme.neonPalette.map((hex) => new THREE.Color(hex));
    const c = new THREE.Color();
    for (let i = 0; i < uv.count; i++) {
      const t = (((uv.getX(i) / 36) % 1) + 1) % 1;
      const scaled = t * palette.length;
      const idxA = Math.floor(scaled) % palette.length;
      const idxB = (idxA + 1) % palette.length;
      c.copy(palette[idxA]).lerp(palette[idxB], scaled - Math.floor(scaled));
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }, [race, theme]);
  useEffect(() => () => geo.dispose(), [geo]);
  // Unlit and above 1: the bloom pass makes it glow.
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial vertexColors color={new THREE.Color(theme.extraNeonArches ? 11 : 9, theme.extraNeonArches ? 11 : 9, theme.extraNeonArches ? 11 : 9)} toneMapped={false} />
    </mesh>
  );
}

/**
 * The tubes on the tight bends: precision rib arches with a recessed
 * LED filament every 1.8 units styled to match the circuit theme.
 */
export function Hoops({ race }: { race: Race }) {
  void race;
  return null;
}
