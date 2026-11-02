import {Vector4} from 'three';
import {waterCoverage} from './car-pace.js';
const MAX_PATCHES=16;
// No second surface: wetness is evaluated on the actual opaque road fragments.
// The physics keeps its saved pond/low-grip footprints and measured drag.
export function roadWetness(patches,u,lat){
 return Math.max(0,...patches.map(p=>p.kind==='pond'?waterCoverage(p,u,lat):
  u<=p.u0||u>=p.u1?0:Math.max(0,Math.min(1,(p.halfWidth*Math.min(1,(u-p.u0)/1.2,(p.u1-u)/1.2)+.22-Math.abs(lat-p.lat))/.44))));
}
export function applyRoadConditions(shader,patches=[]){
 if(!patches.length)return;
 if(patches.length>MAX_PATCHES)throw Error('Too many wet road zones');
 shader.uniforms.uWetCount={value:patches.length};
 shader.uniforms.uWetPatches={value:Array.from({length:MAX_PATCHES},(_,i)=>{
  const p=patches[i];return p?new Vector4(p.u0,p.u1,p.lat,p.halfWidth):new Vector4();
 })};
 shader.uniforms.uWetKinds={value:Array.from({length:MAX_PATCHES},(_,i)=>patches[i]?.kind==='pond'?1:0)};
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec3 roadCoordinates;\nvarying vec3 vRoadCoordinates;')
  .replace('#include <begin_vertex>','#include <begin_vertex>\nvRoadCoordinates = roadCoordinates;');
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
 varying vec3 vRoadCoordinates;
 uniform int uWetCount;
 uniform vec4 uWetPatches[${MAX_PATCHES}];
 uniform float uWetKinds[${MAX_PATCHES}];
 float roadWetMask(){
  float mask=0.0;
  for(int i=0;i<${MAX_PATCHES};i++){
   if(i>=uWetCount)break;
   vec4 p=uWetPatches[i];float u=vRoadCoordinates.x;
   if(u<=p.x||u>=p.y)continue;
   float t=(u-(p.x+p.y)*0.5)/((p.y-p.x)*0.5);
   float shape=uWetKinds[i]>0.5?sqrt(max(0.0,1.0-t*t)):min(1.0,min((u-p.x)/1.2,(p.y-u)/1.2));
   mask=max(mask,clamp((p.w*shape+0.22-abs(vRoadCoordinates.y-p.z))/0.44,0.0,1.0));
  }
  return mask*(1.0-smoothstep(0.01,0.06,vRoadCoordinates.z));
 }`)
 .replace('#include <color_fragment>',`#include <color_fragment>
 float roadWet=roadWetMask();
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*0.6+vec3(0.055,0.105,0.12),roadWet*0.75);`)
 .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,max(0.55,roughnessFactor*0.70),roadWet);');
}
