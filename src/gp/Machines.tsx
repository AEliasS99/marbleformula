import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { subframe } from "./subframe";
import { TRACK } from "./trackMesh.js";
import { vortexFrame, vortexGeometry } from "./vortex.js";
import type { Race, Quat, Vec3 } from "./race";

// The machines that change the physics rather than just deflecting: the
// vortex bowl, the rollers and the fan. Geometry and timing come from the
// bake (src/gp/vortex.js, scripts/season.mjs rollerQuat/fanGust), so what
// moves on screen is what moved the marbles.

type Vortex = { u: number; center: Vec3; fwd: Vec3; radius: number; hole: number; depth: number; lip: number; throat: number; entryHalf: number };
type Roller = { pos: Vec3; quat: Quat; radius: number; length: number; omega: number; phase: number };
type Fan = { u0: number; u1: number; side: number; dir: Vec3; pos: Vec3; quat: Quat; accel: number; period: number; phase: number };

const chrome = { color: "#eceef3", metalness: 1, roughness: 0.07 } as const;
const steel = { color: "#dfe2e8", metalness: 1, roughness: 0.25 } as const;
const dark = { color: "#1b1c20", roughness: 0.5 } as const;

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] | null = null) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}
const toGeometry = (g: { position: number[]; index: number[]; uv: number[] }) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(g.position, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setIndex(g.index);
  geo.computeVertexNormals();
  return geo;
};

/** Hazard stripes (red/white) around the vortex lip, knurl for the rollers. */
const hazardTex = () =>
  canvasTexture(
    512,
    64,
    (g) => {
      for (let x = 0; x < 512; x += 64) {
        g.fillStyle = (x / 64) % 2 ? "#ffffff" : "#d8232a";
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 64, 0);
        g.lineTo(x + 40, 64);
        g.lineTo(x - 24, 64);
        g.closePath();
        g.fill();
      }
    },
    [24, 1],
  );
const knurlTex = () =>
  canvasTexture(
    256,
    64,
    (g) => {
      g.fillStyle = "#b9bec8";
      g.fillRect(0, 0, 256, 64);
      g.fillStyle = "#6d727c";
      for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 6, 64);
    },
    [1, 10],
  );

