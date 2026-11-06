import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Quat, Race, Vec3 } from "./race";
import { useSubframe } from "./subframe";
import { useView } from "./view";
import {boostAppearance} from './race-action-profile.js';
import {boostLaneGeometry} from './boost-lanes.js';
import {craftedVenue} from './crafted-venue.js';

// The booster pads (glowing chevrons that scroll forward) and the distributor
// flap that sends the field to both stair bays.

type Booster = { pos: Vec3; quat: Quat; length: number; width: number; u0:number;u1:number;latCenter:number;tier?:string };

function chevronTexture(lane:Booster,venue=false) {
  const base=boostAppearance(lane);
  const style=venue?{...base,color:lane.tier==='surge'?'#8ea884':lane.tier==='nitro'?'#b97450':'#c8a45a',accent:'#ead9aa'}:base;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = venue?"#293f35":"#06121c";
  g.fillRect(0, 0, 256, 256);
  // Arrows pointing +x (along the track): two chevrons per tile.
  for (let k = 0; k < 2; k++) {
    const x0 = 20 + k * 128;
    const grad = g.createLinearGradient(x0, 0, x0 + 90, 0);
    grad.addColorStop(0, style.color);
    grad.addColorStop(1, style.accent);
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
  if(lane.tier||venue){
    g.strokeStyle=style.color;g.lineWidth=5;g.strokeRect(2,3,252,250);
    g.fillStyle='#b6c3c9';for(const y of [12,244])for(const x of [10,74,138,202])g.fillRect(x,y,18,2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  return t;
}

export function Boosters({ race, t }: { race: Race; t: number }) {
  const venue = craftedVenue(race.data);
  const view = useView(race);
  const sub = useSubframe();
  const list = ((race.data as unknown as { boosters?: Booster[] }).boosters ?? []) as Booster[];
  const tex = useMemo(() => list.map((b) => {
    const tx = chevronTexture(b,venue);
    tx.repeat.set(b.length / 1.2, 1);
    return tx;
  }), [race,venue]);
  const geometry=useMemo(()=>list.map(b=>b.tier?boostLaneGeometry(race.data.samples,b):null),[race]);
  useEffect(()=>()=>{tex.forEach(t=>t.dispose());geometry.forEach(g=>g?.dispose());},[tex,geometry]);
  // The arrows run forward at 6 units a second.
  const scroll = (tt: number) => tex.forEach((tx, k) => (tx.offset.x = -((tt / race.fps) * boostAppearance(list[k]).scroll) / (list[k].length / tx.repeat.x)));
  scroll(t);
  useEffect(() => sub.subscribe((vf) => scroll(view.tAt(vf))), [sub, view, race, tex]);
  return (
    <>
      {list.map((b, i) => (
        geometry[i]?<mesh key={i} geometry={geometry[i]!}>
          <meshStandardMaterial map={tex[i]} emissive="#ffffff" emissiveMap={tex[i]} emissiveIntensity={venue?.08:1.35} roughness={venue?.78:.48} polygonOffset polygonOffsetFactor={-2}/>
        </mesh>:<group key={i} position={b.pos} quaternion={b.quat}>
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
            <planeGeometry args={[b.length, b.width]} />
            <meshStandardMaterial map={tex[i]} emissive="#ffffff" emissiveMap={tex[i]} emissiveIntensity={venue?.08:2.6} roughness={venue?.78:.35} polygonOffset polygonOffsetFactor={-2} toneMapped={venue} />
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
