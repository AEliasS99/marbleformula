import {Matrix3,Matrix4,Vector3} from 'three';
import {OBB} from 'three/examples/jsm/math/OBB.js';

// Check the whole road, including the lower finish/runoff beneath an elevated
// starting straight. Being below a pier's own span does not make it road-safe.
export function roadClearanceVolumes(samples){
 return samples.filter(s=>!s.gap).map(s=>{
  const rotation=new Matrix3().setFromMatrix4(new Matrix4().makeBasis(new Vector3(...s.t).normalize(),new Vector3(...s.n).normalize(),new Vector3(...s.r).normalize()));
  return new OBB(new Vector3(...s.p).addScaledVector(new Vector3(...s.n),.7),new Vector3(.8,.75,(s.w??2.1)+.4),rotation);
 });
}
export function sceneryBoxClearsRoad(part,road){
 const box=new OBB(new Vector3(),new Vector3(...part.size.map(x=>x/2))).applyMatrix4(new Matrix4().fromArray(part.matrix));
 const reach=box.halfSize.length()+6;
 return !road.some(r=>box.center.distanceToSquared(r.center)<reach*reach&&box.intersectsOBB(r));
}
