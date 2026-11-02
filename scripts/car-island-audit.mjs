import {carHalfExtents} from './car-engine.mjs';
import {islandContact} from '../src/gp/car-island.js';

// Conservative road-axis chassis envelope, using saved poses rather than the
// small Rapier floor probe. One centimetre covers rounded road-frame samples.
export function auditCarIslands(data,tolerance=.01) {
  const gates=data.carConditions?.gates??[];
  let overlapFrames=0,failedFrames=0,maxOverlap=0;
  const frameAt=u=>{
    let lo=0,hi=data.samples.length-1;
    while(lo+1<hi){const m=(lo+hi)>>1;if(data.samples[m].u<=u)lo=m;else hi=m;}
    return Math.abs(data.samples[lo].u-u)<Math.abs(data.samples[hi].u-u)?data.samples[lo]:data.samples[hi];
  };
  for(let f=data.timeline.raceStart+1;f<data.frames.length;f++)for(let i=0;i<data.marbles.length;i++){
    const m=data.marbles[i];if(m.finishFrame!==null&&f>=m.finishFrame||m.dqFrame!==null&&f>=m.dqFrame)continue;
    const p=data.frames[f][i];
    for(const gate of gates){
      if(Math.abs(p[7]-gate.u)>4)continue;
      const s=frameAt(gate.u),rel=p.slice(0,3).map((v,k)=>v-s.p[k]);
      const along=rel.reduce((n,v,k)=>n+v*s.t[k],0),lat=rel.reduce((n,v,k)=>n+v*s.r[k],0);
      const [x,y,z,w]=p.slice(3,7),forward=[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w)];
      const yaw=Math.atan2(forward.reduce((n,v,k)=>n+v*s.r[k],0),forward.reduce((n,v,k)=>n+v*s.t[k],0));
      const car=carHalfExtents(yaw);
      const depth=islandContact(gate,along,lat,car)?.depth??0;
      if(depth>0){overlapFrames++;maxOverlap=Math.max(maxOverlap,depth);if(depth>tolerance)failedFrames++;}
    }
  }
  return {passed:failedFrames===0,toleranceMetres:tolerance,overlapFrames,failedFrames,maxOverlapMetres:maxOverlap,islands:gates.length};
}
