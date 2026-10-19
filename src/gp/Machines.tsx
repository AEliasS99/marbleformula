import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useView } from "./view";
import { subframe } from "./subframe";
import { TRACK } from "./trackMesh.js";
import { agitatorArm, agitatorQuat, vortexFrame, vortexGeometry, vortexY } from "./vortex.js";
import type { Race, Quat, Vec3 } from "./race";

// The machines that change the physics rather than just deflecting: the
// vortex bowl, the rollers and the fan. Geometry and timing come from the
// bake (src/gp/vortex.js, scripts/season.mjs rollerQuat/fanGust), so what
// moves on screen is what moved the marbles.

type Vortex = {
  u: number;
  center: Vec3;
  fwd: Vec3;
  radius: number;
  hole: number;
  depth: number;
  lip: number;
  throat: number;
  entryHalf?: number;
  entryLo?: number;
  entryHi?: number;
  chute?: { x0: number; z: number };
  k: number;
  agitator: { arms: number; rIn: number; rOut: number; clearance: number; height: number; thickness: number; speed: number; phase: number };
};
type Roller = { pos: Vec3; quat: Quat; radius: number; length: number; omega: number; phase: number };
type Fan = { u0: number; u1: number; side: number; dir: Vec3; pos: Vec3; quat: Quat; accel: number; period: number; phase: number };
type Elevator = {
  lat: number;
  bayWidth: number;
  center: Vec3;
  fwd: Vec3;
  slope: number;
  length: number;
  width: number;
  wall: number;
  lift: number;
  u: number;
  cabinY: number[];
  doors: [number, number][];
  cycles: { closeAt: number; riseAt?: number; topAt?: number; openAt?: number }[];
  bar: { pos: Vec3; quat: Quat; size: Vec3; lift: number };
};
type Regroup = { u: number; pos: Vec3; quat: Quat; size: Vec3; lift: number; time: number; firstFrame: number | null; openFrame: number | null; lifts?: number[] };

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
const hazardTex = (repeat: [number, number] = [24, 1]) =>
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
    repeat,
  );
