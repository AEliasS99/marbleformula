import {useEffect,useMemo} from 'react';
import {Vector2} from 'three';
import {grassMaps} from './surfaces';
import {buildSceneryMeshes} from './scenery-mesh.js';
import {italianTerrain,italyTerrainGeometry} from './italy-terrain.js';
import {WACHAU_PROFILE} from './wachau-layout.js';
import {wachauScenery,WACHAU_MATERIALS} from './wachau-scenery.js';
import {applyRealismSurface} from './realism-surfaces.js';
import {applyVenueSurface} from './venue-surfaces.js';
import type {Race} from './race';
export function WachauScenery({race}:{race:Race}){
 const surface=useMemo(()=>italianTerrain(race.data.samples,{profile:WACHAU_PROFILE,length:race.L}),[race]);
 const recipe=useMemo(()=>wachauScenery(race.data.samples,{length:race.L}),[race]);
 const meshes=useMemo(()=>buildSceneryMeshes(recipe.parts,WACHAU_MATERIALS,{localCoordinates:true}),[recipe]);
 const terrain=useMemo(()=>italyTerrainGeometry({positions:surface.tiles.flatMap((t:{positions:number[]})=>t.positions)},surface),[surface]);
 const maps=useMemo(()=>grassMaps(),[]);
 useEffect(()=>()=>{terrain.dispose();meshes.forEach(m=>m.geometry.dispose());},[terrain,meshes]);
 useEffect(()=>()=>{for(const t of [maps.color,maps.normal,maps.roughness])t.dispose();},[maps]);
 return <group>
  <mesh geometry={terrain} receiveShadow><meshStandardMaterial {...WACHAU_MATERIALS.hill} normalMap={maps.normal} roughnessMap={maps.roughness} normalScale={new Vector2(.32,.32)} onBeforeCompile={shader=>applyRealismSurface(shader,'ground')} customProgramCacheKey={()=>'wachau-ground-v1'}/></mesh>
  {meshes.map(m=><mesh key={m.key} geometry={m.geometry} castShadow={m.key!=='water'} receiveShadow><meshStandardMaterial {...m.material} onBeforeCompile={shader=>{
   if(m.key==='water'||m.key==='glass')return;
   if(['leaf','vine','hill','ridge','soil'].includes(m.key))applyRealismSurface(shader,'ground');
   else applyVenueSurface(shader,m.key==='wood'?'wood':m.key==='roof'?'tile':['limestone','cream','ochre','rose'].includes(m.key)?'stone':'other');
  }} customProgramCacheKey={()=>'wachau-local-v1-'+m.key}/></mesh>)}
 </group>;
}
