import {BufferGeometry,Float32BufferAttribute} from 'three';
import {pointOnTrack} from './trackMesh.js';
// New long/short lanes follow the actual road surface and banking. A flat
// rectangle at the midpoint can float or leave the road on a long curve.
export function boostLaneGeometry(samples,lane){
 const at=u=>{let lo=0,hi=samples.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(samples[m].u<=u)lo=m;else hi=m;}
  const a=samples[lo],b=samples[hi],f=Math.max(0,Math.min(1,(u-a.u)/(b.u-a.u)));
  return {p:a.p.map((v,i)=>v+(b.p[i]-v)*f),n:a.n.map((v,i)=>v+(b.n[i]-v)*f),r:a.r.map((v,i)=>v+(b.r[i]-v)*f)};};
 const positions=[],uv=[],indices=[],rows=Math.max(2,Math.ceil(lane.length/.5));
 for(let i=0;i<=rows;i++){const u=lane.u0+(lane.u1-lane.u0)*i/rows,fr=at(u);
  for(const side of [-1,1]){positions.push(...pointOnTrack(fr,lane.latCenter+side*lane.width/2,.035));uv.push(i/rows,side<0?0:1);}
  if(i<rows){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
