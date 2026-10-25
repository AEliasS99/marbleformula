import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useView } from "./view";
import { STAIR, stairLocal, stairLoop, stairTime } from "./stair.js";
import { isNight } from "./look";
import { useSubframe } from "./subframe";
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
  bar?: { pos: Vec3; quat: Quat; size: Vec3; lift: number };
  stopAt?: number | null;
};

const chrome = { color: "#eceef3", metalness: 1, roughness: 0.07 } as const;
const steel = { color: "#dfe2e8", metalness: 1, roughness: 0.25 } as const;
const nightSteel = { color: "#2a2e37", metalness: 0.88, roughness: 0.3, envMapIntensity: 0.45 } as const;
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
const toGeometry = (g: { position: number[]; index: number[]; uv: number[] }, withUv = false) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(g.position, 3));
  if (withUv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
  geo.setIndex(g.index);
  const smooth = mergeVertices(geo, 1e-4);
  smooth.computeVertexNormals();
  return smooth;
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
  const sub = useSubframe();
  const data = race.data as unknown as { vortices?: Vortex[]; rollers?: Roller[]; fans?: Fan[]; samples: { p: Vec3; n: Vec3 }[] };
  const elevators = (data as unknown as { elevators?: Elevator[] }).elevators ?? [];
  const vortices = data.vortices ?? [];
  const rollers = data.rollers ?? [];
  const fans = data.fans ?? [];
  const tex = useMemo(() => ({ hazard: hazardTex(), knurl: knurlTex() }), []);
  useEffect(
    () => () => {
      tex.hazard.dispose();
      tex.knurl.dispose();
    },
    [tex],
  );
  const bowls = useMemo(
    () =>
      vortices.map((v) => {
        const parts = vortexGeometry(v, 160, 64);
        // Concentric rings on the cone, every 0.45 units down the slope: they read the funnel's shape.
        const fr = vortexFrame(v);
        const rings: { r: number; y: number }[] = [];
        // Rings at equal height steps (the drain steepens toward the throat, so they crowd in like contour lines).
        for (let k = 1; k < 9; k++) {
          const y = (-v.depth * k) / 9;
          const r = 1 / (1 / v.radius - y / v.k);
          rings.push({ r, y: (vortexY(v, r) as number) + 0.012 });
        }
        return { cone: toGeometry(parts.cone), lip: toGeometry(parts.lip), rim: toGeometry(parts.rim), throat: toGeometry(parts.throat), stripe: toGeometry(parts.stripe, true), apron: toGeometry(parts.apron), chute: toGeometry(parts.chute), frame: fr, rings };
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
      sub.subscribe((vf) => {
        const s = view.tAt(vf) / race.fps;
        rollers.forEach((r, i) => rollerRefs.current[i]?.quaternion.copy(rollerQuat(r, s)));
        vortices.forEach((v, i) => agitatorRefs.current[i]?.quaternion.set(...(agitatorQuat(v, s) as Quat)));
        fans.forEach((fan, i) => {
          const g = bladeRefs.current[i];
          if (g) g.rotation.z = bladeAngle(fan, s);
        });
      }),
    [sub, view, race],
  );
  const sec = t / race.fps;
  const W2 = TRACK.width / 2;

  return (
    <>
      {bowls.map((b, i) => {
        const v = vortices[i];
        const night = isNight();
        return (
          <group key={`v${i}`}>
            {/* The funnel: smoked obsidian crystal glass at night, glossy acrylic by day, with contour rings and chrome rim/throat. */}
            <mesh geometry={b.cone}>
              <meshPhysicalMaterial
                color={night ? "#121a28" : "#cfd9e6"}
                transparent
                opacity={night ? 0.62 : 0.5}
                roughness={night ? 0.05 : 0.08}
                metalness={night ? 0.18 : 0.1}
                clearcoat={1}
                clearcoatRoughness={0.03}
                envMapIntensity={night ? 1.4 : 1}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            {b.rings.map((ring, k) => (
              <mesh key={`ring${k}`} position={b.frame.toWorld(0, ring.y, 0) as Vec3} rotation-x={Math.PI / 2}>
                <torusGeometry args={[ring.r, 0.014, 8, 128]} />
                {night ? (
                  <meshStandardMaterial
                    color={k % 3 === 0 ? "#ff3b47" : "#4cdbff"}
                    emissive={k % 3 === 0 ? "#ff1f2d" : "#14b8ff"}
                    emissiveIntensity={1.6}
                    roughness={0.2}
                    toneMapped={false}
                  />
                ) : (
                  <meshStandardMaterial color={k % 3 === 0 ? "#d8232a" : "#ffffff"} roughness={0.4} />
                )}
              </mesh>
            ))}
            <mesh geometry={b.lip}>
              <meshPhysicalMaterial
                color={night ? "#182234" : "#eef3f8"}
                transparent
                opacity={night ? 0.45 : 0.3}
                roughness={0.05}
                metalness={night ? 0.12 : 0}
                clearcoat={1}
                clearcoatRoughness={0.03}
                envMapIntensity={night ? 1.3 : 1}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
            <mesh geometry={b.stripe}>
              <meshStandardMaterial map={tex.hazard} roughness={0.45} side={THREE.DoubleSide} />
            </mesh>
            {/* The chute into the drain: the right-hand wall run on to the lip, and the apron floor. */}
            <mesh geometry={b.apron} receiveShadow>
              <meshStandardMaterial color="#34363b" roughness={0.8} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={b.chute} castShadow>
              <meshPhysicalMaterial
                color={night ? "#182234" : "#eef3f8"}
                transparent
                opacity={night ? 0.45 : 0.3}
                roughness={0.05}
                clearcoat={1}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
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
            {/* Lamps around the rim, and an under-bowl structural cradle truss from the throat to the outer rim. */}
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
              const top = b.frame.toWorld(Math.cos(a) * (v.hole + 0.32), -v.depth - v.throat * 0.85, Math.sin(a) * (v.hole + 0.32)) as Vec3;
              const foot = b.frame.toWorld(Math.cos(a) * (v.radius - 0.08), -0.06, Math.sin(a) * (v.radius - 0.08)) as Vec3;
              const mid = top.map((c, k) => (c + foot[k]) / 2) as Vec3;
              const dir = new THREE.Vector3(foot[0] - top[0], foot[1] - top[1], foot[2] - top[2]);
              const len = dir.length();
              const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
              return (
                <mesh key={deg} position={mid} quaternion={q} castShadow>
                  <cylinderGeometry args={[0.065, 0.08, len, 14]} />
                  <meshStandardMaterial {...(night ? nightSteel : steel)} />
                </mesh>
              );
            })}
          </group>
        );
      })}


      {elevators.map((e, i) => (
        <StairBay key={`e${i}`} race={race} t={t} elevator={e} tex={tex} />
      ))}

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
        const night = isNight();
        const mat = night ? nightSteel : steel;
        return (
          <group key={`f${i}`} position={fan.pos} quaternion={fan.quat}>
            {/* Track-mounted cantilever bracket into the trough underside, motor housing behind the hub, cage ring and five blades. */}
            <mesh position={[0, -0.7, fan.side * -0.22]} castShadow>
              <cylinderGeometry args={[0.1, 0.13, 1.4, 16]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, -1.32, fan.side * 0.88]} castShadow>
              <boxGeometry args={[0.26, 0.18, 2.35]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0, -0.82, fan.side * 0.65]} rotation-x={fan.side * 0.58} castShadow>
              <cylinderGeometry args={[0.065, 0.065, 1.85, 12]} />
              <meshStandardMaterial {...mat} />
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

