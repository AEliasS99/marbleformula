import {useEffect,useMemo} from 'react';
import {buildSceneryMeshes} from './scenery-mesh.js';
import {britishScenery,BRITAIN_MATERIALS} from './britain-scenery.js';
import {italianTerrain as regionalTerrain,italyTerrainGeometry as terrainGeometry} from './italy-terrain.js';
import type {BufferGeometry} from 'three';
import type {Race} from './race';
import {realismMaterials} from './visual-realism.js';
import {applyRealismSurface} from './realism-surfaces.js';
export function BritainScenery({race}:{race:Race}){
 const realistic=realismMaterials(race.data);
 const detailed=realistic||(race.data.info as {sceneryProfile?:string}).sceneryProfile==='cotswold-rich-v2';
 const surface=useMemo(()=>regionalTerrain(race.data.samples),[race]);
 const meshes=useMemo(()=>buildSceneryMeshes(britishScenery(race.data.samples,{profile:(race.data.info as {sceneryProfile?:string}).sceneryProfile}).parts,BRITAIN_MATERIALS),[race]);
 const terrain=useMemo<BufferGeometry[]>(()=>surface.tiles.map((tile:{positions:number[]})=>terrainGeometry(tile,realistic?surface:undefined)),[race,realistic,surface]);
 useEffect(()=>()=>{meshes.forEach(m=>m.geometry.dispose());terrain.forEach(g=>g.dispose());},[meshes,terrain]);
 return <group>{terrain.map((geometry,i)=><mesh key={'terrain-'+i} geometry={geometry} receiveShadow><meshStandardMaterial {...BRITAIN_MATERIALS.hill} onBeforeCompile={shader=>{if(detailed)applyRealismSurface(shader,'ground');}} customProgramCacheKey={()=>detailed?'detailed-ground-v1':'legacy-ground'}/></mesh>)}{meshes.map(m=><mesh key={m.key} geometry={m.geometry} castShadow receiveShadow><meshStandardMaterial {...m.material} onBeforeCompile={shader=>{if(detailed&&!['glass','red','white','green','gold','black','navy','clock','hand'].includes(m.key))applyRealismSurface(shader,['leaf','hedge','ridge','pine','cypress','vine'].includes(m.key)?'ground':'stone');}} customProgramCacheKey={()=>detailed?'detailed-surface-v1-'+m.key:'legacy-surface'}/></mesh>)}</group>;
}
