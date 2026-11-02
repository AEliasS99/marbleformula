import {DataTexture,RGBAFormat,UnsignedByteType,LinearFilter,ClampToEdgeWrapping,Vector4,Color} from 'three';
const palette=Object.fromEntries(Object.entries({vineyard:'#4a6535',olive:'#596b3a',meadow:'#4b6435',wheat:'#8e7b46',lane:'#97805b',garden:'#627544',earth:'#635b38'}).map(([k,v])=>[k,new Color(v).toArray()]));
const distance=(x,z,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);};
// One low-frequency terrain atlas from actual layout data. A single filtered
// lookup avoids hundreds of field/path uniforms and shader loop compilation.
export function landscapeGroundTexture(plan,size=512){
 const settlements=[...plan.sites,...plan.neighborhoods];
 const b=plan.bounds,bytes=new Uint8Array(size*size*4),smooth=(a,c,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(c-a)));return t*t*(3-2*t);};
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){
  const x=b.minX+(i+.5)/size*(b.maxX-b.minX),z=b.minZ+(j+.5)/size*(b.maxZ-b.minZ);let best=Infinity,parcel=null;
  for(const p of plan.parcels){const d=(x-p.x)**2+(z-p.z)**2;if(d<best){best=d;parcel=p;}}
  let color=[...palette.meadow];
  if(parcel&&best<35**2){
   const dx=x-parcel.x,dz=z-parcel.z,qx=Math.cos(parcel.yaw)*dx-Math.sin(parcel.yaw)*dz,qz=Math.sin(parcel.yaw)*dx+Math.cos(parcel.yaw)*dz;
   const mask=1-smooth(8,11.5,Math.max(Math.abs(qx),Math.abs(qz))),c=palette[parcel.kind];
   color=color.map((v,k)=>v+(c[k]-v)*mask*.94);
   if(parcel.kind==='vineyard'){
    const rowDist=Math.abs(((qx/2.7+.5)%1+1)%1-.5)*2.7,row=(1-smooth(.3,.65,rowDist))*mask;
    color=color.map((v,k)=>v+(palette.earth[k]-v)*row*.6);
   }
  }
  let lane=0;
  for(const p of plan.paths)lane=Math.max(lane,1-smooth(p.width*.65,p.width+1,distance(x,z,p.a,p.b)));
  let garden=0;for(const p of settlements)garden=Math.max(garden,1-smooth(6*p.scale,10*p.scale,Math.hypot(x-p.x,z-p.z)));
  color=color.map((v,k)=>v+(palette.garden[k]-v)*garden*.7);
  color=color.map((v,k)=>v+(palette.lane[k]-v)*lane*.90);
  const n=4*(j*size+i);for(let k=0;k<3;k++)bytes[n+k]=Math.round(Math.max(0,Math.min(1,color[k]))*255);bytes[n+3]=255;
 }
 const texture=new DataTexture(bytes,size,size,RGBAFormat,UnsignedByteType);texture.magFilter=LinearFilter;texture.minFilter=LinearFilter;texture.wrapS=texture.wrapT=ClampToEdgeWrapping;texture.generateMipmaps=false;texture.needsUpdate=true;
 return {texture,bounds:new Vector4(b.minX,b.minZ,b.maxX-b.minX,b.maxZ-b.minZ)};
}
export function applyLandscapeGround(shader,map){
 shader.uniforms.venueLandscape={value:map.texture};shader.uniforms.venueLandscapeBounds={value:map.bounds};
 shader.fragmentShader='uniform sampler2D venueLandscape;uniform vec4 venueLandscapeBounds;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec2 landUV=(vRealismSurface.xz-venueLandscapeBounds.xy)/venueLandscapeBounds.zw;
 float landInside=step(0.,landUV.x)*step(0.,landUV.y)*step(landUV.x,1.)*step(landUV.y,1.);
 vec3 landColor=texture2D(venueLandscape,landUV).rgb;
 diffuseColor.rgb=mix(diffuseColor.rgb,landColor*(.92+.14*realismNoise(vRealismSurface*.2)),landInside*.90);
 `);
}
