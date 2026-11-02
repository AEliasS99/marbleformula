import {useMemo} from 'react';
import * as THREE from 'three';
import {sydneyScenery,sydneyGeometry,SYDNEY_MATERIALS} from './sydney-scenery.js';
import type {Race} from './race';

export function SydneyScenery({race}:{race:Race}){
 const meshes=useMemo(()=>{
  const materials=Object.fromEntries(Object.entries(SYDNEY_MATERIALS).map(([key,spec])=>{
   const {basic,intensity,...props}=spec as any;
   return [key,basic?new THREE.MeshBasicMaterial({color:new THREE.Color(props.color).multiplyScalar(intensity),toneMapped:false}):new THREE.MeshStandardMaterial(props)];
  }));
  return sydneyScenery(race.data.samples).parts.map(p=>({geometry:sydneyGeometry(p).applyMatrix4(new THREE.Matrix4().fromArray(p.matrix)),material:materials[p.material]}));
 },[race]);
 return <group>{meshes.map((p,i)=><mesh key={i} geometry={p.geometry} material={p.material}/>)}</group>;
}
