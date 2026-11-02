import {Vector3,Quaternion,Ray,Euler} from 'three';
import {buildTrackMesh,densifyTrackSamples} from './trackMesh.js';
import {CAR_BODY_SCALE,CAR_WHEEL_LAYOUT} from './car-dimensions.js';
export {CAR_BODY_SCALE,CAR_WHEEL_LAYOUT} from './car-dimensions.js';
export function carWheelAnimationAt(frames,index,time,quaternion){
 const last=frames.length-1,f=Math.max(0,Math.min(last,Math.floor(time))),next=Math.min(last,f+1),a=Math.max(0,Math.min(1,time-f));
 const u=frames[f][index][7]+(frames[next][index][7]-frames[f][index][7])*a;
 const ahead=frames[Math.min(last,f+4)][index],q=new Quaternion(...quaternion).invert();
 const forward=new Vector3(1,0,0).applyQuaternion(new Quaternion(...ahead.slice(3,7))).applyQuaternion(q);
 const steerYaw=Math.max(-.42,Math.min(.42,-Math.atan2(forward.z,Math.max(.25,forward.x))*2.1));
 return {u,spin:-u/.135,steerYaw};
}
const steerFor=(steer,index)=>index<2?steer*((index===0&&steer>0||index===1&&steer<0)?1.14:.92):0;
function tyreProfile(style,index){
 const front=index<2,r=style===2?.146:front?.132:.144,width=style===2?.128:front?.112:.134,hw=width/2,shoulder=width*.18;
 return [[r*.92,-hw],[r,-hw+shoulder],[r,hw-shoulder],[r*.92,hw]];
}
// Support of the actual rounded tyre profile, including its shoulder/axle width.
// Circumference is continuous here; the 40-sided rendered lathe differs <0.5mm.
export function tyreSupport(normal,style,index,steer=0,spin=0){
 const n=new Vector3(...normal).multiply(new Vector3(...CAR_BODY_SCALE));
 n.applyQuaternion(new Quaternion().setFromEuler(new Euler(0,steerFor(steer,index),spin,'YZX')).invert());
 const radial=Math.hypot(n.x,n.y);
 return Math.max(...tyreProfile(style,index).map(([rr,z])=>rr*radial+z*n.z));
}
export function createCarContactSolver(samples){
 const dense=densifyTrackSamples(samples),mesh=buildTrackMesh(dense,{arcSteps:18}).parts.floor;
 const width=mesh.position.length/3/dense.length,groups=Array.from({length:dense.length-1},()=>[]);
 for(let k=0;k<mesh.index.length;k+=3){const ids=mesh.index.slice(k,k+3),row=Math.min(...ids.map(i=>Math.floor(i/width))),lat=ids.map(i=>mesh.roadCoordinates[i*3+1]);
  if(ids.some(i=>mesh.roadCoordinates[i*3+2]>.17))continue;
  groups[row]?.push({ids,lo:Math.min(...lat)-.12,hi:Math.max(...lat)+.12});
 }
 const ray=new Ray(),a=new Vector3(),b=new Vector3(),c=new Vector3(),hit=new Vector3();
 const rowAt=u=>{let lo=0,hi=dense.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(dense[m].u<=u)lo=m;else hi=m;}return lo;};
 function surface(center,up,u){
  const row=rowAt(u),s=dense[row],lat=new Vector3(...center).sub(new Vector3(...s.p)).dot(new Vector3(...s.r));
  ray.origin.fromArray(center).addScaledVector(up,.8);ray.direction.copy(up).negate();let best=null,dist=Infinity;
  for(let k=Math.max(0,row-5);k<=Math.min(groups.length-1,row+5);k++)for(const face of groups[k]){
   if(lat<face.lo||lat>face.hi)continue;const ids=face.ids;
   a.fromArray(mesh.position,ids[0]*3);b.fromArray(mesh.position,ids[1]*3);c.fromArray(mesh.position,ids[2]*3);
   if(!ray.intersectTriangle(a,b,c,false,hit))continue;
   const distance=hit.distanceTo(ray.origin);if(distance>1.6||distance>=dist)continue;
   const normal=new Vector3().subVectors(b,a).cross(new Vector3().subVectors(c,a)).normalize();if(normal.dot(up)<0)normal.negate();
   if(normal.dot(up)<.35)continue;dist=distance;best={point:hit.clone(),normal};
  }
  return best;
 }
 function solve(pose,u,style,animation={steerYaw:0,spin:0}){
  const row=rowAt(u);if(dense[row].gap)return {...pose,contactStatus:'gap'};
  const q=new Quaternion(...pose.quat).normalize(),inverse=q.clone().invert(),up=new Vector3(0,1,0).applyQuaternion(q),origin=new Vector3(...pose.pos);
  const wheels=CAR_WHEEL_LAYOUT.map((local,index)=>{
   const center=new Vector3(...local).multiply(new Vector3(...CAR_BODY_SCALE)).applyQuaternion(q).add(origin);
   const along=center.clone().sub(origin).dot(new Vector3(...dense[row].t)),road=surface(center.toArray(),up,u+along);
   if(!road)return null;
   const n=road.normal.clone().applyQuaternion(inverse),support=tyreSupport(n.toArray(),style,index,animation.steerYaw,animation.spin);
   const gap=center.clone().sub(road.point).dot(road.normal)-support;
   // Refine on the actual discretized tyre profile against the swept road,
   // including bank changes and the raised fillet under an outside shoulder.
   const rotation=new Quaternion().setFromEuler(new Euler(0,steerFor(animation.steerYaw,index),animation.spin,'YZX'));
   const localNormal=n.clone().multiply(new Vector3(...CAR_BODY_SCALE)).applyQuaternion(rotation.clone().invert());
   const step=Math.PI*2/40,angle=Math.atan2(-localNormal.y,-localNormal.x),start=Math.floor((angle+Math.PI/2)/step);
   let delta=-Infinity;const angles=new Set([start-1,start,start+1,start+2]);
   for(const k of angles)for(const [radius,z]of tyreProfile(style,index)){
    const theta=-Math.PI/2+k*step,point=new Vector3(radius*Math.cos(theta),radius*Math.sin(theta),z).applyQuaternion(rotation).multiply(new Vector3(...CAR_BODY_SCALE)).applyQuaternion(q).add(center);
    const contact=surface(point.toArray(),up,u+along);if(contact){
     delta=Math.max(delta,-point.clone().sub(contact.point).dot(up));
     // A shoulder can sit on a steeper fillet than the axle centre. Probe its
     // own support direction as well, without scanning the entire tyre mesh.
     const n=contact.normal.clone().applyQuaternion(inverse).multiply(new Vector3(...CAR_BODY_SCALE)).applyQuaternion(rotation.clone().invert());
     const nearest=Math.floor((Math.atan2(-n.y,-n.x)+Math.PI/2)/step);
     if(angles.size<12){angles.add(nearest);angles.add(nearest+1);}
    }
   }
   return {index,gap,delta:Number.isFinite(delta)?delta:-gap/road.normal.dot(up)};
  });
  if(wheels.some(w=>!w))return {...pose,contactStatus:'no-surface'};
  const shift=wheels.reduce((sum,w)=>sum+w.delta,0)/4;
  // Preserve real airborne trajectories rather than pinning jumps to the road.
  if(shift<-.30||shift>.18)return {...pose,contactStatus:'airborne',gaps:wheels.map(w=>w.gap)};
  const pos=origin.addScaledVector(up,shift).toArray(),wheelY=wheels.map((w,i)=>CAR_WHEEL_LAYOUT[i][1]+(w.delta-shift)/CAR_BODY_SCALE[1]);
  return {...pose,pos,wheelY,contactStatus:'grounded',bodyShift:shift,gaps:wheels.map(w=>w.gap),suspension:wheels.map(w=>w.delta-shift)};
 }
 return {solve,surface};
}
