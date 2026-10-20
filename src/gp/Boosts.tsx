import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Quat, Race, Vec3 } from "./race";
import { useSubframe } from "./subframe";
import { useView } from "./view";

// The booster pads (glowing chevrons that scroll forward) and the distributor
// flap that sends the field to both stair bays.

type Booster = { pos: Vec3; quat: Quat; length: number; width: number };

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
  const sub = useSubframe();
  const list = ((race.data as unknown as { boosters?: Booster[] }).boosters ?? []) as Booster[];
  const tex = useMemo(() => list.map((b) => {
    const tx = chevronTexture();
    tx.repeat.set(b.length / 1.2, 1);
    return tx;
  }), [race]);
  // The arrows run forward at 6 units a second.
  const scroll = (tt: number) => tex.forEach((tx, k) => (tx.offset.x = -((tt / race.fps) * 6) / (list[k].length / tx.repeat.x)));
  scroll(t);
  useEffect(() => sub.subscribe((vf) => scroll(view.tAt(vf))), [sub, view, race, tex]);
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

type Flipper = { pos: Vec3; quat: Quat; length: number; height: number; amp: number; period: number };

/** The distributor flap on the stair bays' divider nose: it swings side to side, sending the field to both stairs. */
export function DistributorFlap({ race, t }: { race: Race; t: number }) {
  const view = useView(race);
  const sub = useSubframe();
  const fl = (race.data as unknown as { flipper?: Flipper | null }).flipper ?? null;
  const ref = useRef<THREE.Group | null>(null);
  const angle = (tt: number) => (fl ? fl.amp * Math.sin((2 * Math.PI * (tt / race.fps)) / fl.period) : 0);
  useEffect(() => sub.subscribe((vf) => ref.current?.rotation.set(0, angle(view.tAt(vf)), 0)), [sub, view, race]);
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
