import {frameQuat,pointInFrame,quatArr,r3} from './kit.js';
import {routeOffset} from '../route-path.js';
import {Matrix4,Quaternion,Vector3} from 'three';

// Open physical timber guides: 0.52m between 0.08m crossbars keeps a
// 0.70m marble inside while leaving most of the view open. Saved boxes are
// shared by physics, picture and camera; no invisible ceiling or velocity cap.
export const CHALLENGE_RIBS={pitch:.6,thickness:.08,depth:.12,clearance:1.04};
// Catch airborne arrivals below the first bar, then lower the open roof before
// the lane throat. A low, blunt first bar launched the saved India70 pack.
export const challengeEntryRaise=(type,u)=>type==='single-lane'?Math.max(0,Math.min(1,-u/3)):0;
export function buildChallengeRibs(f,{frameAt,statics},plan){
 const C=CHALLENGE_RIBS,id=f.type+'-'+f.u;
 const add=(u,lat,h,size,role)=>{
  const s=frameAt(f.u+u);
  statics.push({kind:'challenge-rib',shape:'box',pos:pointInFrame(s,lat,h).map(r3),quat:quatArr(frameQuat(s)),size,friction:.025,restitution:.05,challengeZone:id,role});
 };
 const stringer=(a,b,lat,ha,hb)=>{
  const A=new Vector3(...pointInFrame(frameAt(f.u+a),lat,ha)),B=new Vector3(...pointInFrame(frameAt(f.u+b),lat,hb));
  const dir=B.clone().sub(A),length=dir.length();dir.normalize();
  const normal=new Vector3(...frameAt(f.u+(a+b)/2).n),z=new Vector3().crossVectors(dir,normal).normalize(),y=new Vector3().crossVectors(z,dir).normalize();
  const q=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(dir,y,z));
  statics.push({kind:'challenge-rib',shape:'box',pos:A.add(B).multiplyScalar(.5).toArray().map(r3),quat:quatArr(q),size:[r3(length+.01),.12,.12],friction:.025,restitution:.05,challengeZone:id,role:'stringer'});
 };
 for(let k=0,u=-3;u<plan.length+2;k++,u=-3+k*C.pitch){
  const raise=challengeEntryRaise(f.type,u);
  const spans=f.type==='route-choice'?plan.routes.map(route=>{
   const [lat,h]=routeOffset(route.points,u);return {lat,h,width:route.clearWidth};
  }):[{lat:0,h:0,width:2*frameAt(f.u+u).w}];
  for(const {lat,h,width} of spans)add(u,lat,h+C.clearance+C.depth/2+raise,[C.thickness,C.depth,width],'crossbar');
  // Existing raised-route walls support their crossbars. The other modules
  // have an outboard open frame, tied down to the actual road deck.
  if(f.type!=='route-choice')for(const side of [-1,1]){
   const lat=side*(frameAt(f.u+u).w+.06);
   if(f.type==='single-lane')stringer(u,u+C.pitch,lat,1.10+raise,1.10+challengeEntryRaise(f.type,u+C.pitch));
   else add(u,lat,1.10,[C.pitch+.01,.12,.12],'stringer');
   if(k%3===0)add(u,lat,.48+raise/2,[.12,1.24+raise,.12],'post');
  }
  if(f.type==='route-choice'&&(u<0||u>plan.length)){
   // The approach/discharge lies beyond the raised retaining walls. Give
   // those crossbars their own visible frame instead of floating timber.
   for(const lat of [-2.16,2.16]){
    add(u,lat,1.10,[C.pitch+.01,.12,.12],'stringer');
    if(k%3===0)add(u,lat,.48,[.12,1.24,.12],'post');
   }
   if(k%3===0)add(u,0,1.10,[.12,.12,4.44],'portal-beam');
  }
 }
}
