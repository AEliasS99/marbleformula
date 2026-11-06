import {buildChallengeRibs} from './challenge-ribs.js';
import {Vector3,Box3,BufferGeometry,Float32BufferAttribute,Matrix4,Quaternion} from 'three';
import {frameQuat,pointInFrame,quatArr,r3} from './kit.js';
export const RAISED_CHOICE={length:22,rise:2.4,step:.5,lo:-.82,hi:2.02};
export const FORK_INTAKE_BEFORE = 11;
const height=u=>RAISED_CHOICE.rise*Math.sin(Math.PI*u/RAISED_CHOICE.length)**2;
export function raisedChoicePlan(side=1){
 const C=RAISED_CHOICE,points=Array.from({length:45},(_,i)=>[i*C.step,.6*side,height(i*C.step)]);
 return {type:'route-choice',topology:'raised-main-v1',length:C.length,side,
  routes:[{id:'shortcut',clearWidth:1.12,points:[[0,-1.54*side,0],[22,-1.54*side,0]]},
   {id:'main',clearWidth:C.hi-C.lo,points}],railHeight:1.4};
}
export const DECK_INDICES=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,4,1,5,4,1,2,5,2,6,5,2,3,6,3,7,6,3,0,7,0,4,7].flatMap((_,i,a)=>i%3===0?[a[i],a[i+2],a[i+1]]:[]);
export function challengeDeckGeometry(record){
 const base=new BufferGeometry();base.setAttribute('position',new Float32BufferAttribute(record.vertices,3));base.setIndex(record.indices);
 const geometry=base.toNonIndexed();base.dispose();geometry.computeVertexNormals();geometry.computeBoundingBox();return geometry;
}

// Follow the outside of the approach bend, then guide arrivals gently away
// from the wall before the fork. The existing timber fin is both the visible
// surface and the collider. Arrivals still take either branch by contact.
function buildForkIntake(feature, frameAt, statics, zoneId) {
 const start = -FORK_INTAKE_BEFORE;
 const end = -4;
 const point = (offset) => {
  const fraction = (offset - start) / (end - start);
  const lateral = feature.intakeSide * (2.04 + (1.18 - 2.04) * fraction);
  return new Vector3(...pointInFrame(frameAt(feature.u + offset), lateral, .40));
 };
 const up = new Vector3(...frameAt(feature.u + start).n);
 for (let offset = start; offset < end; offset += .5) {
  const a = point(offset);
  const b = point(offset + .5);
  const direction = b.clone().sub(a);
  const length = direction.length();
  direction.normalize();
  const right = new Vector3().crossVectors(direction, up).normalize();
  const normal = new Vector3().crossVectors(right, direction).normalize();
  const rotation = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(direction, normal, right));
  statics.push({
   kind: 'fin', shape: 'box', role: 'fork-intake', challengeZone: zoneId,
   pos: a.lerp(b,.5).toArray().map(r3), quat: quatArr(rotation),
   size: [length + .035, .92, .14], friction: .025, restitution: .12,
  });
 }
}

export function buildRaisedChoice(f,{frameAt,statics,out}){
 const C=RAISED_CHOICE,side=f.side??(Math.floor(f.u/10)%2?1:-1),id='route-choice-'+f.u,plan=raisedChoicePlan(side);
 if (f.intakeSide !== undefined) buildForkIntake(f, frameAt, statics, id);
 for(let u=0;u<C.length;u+=C.step){
  const end=u+C.step,s=frameAt(f.u+u+C.step/2),q=frameQuat(s),inv=q.clone().invert(),origin=new Vector3(...s.p),verts=[];
  for(const top of [false,true])for(const [du,z]of [[u,C.lo],[end,C.lo],[end,C.hi],[u,C.hi]])
   verts.push(new Vector3(...pointInFrame(frameAt(f.u+du),z*side,top?height(du):-.12)).sub(origin).applyQuaternion(inv));
  const bounds=new Box3().setFromPoints(verts),center=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3()).toArray();
  const indices=side===1?DECK_INDICES:DECK_INDICES.flatMap((_,i,a)=>i%3===0?[a[i],a[i+2],a[i+1]]:[]);
  statics.push({kind:'challenge-deck',shape:'convex',pos:origin.add(center.clone().applyQuaternion(q)).toArray().map(r3),quat:quatArr(q),size,vertices:verts.flatMap(v=>v.sub(center).toArray()),indices,friction:.15,restitution:.08,challengeZone:id});
  for(const z of [-.9,2.1]){const h=Math.max(height(u),height(end))+1.4;statics.push({kind:'fin',shape:'box',pos:pointInFrame(s,z*side,h/2-.06).map(r3),quat:quatArr(q),size:[.52,h,.16],friction:.025,restitution:.12,challengeZone:id});}
 }
 buildChallengeRibs(f,{frameAt,statics},plan);
 (out.challengeZones??=[]).push({...plan,id,u0:f.u,u1:f.u+C.length});
 (out.lifts??=[]).push({u0:f.u,len:C.length,count:22,spacing:1.2,speed:4,half:1.35,lead:3,rise:2,challengeZone:id,path:{u0:f.u,points:plan.routes[1].points.map(([u,,h])=>[u,.64*side,h])}});
}
