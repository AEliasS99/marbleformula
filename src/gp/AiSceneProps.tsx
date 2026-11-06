import {useMemo,useEffect} from 'react';
import {TextureLoader} from 'three';
import {delayRender,continueRender,cancelRender,staticFile} from 'remotion';
import {useThree} from '@react-three/fiber';
import {aiPropGeometry,aiPropMatrix,assertAiPropRoadClearance,configureAiPropTexture} from './ai-scene-props.js';
import type {Race} from './race';

export type AiProp={geometryId:string;pos:number[];height:number;yaw:number};
function Column({prop}:{prop:AiProp}){
 const advance=useThree(s=>s.advance);
 const geometry=useMemo(()=>aiPropGeometry(prop.geometryId),[prop.geometryId]);
 const matrix=useMemo(()=>aiPropMatrix(prop),[prop]);
 const map=useMemo(()=>{
  const hold=delayRender('Loading carved Italian column');
  const texture=new TextureLoader().load(staticFile('props/ai/italian-column-v1/basecolor.png'),()=>{advance(performance.now());continueRender(hold);},undefined,()=>cancelRender(new Error('Missing carved-column colour map')));
  // UVs and the embedded PNG were extracted unchanged from GLB. glTF uses
  // unflipped images; TextureLoader's default flip corrupts the appearance.
  return configureAiPropTexture(texture);
 },[advance]);
 useEffect(()=>()=>{geometry.dispose();},[geometry]);
 useEffect(()=>()=>{map.dispose();},[map]);
 // TRELLIS colour is baked appearance, not measured PBR. Roughness is authored.
 return <mesh geometry={geometry} matrix={matrix} matrixAutoUpdate={false} castShadow receiveShadow><meshStandardMaterial map={map} roughness={.84} metalness={0}/></mesh>;
}
export function AiSceneProps({race}:{race:Race}){
 const props=(race.data as unknown as {sceneProps?:AiProp[]}).sceneProps;
 useMemo(()=>{if(props?.length)assertAiPropRoadClearance(props,race.data.samples);},[props,race.data.samples]);
 return <group>{props?.map((p,i)=><Column key={i} prop={p}/>)}</group>;
}
