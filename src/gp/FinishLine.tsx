import {useEffect, useMemo} from 'react';
import * as THREE from 'three';

type V3 = [number, number, number];
export type FinishFrame = {p: V3; t: V3; n: V3; r: V3; w?: number};
type TrackFrame = FinishFrame & {u: number};

/** Exact arc-length interpolation; sample spacing need not be 0.5 metres. */
export function finishFrameAt(samples: TrackFrame[], u: number): FinishFrame {
  if (!samples.length) throw new Error('Finish line requires a track frame.');
  if (samples.length === 1 || u <= samples[0].u) return samples[0];
  if (u >= samples.at(-1)!.u) return samples.at(-1)!;
  let low = 0, high = samples.length - 1;
  while (high - low > 1) {const mid = (low + high) >> 1; if (samples[mid].u <= u) low = mid; else high = mid;}
  const a = samples[low], b = samples[high], f = (u - a.u) / (b.u - a.u);
  const mix = (x: V3, y: V3) => x.map((v, i) => v + (y[i] - v) * f) as V3;
  return {p: mix(a.p, b.p), t: mix(a.t, b.t), n: mix(a.n, b.n), r: mix(a.r, b.r), w: (a.w ?? 2.1) + ((b.w ?? 2.1) - (a.w ?? 2.1)) * f};
}

function bannerTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 192;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#101c24'; g.fillRect(0, 0, canvas.width, canvas.height);
  for (const origin of [20, 1388]) for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
    g.fillStyle = (row + col) % 2 ? '#101c24' : '#ffffff'; g.fillRect(origin + col * 42, 12 + row * 42, 42, 42);
  }
  g.fillStyle = '#ffffff'; g.font = '900 142px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('FINISH', 768, 104);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 16; return texture;
}

/** Render-only landmark: all supports remain beyond the racing surface.
 * Local X is travel, Y is surface normal, and Z spans the circuit.
 * Legacy tracks keep their surface-conforming floor paint with floor={false}.
 */
export function FinishLine({position, tangent, normal, right, width, floor = true}: {
  position: V3; tangent: V3; normal: V3; right: V3; width: number; floor?: boolean;
}) {
  const banner = useMemo(bannerTexture, []);
  useEffect(() => () => banner.dispose(), [banner]);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...tangent).normalize(), new THREE.Vector3(...normal).normalize(), new THREE.Vector3(...right).normalize(),
  ));
  const span = width + .9, clearance = 3.2, beamHeight = .62, height = clearance + beamHeight;
  const usable = Math.max(.5, width - .34), columns = Math.max(6, Math.round(usable / .36)), cell = usable / columns;
  return <group position={position} quaternion={q}>
    {floor && <group position={[0, .018, 0]}>
      {Array.from({length: columns * 2}, (_, i) => {const row = Math.floor(i / columns), col = i % columns; return <mesh key={i} position={[(row - .5) * cell, 0, -usable / 2 + (col + .5) * cell]} rotation-x={-Math.PI / 2} rotation-z={Math.PI / 2}>
        <planeGeometry args={[cell, cell]}/><meshStandardMaterial color={(row + col) % 2 ? '#10151b' : '#ffffff'} roughness={.8} polygonOffset polygonOffsetFactor={-2} side={THREE.DoubleSide}/>
      </mesh>;})}
      {[-1, 1].map(side => <mesh key={side} position={[side * (cell + .035), 0, 0]}><boxGeometry args={[.05, .008, usable]}/><meshBasicMaterial color="#ffffff"/></mesh>)}
    </group>}
    {[-1, 1].map(side => <group key={side} position={[0, 0, side * span / 2]}>
      <mesh position={[0, height / 2, 0]} castShadow><boxGeometry args={[.16, height, .16]}/><meshStandardMaterial color="#c6d4dc" metalness={.72} roughness={.3}/></mesh>
      <mesh position={[0, .12, 0]} castShadow><boxGeometry args={[.48, .24, .36]}/><meshStandardMaterial color="#101c24" roughness={.6}/></mesh>
      <mesh position={[-.085, height / 2, 0]}><boxGeometry args={[.018, height - .4, .035]}/><meshBasicMaterial color="#8be6ca"/></mesh>
    </group>)}
    <group position={[0, clearance + beamHeight / 2, 0]}>
      <mesh castShadow><boxGeometry args={[.24, beamHeight, span + .16]}/><meshStandardMaterial color="#101c24" roughness={.42} metalness={.35}/></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * .126, 0, 0]} rotation-y={side * Math.PI / 2}>
        <planeGeometry args={[span - .05, beamHeight - .06]}/><meshBasicMaterial map={banner}/>
      </mesh>)}
      <mesh position={[0, -beamHeight / 2 - .025, 0]}><boxGeometry args={[.25, .035, span + .16]}/><meshBasicMaterial color="#8be6ca"/></mesh>
    </group>
  </group>;
}