/**
 * Twin-Chain Marble Scoop Conveyor Lift (src/gp/stair.js):
 * Picks up marbles one-by-one from the single-file queue at the bottom dock in
 * sculpted U-shaped scoop cradles attached to twin heavy vertical roller-chains,
 * driven by rotating toothed sprockets and an overhead electric motor + flywheel.
 */
function StairBay({ race, t, elevator, tex }: { race: Race; t: number; elevator: Elevator; tex: { hazard: THREE.Texture } }) {
  const view = useView(race);
  const sub = useSubframe();
  const E = elevator as unknown as Parameters<typeof stairLoop>[0] & { stopAt?: number | null };
  const loop = useMemo(() => stairLoop(E), [elevator]);
  const frame = useMemo(() => {
    const fwd = new THREE.Vector3(...elevator.fwd).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const yaw = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, new THREE.Vector3(0, 1, 0), right));
    const plate = yaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -STAIR.tilt));
    const c = new THREE.Vector3(...elevator.center);
    const at = (x: number, y: number, z: number) => c.clone().addScaledVector(fwd, x).add(new THREE.Vector3(0, y, 0)).addScaledVector(right, z);
    return { fwd, right, yaw, plate, at };
  }, [elevator]);

  const L = elevator.length;
  const W = elevator.width;
  const H = elevator.lift + 1.2;
  const midY = (elevator.lift - 0.3) / 2;
  const chainCols = [-(W / 2 - 0.06), 0, W / 2 - 0.06];
  const LINKS_PER_COL = 28;
  const LINK_COUNT = chainCols.length * LINKS_PER_COL;

  // Sculpted 3D Marble Scoop Bucket geometry: open front/back cradle with side cheeks attached to the roller chains
  const cradleGeo = useMemo(() => {
    const floor = new THREE.BoxGeometry(L - 0.08, STAIR.plate, W - 0.08);
    const backLip = new THREE.BoxGeometry(0.14, 0.22, W - 0.08);
    backLip.translate(-(L / 2 - 0.1), 0.11, 0);
    const cheeks = [-1, 1].map((s) => {
      const ch = new THREE.BoxGeometry(L - 0.08, 0.34, 0.1);
      ch.translate(0, 0.15, s * (W / 2 - 0.1));
      return ch;
    });
    const pinBar = new THREE.CylinderGeometry(0.045, 0.045, W + 0.28, 14);
    pinBar.rotateX(Math.PI / 2);
    pinBar.translate(0, 0.18, 0);
    const pos: number[] = [];
    const idx: number[] = [];
    let offset = 0;
    for (const g of [floor, backLip, ...cheeks, pinBar]) {
      const p = g.getAttribute("position");
      for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
      const ix = g.getIndex();
      if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + offset);
      offset += p.count;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    merged.setIndex(idx);
    merged.computeVertexNormals();
    return merged;
  }, [L, W]);

  const mesh = useRef<THREE.InstancedMesh | null>(null);
  const edges = useRef<THREE.InstancedMesh | null>(null);
  const linksRef = useRef<THREE.InstancedMesh | null>(null);
  const sprocketsRef = useRef<(THREE.Group | null)[]>([]);
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const zero = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  const place = (tt: number) => {
    const s = stairTime(E, tt / race.fps);
    for (let k = 0; k < loop.count; k++) {
      const [x, y, z] = stairLocal(E, loop, k, s);
      const active = Math.abs(z) < 0.06 && y >= -0.65 && y <= elevator.lift + 0.45;
      const sc = active ? one : zero;
      const p = frame.at(x, y - STAIR.plate / 2, z);
      m4.compose(p, frame.plate, sc);
      mesh.current?.setMatrixAt(k, m4);
      // Hazard-gold front retention lip on the camera-facing edge of each scoop bucket
      const e = frame.at(x - (L / 2 - 0.1) * Math.cos(STAIR.tilt), y + (L / 2 - 0.1) * Math.sin(STAIR.tilt) + 0.1, z);
      m4.compose(e, frame.plate, sc);
      edges.current?.setMatrixAt(k, m4);
    }
    if (mesh.current) mesh.current.instanceMatrix.needsUpdate = true;
    if (edges.current) edges.current.instanceMatrix.needsUpdate = true;

    // Animate the vertical roller-chains along the 3 columns (left, center spine, right)
    if (linksRef.current) {
      const y0 = 0.2;
      const spanY = Math.max(1, elevator.lift + 0.4);
      const scroll = (s * 3.2) % (spanY / LINKS_PER_COL);
      let idx = 0;
      for (const cz of chainCols) {
        const cx = cz === 0 ? L / 2 - 0.06 : -(L / 2 - 0.12);
        for (let j = 0; j < LINKS_PER_COL; j++) {
          const ly = y0 + (((j / LINKS_PER_COL) * spanY + scroll) % spanY);
          const lp = frame.at(cx, ly, cz);
          m4.compose(lp, frame.yaw, one);
          linksRef.current.setMatrixAt(idx++, m4);
        }
      }
      linksRef.current.instanceMatrix.needsUpdate = true;
    }

    // Rotate toothed chain sprockets in the YZ screen plane (around local X axis)
    sprocketsRef.current.forEach((sp) => {
      if (sp) sp.rotation.x = -s * 3.5;
    });
  };
  useEffect(() => place(t));
  useEffect(() => sub.subscribe((vf) => place(view.tAt(vf))), [sub, view, race, elevator]);

  const night = isNight();
  const trussMat = night ? nightSteel : steel;
  const frontTop = Math.max(2, elevator.lift - 0.8);
  const rungCount = Math.max(3, Math.floor(frontTop / 1.6));

  return (
    <group>
      {/* Sculpted U-shaped marble scoop buckets (100% open view from the front!) */}
      <instancedMesh ref={mesh} geometry={cradleGeo} args={[undefined, undefined, loop.count]} castShadow receiveShadow frustumCulled={false}>
        <meshStandardMaterial color="#2a303d" metalness={0.85} roughness={0.24} />
      </instancedMesh>
      {/* High-contrast gold retention lip on the front edge of each scoop bucket */}
      <instancedMesh ref={edges} args={[undefined, undefined, loop.count]} frustumCulled={false}>
        <boxGeometry args={[0.14, 0.16, W - 0.1]} />
        <meshStandardMaterial color="#ffcc00" emissive="#ffaa00" emissiveIntensity={night ? 0.9 : 0.3} metalness={0.5} roughness={0.25} />
      </instancedMesh>
      {/* Animated chrome roller-chain links climbing the 3 chain columns */}
      <instancedMesh ref={linksRef} args={[undefined, undefined, LINK_COUNT]} frustumCulled={false}>
        <boxGeometry args={[0.14, 0.2, 0.28]} />
        <meshStandardMaterial {...chrome} />
      </instancedMesh>

      {/* Side & Center Roller-Chain Guide Columns */}
      {chainCols.map((cz, cIdx) => {
        const cx = cz === 0 ? L / 2 - 0.04 : -(L / 2 - 0.12);
        return (
          <group key={`col${cIdx}`}>
            <mesh position={frame.at(cx, midY, cz)} quaternion={frame.yaw} castShadow>
              <boxGeometry args={[0.08, H, 0.14]} />
              <meshStandardMaterial color="#ffcc00" metalness={0.7} roughness={0.3} />
            </mesh>
            {cz !== 0 && (
              <mesh position={frame.at(0, midY, cz + (cz < 0 ? -0.08 : 0.08))} quaternion={frame.yaw}>
                <boxGeometry args={[0.04, H, 0.04]} />
                <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={2.0} toneMapped={false} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Rear Structural Ladder Truss at +L/2 (behind the scoop buckets from the camera's perspective) */}
      {Array.from({ length: rungCount }, (_, rk) => {
        const ry = 1.2 + rk * 1.6;
        return (
          <mesh key={`rung${rk}`} position={frame.at(L / 2 + 0.12, ry, 0)} quaternion={frame.yaw}>
            <boxGeometry args={[0.08, 0.08, W + 0.12]} />
            <meshStandardMaterial {...trussMat} />
          </mesh>
        );
      })}

      {/* Rotating Toothed Chain Sprockets Facing the Camera (in the YZ plane, rotation-z = PI/2) */}
      {[1.55, 3.85, elevator.lift + 0.35].map((sy, sIdx) =>
        chainCols.map((cz, zIdx) => {
          const cx = cz === 0 ? L / 2 - 0.12 : -(L / 2 - 0.18);
          return (
            <group
              key={`sp-${sIdx}-${zIdx}`}
              ref={(el) => void (sprocketsRef.current[sIdx * chainCols.length + zIdx] = el)}
              position={frame.at(cx, sy, cz)}
              quaternion={frame.yaw}
            >
              <mesh rotation-z={Math.PI / 2} castShadow>
                <cylinderGeometry args={[0.34, 0.34, 0.08, 24]} />
                <meshStandardMaterial color="#ffcc00" metalness={0.8} roughness={0.25} />
              </mesh>
              <mesh rotation-z={Math.PI / 2}>
                <cylinderGeometry args={[0.15, 0.15, 0.12, 20]} />
                <meshStandardMaterial {...dark} />
              </mesh>
              {Array.from({ length: 8 }, (_, tk) => (
                <mesh key={tk} rotation-x={(tk / 8) * Math.PI * 2}>
                  <boxGeometry args={[0.06, 0.78, 0.09]} />
                  <meshStandardMaterial {...chrome} />
                </mesh>
              ))}
            </group>
          );
        }),
      )}

      {/* Overhead Electric Drive Motor, Gearbox & Hazard Header at the Very Top */}
      <group position={frame.at(0, elevator.lift + 0.95, 0)} quaternion={frame.yaw}>
        <mesh castShadow>
          <boxGeometry args={[L + 0.2, 0.38, W + 0.36]} />
          <meshStandardMaterial color="#181b24" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.21, 0]}>
          <boxGeometry args={[L + 0.24, 0.06, W + 0.4]} />
          <meshStandardMaterial map={tex.hazard} roughness={0.45} />
        </mesh>
      </group>

      {/* Bottom Queue Entry Plinth */}
      <mesh position={frame.at(0, -0.58, 0)} quaternion={frame.yaw} receiveShadow>
        <boxGeometry args={[L + 0.46, 0.24, W + 0.42]} />
        <meshStandardMaterial {...trussMat} />
      </mesh>
    </group>
  );
}
