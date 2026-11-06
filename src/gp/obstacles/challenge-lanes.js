import {buildChallengeRibs} from './challenge-ribs.js';
import {raisedChoicePlan,buildRaisedChoice,RAISED_CHOICE} from './raised-choice.js';
import {Matrix4,Quaternion,Vector3} from 'three';
import {frameQuat,pointOnTrack,quatArr,r3,TRACK} from './kit.js';

// Authored-only modules: deliberately excluded from the legacy shuffled pool.
// The same saved fins are colliders, crafted visible timber/brass and camera
// occluders. No invisible steering, velocity changes or progress shortcuts.
export const CHALLENGE_RAIL={thickness:.16,height:.82,segment:1.8};
export const NEEDLE={clearWidth:.93,lanes:4,throat:12,exit:7};
export const CHOICE=RAISED_CHOICE;
const length=points=>points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
function feedDrums(f,{frameAt,out},positions,speeds,proud=.005){
 const radius=.42;
 positions.forEach((du,k)=>{const s=frameAt(f.u+du);out.rollers.push({kind:'roller',pos:pointOnTrack(s,0,-radius+proud).map(r3),quat:quatArr(frameQuat(s)),radius,length:r3(2*s.w-.06),omega:r3(-speeds[k%speeds.length]/radius),phase:r3((f.u*.37+k)%(2*Math.PI)),challengeZone:f.type+'-'+f.u});});
}
export function challengePlan(type,{side=1,halfWidth=TRACK.width/2}={}){
 if(![-1,1].includes(side)||halfWidth<2.09)throw Error('Authored challenge needs the full-width road and a valid side');
 if(type==='single-lane'){
  const clearWidth=(2*halfWidth-3*CHALLENGE_RAIL.thickness)/4,pitch=clearWidth+CHALLENGE_RAIL.thickness;
  return {type,length:19,clearWidth,throatStart:2,throatEnd:10,
   // Offset only the entrance noses so a centered ball contacts a sloping
   // rail face instead of balancing on a symmetric dead-stop. Throats stay fixed.
   rails:[-1,0,1].map(k=>[[0,k*pitch+.12],[2,k*pitch],[12,k*pitch]]),
   routes:Array.from({length:4},(_,i)=>({id:'lane-'+(i+1),clearWidth,points:[[0,(i-1.5)*pitch],[19,(i-1.5)*pitch]],distance:19}))};
 }
 if(type==='route-choice')return raisedChoicePlan(side);
 throw Error('Unknown authored lane challenge');
}
export function laneAt(points,u){
 const i=Math.max(0,points.findIndex((p,k)=>k<points.length-1&&u>=p[0]&&u<=points[k+1][0]));
 const a=points[i],b=points[Math.min(i+1,points.length-1)],t=Math.max(0,Math.min(1,(u-a[0])/(b[0]-a[0]||1)));
 return a[1]+(b[1]-a[1])*t;
}
export function buildChallengeRails(feature,ctx,plan){
 const {frameAt,statics}=ctx,zoneId=feature.type+'-'+feature.u;
 for(const points of plan.rails){
  for(const [du,lat]of points){const s=frameAt(feature.u+du);statics.push({kind:'bumper',shape:'cylinder',pos:pointOnTrack(s,lat,CHALLENGE_RAIL.height/2-.06).map(r3),quat:quatArr(frameQuat(s)),radius:CHALLENGE_RAIL.thickness/2,height:CHALLENGE_RAIL.height,friction:.025,restitution:.12,challengeZone:zoneId});}
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],count=Math.ceil((b[0]-a[0])/CHALLENGE_RAIL.segment);
   for(let j=0;j<count;j++){
    const point=t=>{const u=a[0]+(b[0]-a[0])*t,lat=a[1]+(b[1]-a[1])*t;return new Vector3(...pointOnTrack(frameAt(feature.u+u),lat,CHALLENGE_RAIL.height/2-.06));};
    const A=point(j/count),B=point((j+1)/count),dir=B.clone().sub(A),size=dir.length();dir.normalize();
    const n=new Vector3(...frameAt(feature.u+(a[0]+b[0])/2).n),z=new Vector3().crossVectors(dir,n).normalize(),y=new Vector3().crossVectors(z,dir).normalize();
    const q=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(dir,y,z));
    statics.push({kind:'fin',shape:'box',pos:A.add(B).multiplyScalar(.5).toArray().map(r3),quat:quatArr(q),size:[r3(size+.035),CHALLENGE_RAIL.height,CHALLENGE_RAIL.thickness],friction:.025,restitution:.12,challengeZone:zoneId});
   }
  }
 }
 (ctx.out.challengeZones??=[]).push({...plan,id:zoneId,u0:feature.u,u1:feature.u+plan.length,railHeight:CHALLENGE_RAIL.height});
}
const common={dq:false,guard:[-3,27,2.4]};
export const singleLane={...common,type:'single-lane',label:'FOUR SINGLE-FILE BRIDGES',
 place:{before:3,after:22,maxCurv:.018},
 card:{difficulty:3,chaos:3,seconds:2,summary:'Four parallel single-file passages separate the pack before a passing-lane release, without forcing twenty marbles into one clogging funnel.'},
 build(f,ctx){const plan=challengePlan(f.type,{halfWidth:ctx.frameAt(f.u+10).w});buildChallengeRails(f,ctx,plan);feedDrums(f,ctx,[-1.5,2,4,6,8,10],[6,7,6,8]);buildChallengeRibs(f,ctx,plan);}};
export const routeChoice={...common,type:'route-choice',label:'LOW ROAD OR CHAIN LIFT',
 place:{before:3,after:26,maxCurv:.018},
 card:{difficulty:4,chaos:4,seconds:3,summary:'A narrow lower shortcut competes with a wider raised road carried by physical chain cleats. Both branches rejoin the existing circuit.'},
 build:buildRaisedChoice};
export const rollerBank={...common,type:'roller-bank',label:'THE POWER DRUMS',
 place:{before:3,after:12,maxCurv:.018},
 card:{difficulty:3,chaos:4,seconds:2,summary:'Five full-width powered drums: every ground-level route crosses the raised working surface.'},
 build(f,ctx){
  const {frameAt,out}=ctx;
  const surfaces=[10,13,9,14,11],proud=.005;
  feedDrums(f,{frameAt,out},surfaces.map((_,k)=>1.5+k*1.6),surfaces,proud);
  (out.challengeZones??=[]).push({type:'roller-bank',id:'roller-bank-'+f.u,u0:f.u,u1:f.u+10,length:10,drums:5,workingWidth:r3(2*frameAt(f.u+5).w-.06),proud,surfaces});
  buildChallengeRibs(f,ctx,{length:10});
 }};
export const AUTHORED_CHALLENGES=[singleLane,routeChoice,rollerBank];