/** Barrier stripes for a bar `length` long (on the faces whose u runs along it): one red/white pair every 0.5 units. */
const stripeCache = new Map<string, THREE.Texture>();
function barStripes(length: number, height = 0) {
  const key = `${length.toFixed(2)}x${height.toFixed(2)}`;
  const hit = stripeCache.get(key);
  if (hit) return hit;
  const t = canvasTexture(256, 128, (g) => {
    g.fillStyle = "#f4f4f2";
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#d8232a";
    for (let x = -128; x < 256; x += 128) {
      g.beginPath();
      g.moveTo(x, 128);
      g.lineTo(x + 64, 128);
      g.lineTo(x + 128, 0);
      g.lineTo(x + 64, 0);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#1b1c20";
    g.fillRect(0, 0, 256, 10);
    g.fillRect(0, 118, 256, 10);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
      g.fillRect(Math.random() * 256, Math.random() * 128, 2, 2);
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, Math.round(length / 0.5)), height > 0 ? Math.max(1, Math.round(height / 0.25)) : 1); // a panel (height > 0) tiles the bands up its face too
  t.needsUpdate = true;
  stripeCache.set(key, t);
  return t;
}

const numberCache = new Map<number, THREE.Texture>();
/** A cabin's number on a yellow roundel. */
function numberTex(n: number) {
  const hit = numberCache.get(n);
  if (hit) return hit;
  const t = canvasTexture(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = "#ffcc00";
    g.beginPath();
    g.arc(128, 128, 120, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = "#1b1c20";
    g.stroke();
    g.fillStyle = "#1b1c20";
    g.font = "900 170px 'Avenir Next', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), 128, 140);
  });
  numberCache.set(n, t);
  return t;
}

const signTex = (text: string) =>
  canvasTexture(1024, 128, (g) => {
    g.fillStyle = "#111216";
    g.fillRect(0, 0, 1024, 128);
    g.fillStyle = "#ffcc00";
    g.font = "900 84px 'Avenir Next', system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 512, 68);
  });
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
  const view = useView(race);
  const data = race.data as unknown as { vortices?: Vortex[]; rollers?: Roller[]; fans?: Fan[]; regroups?: Regroup[]; samples: { p: Vec3; n: Vec3 }[] };
  const regroups = data.regroups ?? [];
  const elevators = (data as unknown as { elevators?: Elevator[] }).elevators ?? [];

  const regroupRefs = useRef<(THREE.Group | null)[]>([]);
  const lampRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  /** The bar's lift along the track normal at simulation frame t. */
  const barLift = (g: Regroup, t: number) => {
    // The bake's per-frame curve (it opens and closes once per lap); interpolated between frames.
    if (g.lifts && g.lifts.length) {
      const f = Math.max(0, Math.min(g.lifts.length - 1, Math.floor(t)));
      const f1 = Math.min(g.lifts.length - 1, f + 1);
      const a = Math.min(1, Math.max(0, t - f));
      return g.lift * (g.lifts[f] + (g.lifts[f1] - g.lifts[f]) * a);
    }
    if (g.openFrame === null) return 0;
    const k = Math.max(0, Math.min(1, (t - g.openFrame) / (g.time * race.fps)));
    return g.lift * k * k * (3 - 2 * k);
  };
  const barPos = (g: Regroup, t: number): Vec3 => {
    const q = new THREE.Quaternion(...g.quat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q).multiplyScalar(barLift(g, t));
    return [g.pos[0] + up.x, g.pos[1] + up.y, g.pos[2] + up.z];
  };
  const vortices = data.vortices ?? [];
  const rollers = data.rollers ?? [];
  const fans = data.fans ?? [];
  const groundY = useMemo(() => Math.min(...data.samples.map((s) => s.p[1])) - 1.4, [data]);
  const tex = useMemo(() => ({ hazard: hazardTex(), bar: hazardTex([1, 1]), hazardV: hazardTex([1, 6]), knurl: knurlTex(), sign: signTex("REGROUP"), lift: signTex("LIFT TOWER") }), []);
  const bowls = useMemo(
    () =>
      vortices.map((v) => {
        const parts = vortexGeometry(v, 160);
        // Concentric rings on the cone, every 0.45 units down the slope: they read the funnel's shape.
        const fr = vortexFrame(v);
        const rings: { r: number; y: number }[] = [];
        // Rings at equal height steps (the drain steepens toward the throat, so they crowd in like contour lines).
        for (let k = 1; k < 9; k++) {
          const y = (-v.depth * k) / 9;
          const r = 1 / (1 / v.radius - y / v.k);
          rings.push({ r, y: (vortexY(v, r) as number) + 0.012 });
        }
        return { cone: toGeometry(parts.cone), lip: toGeometry(parts.lip), rim: toGeometry(parts.rim), throat: toGeometry(parts.throat), stripe: toGeometry(parts.stripe), apron: toGeometry(parts.apron), chute: toGeometry(parts.chute), frame: fr, rings };
      }),
    [vortices],
  );

  const rollerRefs = useRef<(THREE.Group | null)[]>([]);
  const agitatorRefs = useRef<(THREE.Group | null)[]>([]);
  const bladeRefs = useRef<(THREE.Group | null)[]>([]);
  const rollerQuat = (r: Roller, s: number) =>
    new THREE.Quaternion(...r.quat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), r.phase + r.omega * s));
  const bladeAngle = (fan: Fan, s: number) => fan.phase * 3 + s * 14; // fast, a blur in the render
  useEffect(
    () =>
      subframe.subscribe((vf) => {
        const s = view.tAt(vf) / race.fps;
        rollers.forEach((r, i) => rollerRefs.current[i]?.quaternion.copy(rollerQuat(r, s)));
        regroups.forEach((g, i) => {
          regroupRefs.current[i]?.position.set(...barPos(g, view.tAt(vf)));
          void lampRefs; // the signal follows React's per-frame render (it changes once per lap)
        });
        vortices.forEach((v, i) => agitatorRefs.current[i]?.quaternion.set(...(agitatorQuat(v, s) as Quat)));
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
            {/* Smoked acrylic: the swirl is the show, seen from outside too, but the funnel's shape reads. */}
            <mesh geometry={b.cone} receiveShadow>
              <meshPhysicalMaterial color="#cfd9e6" transparent opacity={0.5} roughness={0.08} metalness={0.1} clearcoat={1} clearcoatRoughness={0.04} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            {b.rings.map((ring, k) => (
              <mesh key={`ring${k}`} position={b.frame.toWorld(0, ring.y, 0) as Vec3} rotation-x={Math.PI / 2}>
                <torusGeometry args={[ring.r, 0.012, 6, 128]} />
                <meshStandardMaterial color={k % 3 === 0 ? "#d8232a" : "#ffffff"} roughness={0.4} />
              </mesh>
            ))}
            <mesh geometry={b.lip}>
              <meshPhysicalMaterial color="#eef3f8" transparent opacity={0.3} roughness={0.06} metalness={0} clearcoat={1} clearcoatRoughness={0.04} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh geometry={b.stripe}>
              <meshStandardMaterial map={tex.hazard} roughness={0.45} side={THREE.DoubleSide} />
            </mesh>
            {/* The chute into the drain: the right-hand wall run on to the lip, and the apron floor. */}
            <mesh geometry={b.apron} receiveShadow>
              <meshStandardMaterial color="#34363b" roughness={0.8} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={b.chute} castShadow>
              <meshPhysicalMaterial color="#eef3f8" transparent opacity={0.3} roughness={0.06} clearcoat={1} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh geometry={b.rim}>
              <meshStandardMaterial {...chrome} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={b.throat} castShadow>
              <meshStandardMaterial {...chrome} side={THREE.DoubleSide} />
            </mesh>
            {/* The agitator: three sweeping paddles that follow the bowl's curve a hair above it (chrome, black rubber
                edge where they meet the marbles, yellow tips), on a shaft down through the throat to a motor underneath. */}
            {v.agitator.arms > 0 && (
            <group ref={(el) => void (agitatorRefs.current[i] = el)} position={v.center} quaternion={agitatorQuat(v, sec) as Quat}>
              {Array.from({ length: v.agitator.arms }, (_, k) =>
                (agitatorArm(v, k) as { pos: Vec3; quat: Quat; size: Vec3 }[]).map((seg, j, all) => (
                  <group key={`${k}-${j}`} position={seg.pos} quaternion={seg.quat}>
                    <mesh castShadow>
                      <boxGeometry args={seg.size} />
                      <meshStandardMaterial {...(j === all.length - 1 ? { color: "#ffcc00", roughness: 0.3 } : chrome)} />
                    </mesh>
                    <mesh position={[0, -seg.size[1] / 2 + 0.04, 0]}>
                      <boxGeometry args={[seg.size[0], 0.08, seg.size[2] + 0.03]} />
                      <meshStandardMaterial color="#1b1c20" roughness={0.9} />
                    </mesh>
                  </group>
                )),
              )}
              <mesh position={[0, -v.depth / 2 - v.throat + 0.3, 0]} castShadow>
                <cylinderGeometry args={[0.12, 0.12, v.depth + 2 * v.throat + 0.6, 24]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
              <mesh position={[0, -v.depth + 0.25, 0]}>
                <sphereGeometry args={[0.3, 32, 16]} />
                <meshStandardMaterial {...chrome} />
              </mesh>
            </group>
            )}
            {v.agitator.arms > 0 && <mesh position={[v.center[0], v.center[1] - v.depth - v.throat - 0.55, v.center[2]]} castShadow>
              <cylinderGeometry args={[0.45, 0.5, 0.6, 24]} />
              <meshStandardMaterial {...dark} />
            </mesh>}
            {/* Lamps around the rim, and a support frame: four struts from the throat to the ground. */}
            {Array.from({ length: 12 }, (_, k) => {
              const a = ((k + 0.5) / 12) * Math.PI * 2;
              const x = Math.cos(a) * (v.radius + 0.08);
              const z = Math.sin(a) * (v.radius + 0.08);
              if (x < 0 && z > (v.entryLo ?? -(v.entryHalf ?? 0)) - 0.4 && z < (v.entryHi ?? v.entryHalf ?? 0) + 0.4) return null;
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

      {elevators.length > 0 && <LiftTower elevators={elevators} groundY={groundY} tex={tex} />}
      {elevators.map((e, i) => (
        <LiftCabin key={`e${i}`} race={race} t={t} elevator={e} groundY={groundY} tex={tex} />
      ))}

      {regroups.map((g, i) => {
        const open = barLift(g, t) > g.lift * 0.5;
        const span = 2 * (W2 + 0.16);
        return (
          <group key={`g${i}`}>
            {/* The bar: striped barrier with rubber skirt and chrome end caps that run in the posts' guides. */}
            <group ref={(el) => void (regroupRefs.current[i] = el)} position={barPos(g, t)} quaternion={g.quat}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={g.size} />
                <meshStandardMaterial map={barStripes(g.size[2])} roughness={0.4} />
              </mesh>
              <mesh position={[0, -g.size[1] / 2 + 0.05, 0]}>
                <boxGeometry args={[g.size[0] + 0.04, 0.1, g.size[2]]} />
                <meshStandardMaterial color="#1b1c20" roughness={0.9} />
              </mesh>
              {[-1, 1].map((e) => (
                <mesh key={e} position={[0, 0, e * (g.size[2] / 2 + 0.1)]}>
                  <boxGeometry args={[0.2, g.size[1] + 0.06, 0.2]} />
                  <meshStandardMaterial {...chrome} />
                </mesh>
              ))}
            </group>
            {/* The frame: two steel posts with chrome guide rails and hazard strips, a truss across the top
                carrying the lit REGROUP board, and a three-light signal on each post. */}
            <group position={g.pos} quaternion={g.quat}>
              {[-1, 1].map((e) => (
                <group key={e} position={[0, 0, e * (W2 + 0.3)]}>
                  <mesh position={[0, g.lift / 2 + 0.55, 0]} castShadow>
                    <boxGeometry args={[0.34, g.lift + 2.0, 0.3]} />
                    <meshStandardMaterial {...steel} />
                  </mesh>
                  {[-1, 1].map((x) => (
                    <mesh key={x} position={[x * 0.13, g.lift / 2 + 0.55, -e * 0.16]}>
                      <boxGeometry args={[0.04, g.lift + 2.0, 0.04]} />
                      <meshStandardMaterial {...chrome} />
                    </mesh>
                  ))}
                  <mesh position={[0, g.lift / 2 + 0.2, -e * 0.155]}>
                    <boxGeometry args={[0.18, g.lift + 0.8, 0.01]} />
                    <meshStandardMaterial map={tex.hazardV} roughness={0.5} />
                  </mesh>
                  {/* Signal: red, amber, green, stacked; the live one glows. */}
                  <group position={[0, g.lift + 1.15, -e * 0.17]}>
                    <mesh>
                      <boxGeometry args={[0.24, 0.62, 0.08]} />
                      <meshStandardMaterial {...dark} />
                    </mesh>
                    {(["#ff3344", "#ffb000", "#4cff6a"] as const).map((c, k) => {
                      const lit = (k === 0 && !open) || (k === 2 && open);
                      return (
                        <mesh key={c} position={[0, 0.19 - k * 0.19, -e * 0.045]} rotation-y={e > 0 ? Math.PI : 0}>
                          <circleGeometry args={[0.07, 24]} />
                          <meshStandardMaterial
                            ref={k === 0 ? (el) => void (lampRefs.current[i] = el) : undefined}
                            color={lit ? c : "#2a2c30"}
                            emissive={lit ? c : "#000000"}
                            emissiveIntensity={lit ? 3 : 0}
                            toneMapped={false}
                          />
                        </mesh>
                      );
                    })}
                  </group>
                </group>
              ))}
              {/* Truss and board. */}
              <mesh position={[0, g.lift + 1.65, 0]} castShadow>
                <boxGeometry args={[0.3, 0.12, span + 0.5]} />
                <meshStandardMaterial {...steel} />
              </mesh>
              <mesh position={[0, g.lift + 2.05, 0]}>
                <boxGeometry args={[0.3, 0.12, span + 0.5]} />
                <meshStandardMaterial {...steel} />
              </mesh>
              {Array.from({ length: 9 }, (_, k) => (
                <mesh key={k} position={[0, g.lift + 1.85, -span / 2 + (k * span) / 8]} rotation-x={k % 2 ? 0.7 : -0.7}>
                  <boxGeometry args={[0.05, 0.5, 0.05]} />
                  <meshStandardMaterial {...steel} />
                </mesh>
              ))}
              <mesh position={[-0.17, g.lift + 1.85, 0]} rotation-y={-Math.PI / 2}>
                <planeGeometry args={[2.2, 0.36]} />
                <meshStandardMaterial map={tex.sign} emissive="#ffcc00" emissiveMap={tex.sign} emissiveIntensity={0.6} roughness={0.5} />
              </mesh>
              <mesh position={[0.17, g.lift + 1.85, 0]} rotation-y={Math.PI / 2}>
                <planeGeometry args={[2.2, 0.36]} />
                <meshStandardMaterial map={tex.sign} emissive="#ffcc00" emissiveMap={tex.sign} emissiveIntensity={0.6} roughness={0.5} />
              </mesh>
            </group>
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

/** One lift cabin with its tower, doors, cables and the bar across its bay. */
function LiftCabin({ race, t, elevator, groundY, tex }: { race: Race; t: number; elevator: Elevator; groundY: number; tex: { bar: THREE.Texture; knurl: THREE.Texture; lift: THREE.Texture; hazard: THREE.Texture } }) {
  const view = useView(race);
  const W2 = TRACK.width / 2;
  void W2;
  const cabinRef = useRef<THREE.Group | null>(null);
  const backDoorRef = useRef<THREE.Group | null>(null);
  const frontDoorRef = useRef<THREE.Group | null>(null);
  const evBarRef = useRef<THREE.Group | null>(null);
  const cableRefs = useRef<(THREE.Mesh | null)[]>([]);
  /** Cabin frame: local x forward (down the floor's slope), y the floor normal, z right. */
  const evFrame = useMemo(() => {
    const fwd = new THREE.Vector3(...elevator.fwd).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const yaw = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, new THREE.Vector3(0, 1, 0), right));
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.atan(elevator.slope));
    return { fwd, right, quat: yaw.multiply(tilt) };
  }, [elevator]);
  const evAt = (t: number) => {
    const f = Math.max(0, Math.min(elevator.cabinY.length - 1, Math.floor(t)));
    const f1 = Math.min(elevator.cabinY.length - 1, f + 1);
    const a = Math.min(1, Math.max(0, t - f));
    const d = elevator.doors;
    return { h: elevator.cabinY[f] + (elevator.cabinY[f1] - elevator.cabinY[f]) * a, back: d[f][0] + (d[f1][0] - d[f][0]) * a, front: d[f][1] + (d[f1][1] - d[f][1]) * a };
  };
  const evBarOpen = (t: number) => {
    // The bar is up while the cabin loads: cabin at the bottom with its back door down.
    const p = evAt(t);
    return p.h < 0.01 ? p.back : 0;
  };
  const applyElevator = (t: number) => {
    const p = evAt(t);
    cabinRef.current?.position.set(elevator.center[0], elevator.center[1] + p.h, elevator.center[2]);
    for (const [ref, x, open] of [[backDoorRef, -elevator.length / 2 + 0.06, p.back], [frontDoorRef, elevator.length / 2 - 0.06, p.front]] as const) {
      ref.current?.position.set(x, (elevator.wall * (1 - open)) / 2, 0);
      ref.current?.scale.set(1, Math.max(0.001, 1 - open), 1);
    }
    const bl = elevator.bar.lift * evBarOpen(t);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...elevator.bar.quat)).multiplyScalar(bl);
    evBarRef.current?.position.set(elevator.bar.pos[0] + up.x, elevator.bar.pos[1] + up.y, elevator.bar.pos[2] + up.z);
    // Cables from the cabin's roof corners up to the head frame: scale to the remaining height.
    const remaining = Math.max(0.05, elevator.lift + 2.0 - p.h);
    cableRefs.current.forEach((c) => {
      if (!c) return;
      c.scale.set(1, remaining, 1);
      c.position.y = elevator.wall + remaining / 2;
    });
  };
  useEffect(() => subframe.subscribe((vf) => applyElevator(view.tAt(vf))), [race, elevator]);
  const p = evAt(t);
        const L = elevator.length;
        const W = elevator.width;
        const H = elevator.wall;
        void groundY;
        const bl = elevator.bar.lift * evBarOpen(t);
        const barUp = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...elevator.bar.quat)).multiplyScalar(bl);
  return (
          <group>
            {/* The cabin: a sloped floor plate, clear side walls in chrome frames, two sliding doors, cables. */}
            <group ref={cabinRef} position={[elevator.center[0], elevator.center[1] + p.h, elevator.center[2]]} quaternion={evFrame.quat}>
              <mesh position={[0, -0.06, 0]} castShadow receiveShadow>
                <boxGeometry args={[L + 0.2, 0.12, W]} />
                <meshStandardMaterial map={tex.knurl} metalness={0.7} roughness={0.4} />
              </mesh>
              {/* Open steel sides (no glass: it hid the riders and tinted the doors pink): a kick plate,
                  two rails and the top rail, posts at the ends and the middle. The walls are colliders only. */}
              {[-1, 1].map((e) => (
                <group key={e} position={[0, 0, e * (W / 2 - 0.05)]}>
                  <mesh position={[0, 0.16, 0]} castShadow>
                    <boxGeometry args={[L + 0.2, 0.32, 0.05]} />
                    <meshStandardMaterial {...steel} />
                  </mesh>
                  {[H * 0.42, H * 0.72, H].map((y) => (
                    <mesh key={y} position={[0, y, 0]} castShadow>
                      <boxGeometry args={[L + 0.3, 0.07, 0.09]} />
                      <meshStandardMaterial {...chrome} />
                    </mesh>
                  ))}
                  {[-L / 2, 0, L / 2].map((x) => (
                    <mesh key={x} position={[x, H / 2, 0]} castShadow>
                      <boxGeometry args={[0.1, H, 0.12]} />
                      <meshStandardMaterial {...chrome} />
                    </mesh>
                  ))}
                </group>
              ))}
              {/* The doors: yellow barred gates that sink into a slot in the floor (scaled to what is above it,
                  so they never poke out under the cabin). */}
              {[
                { ref: backDoorRef, x: -L / 2 + 0.06, open: p.back },
                { ref: frontDoorRef, x: L / 2 - 0.06, open: p.front },
              ].map((d, k) => (
                <group key={k} ref={d.ref as unknown as React.Ref<THREE.Group>} position={[d.x, (H * (1 - d.open)) / 2, 0]} scale={[1, Math.max(0.001, 1 - d.open), 1]}>
                  {Array.from({ length: Math.max(3, Math.round((W - 0.1) / 0.32)) }, (_, j) => {
                    const n = Math.max(3, Math.round((W - 0.1) / 0.32));
                    const z = -(W - 0.3) / 2 + ((W - 0.3) * j) / (n - 1);
                    return (
                      <mesh key={j} position={[0, 0, z]}>
                        <boxGeometry args={[0.06, H, 0.06]} />
                        <meshStandardMaterial color="#ffcc00" roughness={0.4} metalness={0.2} />
                      </mesh>
                    );
                  })}
                  <mesh position={[0, H / 2 - 0.05, 0]}>
                    <boxGeometry args={[0.1, 0.1, W - 0.1]} />
                    <meshStandardMaterial map={tex.hazard} roughness={0.45} />
                  </mesh>
                  <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[0.08, 0.08, W - 0.1]} />
                    <meshStandardMaterial color="#1b1c20" roughness={0.5} />
                  </mesh>
                </group>
              ))}
              {/* Roof ring with a lit LED strip, a cross-beam the cables hang from, hazard edges on the floor, and the cabin's number. */}
              {[-1, 1].map((e) => (
                <mesh key={`led${e}`} position={[0, H - 0.02, e * (W / 2 - 0.12)]}>
                  <boxGeometry args={[L + 0.1, 0.04, 0.04]} />
                  <meshStandardMaterial color="#dff6ff" emissive="#9fe7ff" emissiveIntensity={2.2} toneMapped={false} />
                </mesh>
              ))}
              {[-1, 1].map((x) => (
                <mesh key={`beam${x}`} position={[x * (L / 2 - 0.3), H + 0.06, 0]} castShadow>
                  <boxGeometry args={[0.14, 0.12, W + 0.2]} />
                  <meshStandardMaterial {...steel} />
                </mesh>
              ))}
              {[-1, 1].map((e) => (
                <mesh key={`edge${e}`} position={[0, 0.006, e * (W / 2 - 0.2)]}>
                  <boxGeometry args={[L, 0.012, 0.16]} />
                  <meshStandardMaterial map={tex.hazard} roughness={0.5} />
                </mesh>
              ))}
              <mesh position={[0, H * 0.62, (elevator.lat < 0 ? -1 : 1) * (W / 2 + 0.02)]} rotation-y={elevator.lat < 0 ? Math.PI : 0}>
                <planeGeometry args={[0.7, 0.7]} />
                <meshStandardMaterial map={numberTex(elevator.lat < 0 ? 1 : 2)} roughness={0.4} transparent />
              </mesh>
              {[-1, 1].map((e) =>
                [-1, 1].map((g) => (
                  <mesh key={`${e}${g}`} ref={(el) => void (cableRefs.current[(e + 1) + (g + 1) / 2] = el)} position={[e * (L / 2 - 0.3), H + (elevator.lift + 2 - p.h) / 2, g * (W / 2 - 0.3)]}>
                    <cylinderGeometry args={[0.025, 0.025, 1, 8]} />
                    <meshStandardMaterial {...dark} />
                  </mesh>
                )),
              )}
            </group>
            {/* The holding bar on the track before the dock. */}
            <group ref={evBarRef} position={[elevator.bar.pos[0] + barUp.x, elevator.bar.pos[1] + barUp.y, elevator.bar.pos[2] + barUp.z]} quaternion={elevator.bar.quat}>
              <mesh castShadow>
                <boxGeometry args={elevator.bar.size} />
                <meshStandardMaterial map={barStripes(elevator.bar.size[2])} roughness={0.4} />
              </mesh>
            </group>
            <group position={elevator.bar.pos} quaternion={elevator.bar.quat}>
              {[-1, 1].map((e) => (
                <mesh key={e} position={[0, elevator.bar.lift / 2 + 0.5, e * (elevator.bar.size[2] / 2 + 0.2)]} castShadow>
                  <boxGeometry args={[0.26, elevator.bar.lift + 1.8, 0.26]} />
                  <meshStandardMaterial {...dark} />
                </mesh>
              ))}
            </group>
          </group>
  );
}

/**
 * One tower frame for all the cabins side by side: lattice columns only at the
 * outer corners (fore and aft of the cabins, outside the track), braces on the
 * two outer faces, and one head frame across the top with a winding drum and
 * cable sheaves above each cabin. Nothing passes between the cabins.
 */
function LiftTower({ elevators, groundY, tex }: { elevators: Elevator[]; groundY: number; tex: { lift: THREE.Texture } }) {
  const e0 = elevators[0];
  const fwd = new THREE.Vector3(...e0.fwd).normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const yaw = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, new THREE.Vector3(0, 1, 0), right));
  const centre = elevators.reduce((acc, e) => acc.add(new THREE.Vector3(...e.center)), new THREE.Vector3()).multiplyScalar(1 / elevators.length);
  const L = e0.length;
  const half = Math.max(...elevators.map((e) => Math.abs(e.lat) + e.width / 2)) + 0.55;
  const top = e0.lift;
  const groundH = centre.y - groundY;
  const height = top + 3 + groundH;
  const posts: [number, number][] = [
    [-L / 2 - 0.5, -half],
    [-L / 2 - 0.5, half],
    [L / 2 + 0.5, -half],
    [L / 2 + 0.5, half],
  ];
  return (
    <group position={centre} quaternion={yaw}>
      {posts.map(([x, z], k) => (
        <group key={k} position={[x, 0, z]}>
          <mesh position={[0, (top + 3 - groundH) / 2, 0]} castShadow>
            <boxGeometry args={[0.34, height, 0.34]} />
            <meshStandardMaterial {...steel} />
          </mesh>
          {Array.from({ length: Math.ceil(height / 2.5) }, (_, j) => (
            <mesh key={j} position={[0, -groundH + j * 2.5 + 1.25, 0]} rotation-y={Math.PI / 4}>
              <boxGeometry args={[0.55, 0.06, 0.06]} />
              <meshStandardMaterial {...dark} />
            </mesh>
          ))}
        </group>
      ))}
      {/* X-braces on the two outer faces only. */}
      {[-1, 1].map((e) =>
        Array.from({ length: Math.ceil(height / 5) }, (_, j) => (
          <mesh key={`${e}${j}`} position={[0, -groundH + j * 5 + 2.5, e * half]} rotation-z={j % 2 ? 0.75 : -0.75}>
            <boxGeometry args={[Math.hypot(L + 1, 5), 0.08, 0.08]} />
            <meshStandardMaterial {...steel} />
          </mesh>
        )),
      )}
      {/* Head frame across both cabins, a drum and sheaves over each, and the sign on both outer faces. */}
      <mesh position={[0, top + 3.2, 0]} castShadow>
        <boxGeometry args={[L + 1.6, 0.5, 2 * half + 0.6]} />
        <meshStandardMaterial {...dark} />
      </mesh>
      {elevators.map((e, k) => {
        const z = new THREE.Vector3(...e.center).sub(centre).dot(right);
        return (
          <group key={k} position={[0, top + 3.9, z]}>
            <mesh rotation-x={Math.PI / 2} castShadow>
              <cylinderGeometry args={[0.55, 0.55, 1.1, 32]} />
              <meshStandardMaterial {...chrome} />
            </mesh>
            {[-1, 1].map((g) => (
              <mesh key={g} position={[g * (L / 2 - 0.3), -0.45, 0]} rotation-x={Math.PI / 2}>
                <torusGeometry args={[0.18, 0.05, 10, 24]} />
                <meshStandardMaterial {...steel} />
              </mesh>
            ))}
          </group>
        );
      })}
      {[-1, 1].map((e) => (
        <mesh key={`s${e}`} position={[0, top + 2.55, e * (half + 0.32)]} rotation-y={e > 0 ? 0 : Math.PI}>
          <planeGeometry args={[L + 1, 0.7]} />
          <meshStandardMaterial map={tex.lift} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}
