import {useMemo,useEffect} from 'react';
import {buildSceneryMeshes} from './scenery-mesh.js';
import {italianTerrain,italyTerrainGeometry} from './italy-terrain.js';
import {JAIPUR_MATERIALS,JAIPUR_TERRAIN,jaipurScenery} from './jaipur-scenery.js';
import {applyVenueSurface} from './venue-surfaces.js';
import {applyRealismSurface} from './realism-surfaces.js';
import type {Race} from './race';
export function IndiaScenery({race}:{race:Race}){
 const surface=useMemo(()=>italianTerrain(race.data.samples,{profile:JAIPUR_TERRAIN,length:race.L}),[race]);
 const recipe=useMemo(()=>jaipurScenery(race.data.samples,{length:race.L}),[race]);
 const meshes=useMemo(()=>buildSceneryMeshes(recipe.parts,JAIPUR_MATERIALS,{localCoordinates:true}),[recipe]);
 const terrain=useMemo(()=>italyTerrainGeometry({positions:surface.tiles.flatMap((t:{positions:number[]})=>t.positions)},surface),[surface]);
 useEffect(()=>()=>{terrain.dispose();meshes.forEach(m=>m.geometry.dispose());},[terrain,meshes]);
 return <group>
  <mesh geometry={terrain} receiveShadow><meshStandardMaterial {...JAIPUR_MATERIALS.hill} roughness={1} onBeforeCompile={shader=>applyRealismSurface(shader,'ground')} customProgramCacheKey={()=>'jaipur-ground-v2'}/></mesh>
  {meshes.map(m=><mesh key={m.key} geometry={m.geometry} castShadow receiveShadow>
   <meshStandardMaterial {...m.material} onBeforeCompile={shader=>{
    if(['glass','leaf','flower'].includes(m.key))return;
    // Pink City facades and domes are limewashed/rendered sandstone: painting
    // the same rectangular brick grid over every dome made them look tiled.
    applyVenueSurface(shader,m.key==='wood'?'wood':['sandstone','cream'].includes(m.key)?'stone':'other');
   }} customProgramCacheKey={()=>'jaipur-local-v2-'+m.key}/>
  </mesh>)}
 </group>;
}
