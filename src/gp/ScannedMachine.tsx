import{useMemo,useEffect}from'react';import{useThree}from'@react-three/fiber';
import{TextureLoader,RepeatWrapping,SRGBColorSpace,NoColorSpace,Vector2}from'three';
import{delayRender,continueRender,cancelRender,staticFile}from'remotion';
import{craftedFinGeometry,craftedBumperGeometry}from'./crafted-machine.js';
import{applyMachineSurface}from'./machine-surfaces.js';
import type{Vec3}from'./race';
export function useMachineScan(enabled:boolean){
 const advance=useThree(s=>s.advance);
 const maps=useMemo(()=>{
  if(!enabled)return null;
  const loader=new TextureLoader();
  const [map,normalMap,roughnessMap]=['diffuse','nor_gl','rough'].map((name,i)=>{
   const handle=delayRender('Loading local scanned timber '+name);
   const texture=loader.load(staticFile('materials/tuscany/wooden-planks/'+name+'.jpg'),()=>{advance(performance.now());continueRender(handle);},undefined,error=>cancelRender(new Error('Local material map failed: '+name)));
   texture.colorSpace=i===0?SRGBColorSpace:NoColorSpace;texture.wrapS=texture.wrapT=RepeatWrapping;texture.anisotropy=16;return texture;
  });
  return{map,normalMap,roughnessMap,normalScale:new Vector2(.55,.55)};
 },[enabled,advance]);
 useEffect(()=>()=>{if(maps)for(const t of[maps.map,maps.normalMap,maps.roughnessMap])t.dispose();},[maps]);return maps;
}
type Maps=NonNullable<ReturnType<typeof useMachineScan>>;
export function CraftedFin({size,maps}:{size:Vec3;maps:Maps}){
 const pieces=useMemo(()=>craftedFinGeometry(size),[size]);useEffect(()=>()=>pieces.forEach(p=>p.geometry.dispose()),[pieces]);
 return <group>{pieces.map(p=><mesh key={p.role} geometry={p.geometry} castShadow receiveShadow>{p.role==='wood'?<meshPhysicalMaterial {...maps} color="#ffffff" roughness={.75} clearcoat={.18} clearcoatRoughness={.43} onBeforeCompile={shader=>applyMachineSurface(shader,'fin',size,true)} customProgramCacheKey={()=>'scanned-fin-v1'}/>:<meshStandardMaterial color={p.role==='brass'?'#b18a48':'#292a25'} metalness={p.role==='brass'?.83:.55} roughness={p.role==='brass'?.31:.52}/>}</mesh>)}</group>;
}
export function CraftedBumper({radius,height,maps}:{radius:number;height:number;maps:Maps}){
 const geometry=useMemo(()=>craftedBumperGeometry(radius,height),[radius,height]);useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} castShadow receiveShadow><meshPhysicalMaterial {...maps} color="#ffffff" roughness={.75} clearcoat={.14} clearcoatRoughness={.4} onBeforeCompile={shader=>applyMachineSurface(shader,'bumper',[radius*2,height,radius*2],true)} customProgramCacheKey={()=>'scanned-bumper-v1'}/></mesh>;
}
