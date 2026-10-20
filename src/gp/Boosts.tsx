import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Quat, Race, Vec3 } from "./race";
import { subframe } from "./subframe";
import { useView } from "./view";
import { SWITCH, switchState } from "./obstacles/switch.js";
import { TRACK } from "./trackMesh.js";

// The booster pads (glowing chevrons that scroll forward) and the switch
// (two half-width bars that rise and sink in turn, with a gantry of lights:
// green over the open half, red over the closed one).

type Booster = { pos: Vec3; quat: Quat; length: number; width: number };
type Switch = { u: number; quat: Quat; halves: Vec3[]; up: Vec3; size: Vec3; period: number; phase: number };

function chevronTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#06121c";
  g.fillRect(0, 0, 256, 256);
  // Arrows pointing +x (along the track): two chevrons per tile.
  for (let k = 0; k < 2; k++) {
    const x0 = 20 + k * 128;
    const grad = g.createLinearGradient(x0, 0, x0 + 90, 0);
    grad.addColorStop(0, "#00e5ff");
    grad.addColorStop(1, "#ff2bd6");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x0, 30);
    g.lineTo(x0 + 40, 30);
    g.lineTo(x0 + 92, 128);
    g.lineTo(x0 + 40, 226);
    g.lineTo(x0, 226);
    g.lineTo(x0 + 52, 128);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

export function Boosters({ race, t }: { race: Race; t: number }) {
  const view = useView(race);
  const list = ((race.data as unknown as { boosters?: Booster[] }).boosters ?? []) as Booster[];
  const tex = useMemo(() => list.map((b) => {
    const tx = chevronTexture();
    tx.repeat.set(b.length / 1.2, 1);
    return tx;
  }), [race]);
  // The arrows run forward at 6 units a second.
  const scroll = (tt: number) => tex.forEach((tx, k) => (tx.offset.x = -((tt / race.fps) * 6) / (list[k].length / tx.repeat.x)));
  scroll(t);
  useEffect(() => subframe.subscribe((vf) => scroll(view.tAt(vf))), [race]);
  return (
    <>
      {list.map((b, i) => (
        <group key={i} position={b.pos} quaternion={b.quat}>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
            <planeGeometry args={[b.length, b.width]} />
            <meshStandardMaterial map={tex[i]} emissive="#ffffff" emissiveMap={tex[i]} emissiveIntensity={2.6} roughness={0.35} polygonOffset polygonOffsetFactor={-2} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  );
}

export function Switches({ race, t }: { race: Race; t: number }) {
  const view = useView(race);
  const list = ((race.data as unknown as { switches?: Switch[] }).switches ?? []) as Switch[];
  const barRefs = useRef<(THREE.Mesh | null)[]>([]);
  const lampRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const stripes = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d")!;
    for (let k = 0; k < 8; k++) {
      g.fillStyle = k % 2 ? "#111216" : "#ffcc00";
      g.beginPath();
      g.moveTo(k * 32, 0);
      g.lineTo(k * 32 + 32, 0);
      g.lineTo(k * 32 + 16, 64);
      g.lineTo(k * 32 - 16, 64);
      g.fill();
    }
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = THREE.RepeatWrapping;
    tx.repeat.set(3, 1);
    return tx;
  }, []);
  const apply = (tt: number) => {
    const s = tt / race.fps;
    list.forEach((sw, k) => {
      const st = switchState(sw, s);
      st.forEach((up, h) => {
        const d = -SWITCH.sink * (1 - up);
        const m = barRefs.current[k * 2 + h];
        m?.position.set(sw.halves[h][0] + sw.up[0] * d, sw.halves[h][1] + sw.up[1] * d, sw.halves[h][2] + sw.up[2] * d);
        const lamp = lampRefs.current[k * 2 + h];
        if (lamp) {
          lamp.color.set(up > 0.5 ? "#ff2a2a" : "#20ff6a");
          lamp.emissive.set(up > 0.5 ? "#ff1a1a" : "#10ff50");
        }
      });
    });
  };
  useEffect(() => subframe.subscribe((vf) => apply(view.tAt(vf))), [race]);
  useEffect(() => apply(t));
  const W = TRACK.width / 2;
  return (
    <>
      {list.map((sw, k) => {
        const mid: Vec3 = [(sw.halves[0][0] + sw.halves[1][0]) / 2, (sw.halves[0][1] + sw.halves[1][1]) / 2, (sw.halves[0][2] + sw.halves[1][2]) / 2];
        return (
          <group key={k}>
            {sw.halves.map((p, h) => (
              <mesh key={h} ref={(el) => void (barRefs.current[k * 2 + h] = el)} position={p} quaternion={sw.quat} castShadow>
                <boxGeometry args={sw.size} />
                <meshStandardMaterial map={stripes} roughness={0.4} metalness={0.2} />
              </mesh>
            ))}
            {/* The gantry over the track: a beam on two posts, a lamp over each half. */}
            <group position={mid} quaternion={sw.quat}>
              <mesh position={[0, 2.4 - sw.size[1] / 2, 0]} castShadow>
                <boxGeometry args={[0.22, 0.22, 2 * W + 1.0]} />
                <meshStandardMaterial color="#2b2e35" metalness={0.7} roughness={0.35} />
              </mesh>
              {[-1, 1].map((e) => (
                <mesh key={e} position={[0, 1.2 - sw.size[1] / 2, e * (W + 0.45)]} castShadow>
                  <boxGeometry args={[0.16, 2.5, 0.16]} />
                  <meshStandardMaterial color="#2b2e35" metalness={0.7} roughness={0.35} />
                </mesh>
              ))}
              {[-1, 1].map((e, h) => (
                <mesh key={`l${e}`} position={[0, 2.18 - sw.size[1] / 2, (e * W) / 2]}>
                  <boxGeometry args={[0.24, 0.16, 0.9]} />
                  <meshStandardMaterial ref={(el) => void (lampRefs.current[k * 2 + h] = el)} color="#20ff6a" emissive="#10ff50" emissiveIntensity={5} toneMapped={false} />
                </mesh>
              ))}
            </group>
          </group>
        );
      })}
    </>
  );
}

type Flipper = { pos: Vec3; quat: Quat; length: number; height: number; amp: number; period: number };

/** The distributor flap on the stair bays' divider nose: it swings side to side, sending the field to both stairs. */
export function DistributorFlap({ race, t }: { race: Race; t: number }) {
  const view = useView(race);
  const fl = (race.data as unknown as { flipper?: Flipper | null }).flipper ?? null;
  const ref = useRef<THREE.Group | null>(null);
  const angle = (tt: number) => (fl ? fl.amp * Math.sin((2 * Math.PI * (tt / race.fps)) / fl.period) : 0);
  useEffect(() => subframe.subscribe((vf) => ref.current?.rotation.set(0, angle(view.tAt(vf)), 0)), [race]);
  if (!fl) return null;
  return (
    <group position={fl.pos} quaternion={fl.quat}>
      <group ref={ref} rotation={[0, angle(t), 0]}>
        <mesh position={[-fl.length / 2, 0, 0]} castShadow>
          <boxGeometry args={[fl.length, fl.height, 0.12]} />
          <meshStandardMaterial color="#ffcc00" roughness={0.35} metalness={0.3} />
        </mesh>
        <mesh position={[-fl.length / 2, fl.height / 2 + 0.03, 0]}>
          <boxGeometry args={[fl.length, 0.05, 0.14]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffcc00" emissiveIntensity={2.5} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 1.2, 24]} />
        <meshStandardMaterial color="#2b2e35" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}
