import {useEffect,useMemo} from 'react';
import {buildSceneryMeshes} from './scenery-mesh.js';
import {colombianScenery,COLOMBIA_MATERIALS} from './colombia-scenery.js';
import type {Race} from './race';
export function ColombiaScenery({race}:{race:Race}){
 const meshes=useMemo(()=>buildSceneryMeshes(colombianScenery(race.data.samples).parts,COLOMBIA_MATERIALS),[race]);
 useEffect(()=>()=>meshes.forEach(m=>m.geometry.dispose()),[meshes]);
 return <group>{meshes.map(m=><mesh key={m.key} geometry={m.geometry} castShadow receiveShadow><meshStandardMaterial {...m.material}/></mesh>)}</group>;
}
