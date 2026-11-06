import column from './assets/italian-column-v1.json' with {type:'json'};
import {BufferGeometry,Float32BufferAttribute,Matrix4,Quaternion,Euler,Vector3,SRGBColorSpace} from 'three';

// Reusable decoration only. Nothing here adds a racing collider or changes motion.
export const AI_COLUMN='italian-column-v1';
export function configureAiPropTexture(texture){
 // Exact GLB UV/PNG convention, matching GLTFLoader. TextureLoader defaults
 // to flipped images, which misregistered the first native inspection.
 texture.flipY=false;texture.colorSpace=SRGBColorSpace;texture.anisotropy=16;return texture;
}
export function aiPropGeometry(id){
 if(id!==AI_COLUMN)throw Error('Unknown AI scene prop: '+id);
 const g=new BufferGeometry();
 g.setAttribute('position',new Float32BufferAttribute(column.positions,3));
 g.setAttribute('uv',new Float32BufferAttribute(column.uv,2));
 g.setIndex(column.indices);g.computeVertexNormals();g.computeBoundingBox();return g;
}
export function aiPropMatrix(p){
 if(p.geometryId!==AI_COLUMN||!Array.isArray(p.pos)||p.pos.length!==3||!p.pos.every(Number.isFinite)||!Number.isFinite(p.yaw)||!Number.isFinite(p.height)||p.height<=0||p.height>12)throw Error('Invalid AI scene prop placement');
 return new Matrix4().compose(new Vector3(...p.pos),new Quaternion().setFromEuler(new Euler(0,p.yaw,0)),new Vector3(p.height,p.height,p.height));
}
export function aiColumnRecord(pos,height=3,yaw=0){
 const p={geometryId:AI_COLUMN,pos,height,yaw};aiPropMatrix(p);return p;
}
// Conservative all-elevation road exclusion: decoration must not intrude into
// a lower/upper racing surface or its camera/guard margin.
export function assertAiPropRoadClearance(props,samples,margin=1){
 for(const prop of props){
  const g=aiPropGeometry(prop.geometryId),box=g.boundingBox.clone().applyMatrix4(aiPropMatrix(prop));g.dispose();
  const centre=box.getCenter(new Vector3()),radius=Math.hypot(box.max.x-box.min.x,box.max.z-box.min.z)/2;
  for(let i=1;i<samples.length;i++){
   const a=samples[i-1],b=samples[i],dx=b.p[0]-a.p[0],dz=b.p[2]-a.p[2],den=dx*dx+dz*dz;
   const k=den?Math.max(0,Math.min(1,((centre.x-a.p[0])*dx+(centre.z-a.p[2])*dz)/den)):0;
   const distance=Math.hypot(centre.x-a.p[0]-k*dx,centre.z-a.p[2]-k*dz);
   if(distance<radius+Math.max(a.w??2.1,b.w??2.1)+margin)throw Error('AI decoration overlaps the racing-road exclusion');
  }
 }
}
