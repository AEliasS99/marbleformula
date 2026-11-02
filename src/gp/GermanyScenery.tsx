import {useEffect,useMemo} from 'react';
import {buildSceneryMeshes} from './scenery-mesh.js';
import {germanScenery,GERMANY_MATERIALS} from './germany-scenery.js';
import {italianTerrain as regionalTerrain,italyTerrainGeometry as terrainGeometry} from './italy-terrain.js';
import type {BufferGeometry} from 'three';
import type {Race} from './race';
import {realismMaterials} from './visual-realism.js';
import {applyRealismSurface} from './realism-surfaces.js';
export function GermanyScenery({race}:{race:Race}){
 const realistic=realismMaterials(race.data);
 const surface=useMemo(()=>regionalTerrain(race.data.samples),[race]);
 const meshes=useMemo(()=>buildSceneryMeshes(germanScenery(race.data.samples).parts,GERMANY_MATERIALS),[race]);
 const terrain=useMemo<BufferGeometry[]>(()=>surface.tiles.map((tile:{positions:number[]})=>terrainGeometry(tile,realistic?surface:undefined)),[race,realistic,surface]);
 useEffect(()=>()=>{meshes.forEach(m=>m.geometry.dispose());terrain.forEach(g=>g.dispose());},[meshes,terrain]);
 return <group>{terrain.map((geometry,i)=><mesh key={'terrain-'+i} geometry={geometry} receiveShadow><meshStandardMaterial {...GERMANY_MATERIALS.hill} onBeforeCompile={shader=>{if(realistic)applyRealismSurface(shader,'ground');}} customProgramCacheKey={()=>realistic?'natural-ground-v1':'legacy-ground'}/></mesh>)}{meshes.map(m=><mesh key={m.key} geometry={m.geometry} castShadow receiveShadow><meshStandardMaterial {...m.material} onBeforeCompile={shader=>{if(realistic&&!['glass','red','white','green','gold','black','navy','clock','hand'].includes(m.key))applyRealismSurface(shader,['leaf','hedge','pine','cypress','vine'].includes(m.key)?'ground':'stone');}} customProgramCacheKey={()=>realistic?'natural-surface-v1-'+m.key:'legacy-surface'}/></mesh>)}</group>;
}
