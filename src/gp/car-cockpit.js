import {Vector3,Quaternion} from 'three';

// In the existing CarBody coordinate system (+X forward). This is inside the
// driver's helmet/seat area, not behind the car or hovering over its roof.
export const DRIVER_EYE = [.035,.008,.035];
export const COCKPIT_FOV = 64;
export const RACE_DRIVER_EYE = [.025,.035,.018];
export function cockpitBlurSamples(configured,kind,presentation){
 return kind==='cockpit'&&presentation==='race-seat-v2'?Math.max(8,configured):configured;
}
// The look-ahead distance must be continuous at integer frame boundaries too.
// A piecewise-constant velocity changes the driver's gaze between the two
// motion-blur samples either side of a frame, ghosting the distant scenery.
export function cockpitSpeedAt(frames,index,time,fps){
 const last=frames.length-1,f=Math.max(0,Math.min(last,Math.floor(time))),next=Math.min(last,f+1);
 const speedAt=at=>{
  const a=frames[at][index],b=frames[Math.min(last,at+1)][index];
  return Math.hypot(...a.slice(0,3).map((v,k)=>b[k]-v))*fps;
 };
 const a=Math.max(0,Math.min(1,time-f)),v=speedAt(f);
 return v+(speedAt(next)-v)*a;
}
export function cockpitRoadOptions(samples,u,speed,presentation){
 if(presentation!=='race-seat-v2')return {};
 const at=u+Math.max(8,Math.min(30,speed*.6));
 let lo=0,hi=samples.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(samples[mid].u<=at)lo=mid;else hi=mid;}
 const a=samples[lo],b=samples[hi],k=Math.max(0,Math.min(1,(at-a.u)/Math.max(.001,b.u-a.u)));
 return {presentation,roadAhead:a.p.map((v,i)=>v+(b.p[i]-v)*k+(a.n?.[i]??0)*.6)};
}
export function cockpitCamera(position,quaternion,options={}){
 const q=new Quaternion(...quaternion).normalize(),origin=new Vector3(...position);
 const modern=options.presentation==='race-seat-v2';
 const pos=new Vector3(...(modern?RACE_DRIVER_EYE:DRIVER_EYE)).applyQuaternion(q).add(origin);
 const forward=new Vector3(1,0,0).applyQuaternion(q);
 const carUp=new Vector3(0,1,0).applyQuaternion(q);
 // Keep the road's pitch, but damp roll for a readable, comfortable horizon.
 const up=new Vector3(0,1,0).lerp(carUp,.15).normalize();
 if(modern&&options.roadAhead){
  const gaze=new Vector3(...options.roadAhead).sub(pos).normalize(),right=new Vector3().crossVectors(forward,up).normalize();
  const yaw=Math.max(-.16,Math.min(.16,Math.atan2(gaze.dot(right),gaze.dot(forward))*.6));
  forward.multiplyScalar(Math.cos(yaw)).addScaledVector(right,Math.sin(yaw)).normalize();
 }
 const target=pos.clone().addScaledVector(forward,8).addScaledVector(up,.12);
 return {pos:pos.toArray(),target:target.toArray(),up:up.toArray(),fov:modern?74:COCKPIT_FOV};
}
