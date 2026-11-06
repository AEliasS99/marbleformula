import {useMemo,useEffect} from 'react';
import {useThree} from '@react-three/fiber';
import {TextureLoader,RepeatWrapping,SRGBColorSpace,NoColorSpace,Vector2} from 'three';
import {delayRender,continueRender,cancelRender,staticFile} from 'remotion';
import {aiMaterialFiles} from './ai-materials.js';

export function useAiSurface(profile:string|undefined,kind:string,enabled=true){
 const advance=useThree(s=>s.advance);
 const maps=useMemo(()=>{
  const files=enabled?aiMaterialFiles(profile,kind):null;
  if(!files)return null;
  const loader=new TextureLoader();
  const [map,normalMap,roughnessMap]=[files.basecolor,files.normal,files.roughness].map((file,i)=>{
   const hold=delayRender('Loading AI-assisted surface '+kind+' map'+i);
   const texture=loader.load(staticFile(file),()=>{advance(performance.now());continueRender(hold);},undefined,()=>cancelRender(new Error('AI-assisted material missing or unreadable: '+kind+' map'+i)));
   texture.colorSpace=i===0?SRGBColorSpace:NoColorSpace;
   texture.wrapS=texture.wrapT=RepeatWrapping;texture.anisotropy=16;return texture;
  });
  return {map,normalMap,roughnessMap,normalScale:new Vector2(1,1),metalness:kind==='bronze'?.94:0};
 },[profile,kind,enabled,advance]);
 useEffect(()=>()=>{if(maps)for(const texture of [maps.map,maps.normalMap,maps.roughnessMap])texture.dispose();},[maps]);
 return maps;
}
