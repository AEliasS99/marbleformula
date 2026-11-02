import {carHalfExtents} from './car-engine.mjs';
import {islandContact} from '../src/gp/car-island.js';

// Smoothing must not cut a collision-safe trajectory through a solid island.
// Inspect the final rounded pose, including its blended heading, in the actual
// island basis. Keep the existing pose when the cosmetic blend is obstructed.
export function carPoseIslandOverlap(pose, layout) {
  let overlap=0;
  for(const {gate,frame:s} of layout) {
    const rel=pose.slice(0,3).map((v,k)=>v-s.p[k]);
    const along=rel.reduce((n,v,k)=>n+v*s.t[k],0),lat=rel.reduce((n,v,k)=>n+v*s.r[k],0);
    if(Math.abs(along)>gate.length/2+1.5)continue;
    const height=rel.reduce((n,v,k)=>n+v*s.n[k],0);
    if(Math.abs(height)>(gate.height??.5)+1)continue;
    const [x,y,z,w]=pose.slice(3,7),forward=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w)];
    const yaw=Math.atan2(forward.reduce((n,v,k)=>n+v*s.r[k],0),forward.reduce((n,v,k)=>n+v*s.t[k],0));
    const car=carHalfExtents(yaw);
    overlap=Math.max(overlap,islandContact(gate,along,lat,car)?.depth??0);
  }
  return overlap;
}
export function safeCarSmoothingPose(candidate,current,layout) {
  return carPoseIslandOverlap(candidate,layout)>0 ? current : candidate;
}
