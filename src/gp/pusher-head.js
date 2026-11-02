import {Quaternion,Vector3,Float32BufferAttribute} from 'three';
import {ConvexGeometry} from 'three/examples/jsm/geometries/ConvexGeometry.js';
export function pusherHeadVertices(p){
 const toward=new Vector3(...p.dir).applyQuaternion(new Quaternion(...p.quat).invert()).z>0?1:-1;
 const [w,h,d]=p.size,wall=-toward*(d/2+p.travel),inner=toward*d/2;
 // Rear skirt remains in the wall throughout the stroke, closing the pocket.
 // The upstream ramp is a real vertical face directing contact into the lane.
 const outline=[[-w/2-w,wall],[-w/2,inner],[w/2,inner],[w/2,wall]];
 return new Float32Array([-h/2,h/2].flatMap(y=>outline.flatMap(([x,z])=>[x,y,z])));
}

// Picture and Rapier use the identical convex envelope. There is no invisible
// wall behind the striped head: its solid rear skirt is part of the mesh.
export function pusherHeadGeometry(p){
 const a=pusherHeadVertices(p),points=[];for(let i=0;i<a.length;i+=3)points.push(new Vector3(a[i],a[i+1],a[i+2]));
 const g=new ConvexGeometry(points),pos=g.getAttribute('position'),normal=g.getAttribute('normal'),uv=[];
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
  if(Math.abs(normal.getY(i))>.5)uv.push(x/(p.size[0]*2)+.75,z/(p.size[2]+p.travel)+.5);
  else uv.push(Math.abs(normal.getX(i))>.5?z/(p.size[2]+p.travel)+.5:x/(p.size[0]*2)+.75,y/p.size[1]+.5);
 }
 g.setAttribute('uv',new Float32BufferAttribute(uv,2));return g;
}
