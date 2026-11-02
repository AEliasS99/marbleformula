import {useEffect,useMemo} from 'react';
import {buildSpainMeshes} from './spain-mesh.js';
import type {Race} from './race';
// Dense detail shares primitive transforms with camera QA; merge by material
// for a small number of draw calls within the existing production Stage.
export function SpainScenery({race}:{race:Race}){
 const meshes=useMemo(()=>buildSpainMeshes(race.data.samples),[race]);
 useEffect(()=>()=>meshes.forEach(m=>m.geometry.dispose()),[meshes]);
 return <group>{meshes.map(m=><mesh key={m.key} geometry={m.geometry} castShadow receiveShadow><meshStandardMaterial {...m.material}/></mesh>)}</group>;
}