export function Machines({ race, t }: { race: Race; t: number }) {
  const data = race.data as unknown as { vortices?: Vortex[]; rollers?: Roller[]; fans?: Fan[]; samples: { p: Vec3 }[] };
  const vortices = data.vortices ?? [];
  const rollers = data.rollers ?? [];
  const fans = data.fans ?? [];
  const groundY = useMemo(() => Math.min(...data.samples.map((s) => s.p[1])) - 1.4, [data]);
  const tex = useMemo(() => ({ hazard: hazardTex(), knurl: knurlTex() }), []);
  const bowls = useMemo(
    () =>
      vortices.map((v) => {
        const parts = vortexGeometry(v, 160);
        return { cone: toGeometry(parts.cone), lip: toGeometry(parts.lip), rim: toGeometry(parts.rim), throat: toGeometry(parts.throat), stripe: toGeometry(parts.stripe), frame: vortexFrame(v) };
      }),
    [vortices],
  );

  const rollerRefs = useRef<(THREE.Group | null)[]>([]);
  const bladeRefs = useRef<(THREE.Group | null)[]>([]);
  const rollerQuat = (r: Roller, s: number) =>
    new THREE.Quaternion(...r.quat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r.phase + r.omega * s));
  const bladeAngle = (fan: Fan, s: number) => fan.phase * 3 + s * 14; // fast, a blur in the render
  useEffect(
    () =>
      subframe.subscribe((vf) => {
        const s = race.simAt(vf).t / race.fps;
        rollers.forEach((r, i) => rollerRefs.current[i]?.quaternion.copy(rollerQuat(r, s)));
        fans.forEach((fan, i) => {
          const g = bladeRefs.current[i];
          if (g) g.rotation.z = bladeAngle(fan, s);
        });
      }),
    [race],
  );
  const sec = t / race.fps;
  const W2 = TRACK.width / 2;

  return (
    <>
      {bowls.map((b, i) => {
        const v = vortices[i];
        return (
          <group key={`v${i}`}>
            {/* The funnel: glossy white inside and out, a chrome throat, hazard stripes on the lip wall and a chrome rim on top. */}
            {/* Clear acrylic: the swirl is the show, seen from outside too. */}
            <mesh geometry={b.cone} receiveShadow>
              <meshPhysicalMaterial color="#eef3f8" transparent opacity={0.32} roughness={0.06} metalness={0} clearcoat={1} clearcoatRoughness={0.04} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh geometry={b.lip}>
              <meshPhysicalMaterial color="#eef3f8" transparent opacity={0.3} roughness={0.06} metalness={0} clearcoat={1} clearcoatRoughness={0.04} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh geometry={b.stripe}>
              <meshStandardMaterial map={tex.hazard} roughness={0.45} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={b.rim}>
              <meshStandardMaterial {...chrome} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={b.throat} castShadow>
              <meshStandardMaterial {...chrome} side={THREE.DoubleSide} />
            </mesh>
            {/* Lamps around the rim, and a support frame: four struts from the throat to the ground. */}
            {Array.from({ length: 12 }, (_, k) => {
              const a = ((k + 0.5) / 12) * Math.PI * 2;
              const x = Math.cos(a) * (v.radius + 0.08);
              const z = Math.sin(a) * (v.radius + 0.08);
              if (x < 0 && Math.abs(z) < v.entryHalf + 0.4) return null;
              const p = b.frame.toWorld(x, v.lip + 0.06, z) as Vec3;
              return (
                <mesh key={k} position={p}>
                  <sphereGeometry args={[0.06, 16, 8]} />
                  <meshStandardMaterial color="#ffd166" emissive="#ffb000" emissiveIntensity={2.5} toneMapped={false} />
                </mesh>
              );
            })}
            {[45, 135, 225, 315].map((deg) => {
              const a = (deg * Math.PI) / 180;
              const top = b.frame.toWorld(Math.cos(a) * (v.hole + 0.3), -v.depth - v.throat, Math.sin(a) * (v.hole + 0.3)) as Vec3;
              const foot = b.frame.toWorld(Math.cos(a) * (v.radius + 1.2), groundY - v.center[1], Math.sin(a) * (v.radius + 1.2)) as Vec3;
              const mid = top.map((c, k) => (c + foot[k]) / 2) as Vec3;
              const dir = new THREE.Vector3(foot[0] - top[0], foot[1] - top[1], foot[2] - top[2]);
              const len = dir.length();
              const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
              return (
                <mesh key={deg} position={mid} quaternion={q} castShadow>
                  <cylinderGeometry args={[0.07, 0.09, len, 12]} />
                  <meshStandardMaterial {...steel} />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {rollers.map((r, i) => (
        <group key={`r${i}`}>
          <group ref={(el) => void (rollerRefs.current[i] = el)} position={r.pos} quaternion={rollerQuat(r, sec)}>
            <mesh rotation-x={Math.PI / 2} castShadow receiveShadow>
              <cylinderGeometry args={[r.radius, r.radius, r.length, 48]} />
              <meshStandardMaterial map={tex.knurl} metalness={0.8} roughness={0.35} />
            </mesh>
            {[-1, 1].map((e) => (
              <mesh key={e} position={[0, 0, (e * r.length) / 2]} rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[r.radius * 0.5, r.radius * 0.5, 0.06, 24]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
            ))}
          </group>
          {/* A dark slot plate around each roller (it sits nearly flush, so the slot is what reads), hazard strips either side, bearing blocks on the walls. */}
          <group position={r.pos} quaternion={r.quat}>
            <mesh position={[0, r.radius - 0.045, 0]}>
              <boxGeometry args={[r.radius * 2 + 0.3, 0.012, r.length + 0.04]} />
              <meshStandardMaterial color="#15161b" roughness={0.6} />
            </mesh>
            {[-1, 1].map((e) => (
              <mesh key={`h${e}`} position={[e * (r.radius + 0.26), r.radius - 0.03, 0]}>
                <boxGeometry args={[0.2, 0.012, r.length + 0.04]} />
                <meshStandardMaterial map={tex.hazard} roughness={0.45} />
              </mesh>
            ))}
            {[-1, 1].map((e) => (
              <mesh key={e} position={[0, 0.12, e * (W2 + 0.08)]} castShadow>
                <boxGeometry args={[0.5, 0.5, 0.16]} />
                <meshStandardMaterial {...dark} />
              </mesh>
            ))}
          </group>
        </group>
      ))}

      {fans.map((fan, i) => {
        const h = fan.pos[1] - groundY;
        return (
          <group key={`f${i}`} position={fan.pos} quaternion={fan.quat}>
            {/* Post to the ground, motor housing behind the hub, cage ring and five blades facing across the track. */}
            <mesh position={[0, -h / 2, 0]} castShadow>
              <cylinderGeometry args={[0.1, 0.14, h, 16]} />
              <meshStandardMaterial {...steel} />
            </mesh>
            <mesh position={[0, 0, fan.side * -0.35]} rotation-x={Math.PI / 2} castShadow>
              <cylinderGeometry args={[0.28, 0.32, 0.5, 24]} />
              <meshStandardMaterial {...dark} />
            </mesh>
            <mesh rotation-x={0} castShadow>
              <torusGeometry args={[1.25, 0.05, 12, 64]} />
              <meshStandardMaterial {...steel} />
            </mesh>
            {Array.from({ length: 8 }, (_, k) => (
              <mesh key={k} rotation-z={(k / 8) * Math.PI} position={[0, 0, fan.side * 0.12]}>
                <boxGeometry args={[2.5, 0.02, 0.02]} />
                <meshStandardMaterial {...steel} />
              </mesh>
            ))}
            <group ref={(el) => void (bladeRefs.current[i] = el)} rotation-z={bladeAngle(fan, sec)}>
              {Array.from({ length: 5 }, (_, k) => (
                <group key={k} rotation-z={(k / 5) * Math.PI * 2}>
                  <mesh position={[0.62, 0, 0]} rotation-x={0.6} castShadow>
                    <boxGeometry args={[1.1, 0.34, 0.03]} />
                    <meshStandardMaterial color="#f2b705" roughness={0.4} />
                  </mesh>
                </group>
              ))}
              <mesh rotation-x={Math.PI / 2}>
                <cylinderGeometry args={[0.2, 0.2, 0.2, 24]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
            </group>
            <mesh position={[0, 1.5, 0]}>
              <sphereGeometry args={[0.08, 16, 8]} />
              <meshStandardMaterial color="#ff9a3c" emissive="#ff7a00" emissiveIntensity={2.5} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
