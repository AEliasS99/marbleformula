import {surfaceGrip,carObstacleLine,driverDecision} from './car-challenges.js';
import {improvedPace,brakingLookahead,cornerSpeedLimit,waterDrag,waterResponse,poweredAcceleration,variedBoost,boostProfile} from './car-pace.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>{const t=clamp(x,0,1);return t*t*(3-2*t);};

// A committed, continuous lane trajectory. Rendering still consumes only the
// saved physical poses; this planner runs in the existing production bake.
export function drivingLineAt(plan,u,telemetry){
 const target=plan.mode==='racing-line'?telemetry.racingLatAt(u):plan.targetLat;
 return plan.originLat+(target-plan.originLat)*smooth((u-plan.startU)/plan.transition);
}

// Physical following limit, independent of leaderboard position. Rear cars
// also participate in the route sweep, so a merge cannot cut off a fast car.
export function followingSpeedLimit({speed,grip=1,braking=10,halfLength=.77,halfWidth=.44,intelligence=.5,lat,totalU,traffic,lookahead=55}){
 let limit=Infinity;
 for(const other of traffic){
  const gap=other.totalU-totalU;
  if(gap<=0||gap>lookahead||Math.abs(other.lat-lat)>halfWidth+other.halfWidth+.15)continue;
  const margin=halfLength+other.halfLength+.35+speed*(.12+.08*intelligence);
  const room=Math.max(0,gap-margin),front=Math.max(0,other.speed);
  limit=Math.min(limit,Math.sqrt(front*front+2*braking*grip*room),front+room/(.55+.2*intelligence));
 }
 return limit;
}

export function planCarDriving({u,totalU=u,lat,speed,lateralSpeed=0,time,intelligence=.5,stability=.5,halfWidth=.44,halfLength=.77,
 conditions,traffic=[],boosters=[],boostRemaining=0,boostLane=null,course,telemetry,driver=0,previous=null}){
 const tuning=conditions.racecraft,brake=tuning.braking??10,corner=tuning.cornerAcceleration??8.4,fast=improvedPace(tuning);
 const varied=variedBoost(tuning),activeBoost=boostProfile(tuning,boostLane);
 const horizon=Math.max(0,Math.min(course.uFinish-u,fast?brakingLookahead(speed,brake,surfaceGrip(conditions,u,lat)):clamp(speed*(1.35+.4*intelligence),24,55)));
 const preferredSide=driverDecision(conditions.seed,driver,Math.floor(u/60))<.5?-1:1;
 const widthAt=at=>Math.max(.65,(course.frameAt(at).w??2.1)-halfWidth-.15);
 const wMax=widthAt(u),candidates=[];
 if(previous&&time<previous.committedUntil)candidates.push(previous);
 const add=(mode,targetLat)=>{
  const target=clamp(targetLat,-wMax,wMax);
  if(candidates.some(c=>c.mode===mode&&Math.abs(c.targetLat-target)<.2))return;
  if(previous?.mode===mode&&Math.abs(previous.targetLat-target)<.2){candidates.push(previous);return;}
  const distance=Math.abs(target-lat),mu=surfaceGrip(conditions,u,lat);
  const countersteer=lateralSpeed*(target-lat)<0?Math.abs(lateralSpeed)*.12:0;
  const seconds=Math.max(.65,1.5*distance/2.3,Math.sqrt(6*distance/Math.max(2,corner*mu*.7)))+countersteer;
  candidates.push({mode,targetLat:target,originLat:lat,startU:u,transition:Math.max(6,speed*seconds),committedUntil:time+Math.max(.8,seconds*.9)});
 };
 add('racing-line',telemetry.racingLatAt(u));add('hold-line',lat);
 add('lane-left',-wMax*.9);add('lane-right',wMax*.9);
 const upcoming=boosters.filter(b=>b.u1>=u&&b.u0<=u+horizon);
 for(const b of upcoming){
  const distance=Math.abs(b.latCenter-lat),duration=Math.max(.65,1.5*distance/2.3,Math.sqrt(6*distance/Math.max(2,corner*.7)));
  if(b.u1-u>=Math.max(4,speed*duration))add(`boost-${b.latCenter<0?'left':'right'}-${b.u0}`,b.latCenter);
 }
 for(const patch of conditions.patches??[])if(patch.u1>=u&&patch.u0<=u+horizon)add('dry-line',-Math.sign(patch.lat)*Math.min(fast?wMax*.82:1.15,wMax));

 const evaluate=plan=>{
  const cruiseAllowance=fast?5:0; // Available only if the powertrain has a real aerodynamic tow.
  let chargeProfile=activeBoost;
  let predictedSpeed=Math.max(2,speed),predictedSeconds=0,chargeExpires=boostRemaining;
  const predictedPads=new Set();
  let cost=0,limit=Math.min(tuning.maximumSpeed??Infinity,(tuning.topSpeed??26)+cruiseAllowance+(varied?Math.max(boostRemaining>0?activeBoost.bonus:0,...upcoming.map(b=>boostProfile(tuning,b).bonus)):boostRemaining>0?tuning.boostSpeed??0:0)),risk=0,chargeAt=boostRemaining>0?u:null;
  const step=2,muNow=surfaceGrip(conditions,u,lat);
  for(let distance=0;distance<=Math.max(0,horizon);distance+=step){
   const at=u+distance,fr=course.frameAt(at),width=widthAt(at);
   const intent=clamp(drivingLineAt(plan,at,telemetry),-width,width);
   const lane=carObstacleLine(conditions,at,intent,halfWidth,halfLength,width,driver);
   const mu=surfaceGrip(conditions,at,lane),fraction=(at-plan.startU)/plan.transition;
   const target=plan.mode==='racing-line'?telemetry.racingLatAt(at):plan.targetLat;
   const steeringCurve=fraction>0&&fraction<1?Math.abs(6*(target-plan.originLat)*(1-2*fraction)/(plan.transition**2)):0;
   const curvature=Math.abs(fr.curv)/Math.max(.65,1-fr.curv*lane)+steeringCurve;
   const cornerSpeed=(fast?cornerSpeedLimit(curvature,corner+stability*.8,mu):Math.sqrt((corner+stability*.8)*mu/Math.max(.004,curvature)))*(.94+.03*stability);
   const onPad=upcoming.find(b=>at>=b.u0&&at<=b.u1&&Math.abs(lane-b.latCenter)<b.width/2);
   const pickup=varied?(onPad&&!predictedPads.has(onPad)?onPad:null):chargeAt===null?onPad:null;
   if(pickup){chargeAt=at;chargeProfile=boostProfile(tuning,pickup);predictedPads.add(pickup);chargeExpires=predictedSeconds+chargeProfile.seconds;}
   const boosted=chargeAt!==null&&(varied?predictedSeconds<chargeExpires:at-chargeAt<Math.max(boostRemaining,tuning.boostSeconds??0)*Math.max(8,speed));
   const cruising=Math.min(tuning.maximumSpeed??Infinity,varied&&boosted?chargeProfile.target:(tuning.topSpeed??26)+cruiseAllowance+(boosted?tuning.boostSpeed??0:0));
   let atLimit=Math.min(cornerSpeed,cruising);
   const seconds=varied?predictedSeconds:2*distance/Math.max(6,speed+atLimit);
   const predictedTraffic=traffic.map(other=>({...other,totalU:other.totalU+Math.max(0,other.speed)*seconds,lat:clamp(other.lat+(other.vLat??0)*Math.min(seconds,.7),-width,width)}));
   atLimit=Math.min(atLimit,followingSpeedLimit({speed:atLimit,grip:mu,braking:brake,halfLength,halfWidth,intelligence,lat:lane,totalU:totalU+distance,traffic:predictedTraffic,lookahead:fast?horizon:55}));
   limit=Math.min(limit,Math.sqrt(atLimit**2+2*brake*muNow*distance));
   const slope=fraction>0&&fraction<1?6*(target-plan.originLat)*fraction*(1-fraction)/plan.transition:0;
   const pathLength=step*Math.hypot(Math.max(.65,1-fr.curv*lane),slope);
   if(varied){
    // Compare actual powered travel time, not instant arrival at the pad's
    // target. Water can outweigh a short nitro lane; the dry route can win.
    const wet=waterResponse(conditions,at,lane,predictedSpeed);
    let acceleration=atLimit>=predictedSpeed?Math.min(poweredAcceleration(tuning,!!onPad,boosted,onPad)*(onPad?1:mu),(atLimit-predictedSpeed)*4.5):-Math.min(brake*mu,(predictedSpeed-atLimit)*6.8);
    if(acceleration>0)acceleration*=wet.throttleMultiplier;
    const next=Math.sqrt(Math.max(4,predictedSpeed**2+2*(acceleration-wet.drag)*pathLength));
    const seconds=2*pathLength/(predictedSpeed+next);cost+=seconds;predictedSeconds+=seconds;predictedSpeed=next;
   }else{
    cost+=pathLength/Math.max(2,atLimit);
    if(fast)cost+=waterDrag(conditions,at,lane,Math.min(speed,atLimit))*step/Math.max(10,speed*speed)*2;
   }
   cost+=(1-mu)*step*(.015+.035*intelligence);
   // Sweep the whole proposed lane change, not just its destination.
   for(const other of predictedTraffic){
    const du=other.totalU-(totalU+distance);
    const lateral=other.lat;
    const gap=halfLength+other.halfLength+.35;
    const side=halfWidth+other.halfWidth+.18;
    if(distance>0&&Math.abs(du)<gap&&Math.abs(lane-lateral)<side){risk++;cost+=100+Math.max(0,side-Math.abs(lane-lateral))*10;}
   }
  }
  // A pad charges several seconds of boost. Credit only the clear straight
  // beyond the short planning horizon, never acceleration into the next bend.
  if(chargeAt!==null&&boostRemaining<=0){
   const end=Math.min(chargeAt+(varied?chargeProfile.seconds:tuning.boostSeconds??0)*Math.max(8,speed),u+horizon+30,course.uFinish-45);
   for(let at=u+horizon+2;at<end;at+=2){
    const lane=drivingLineAt(plan,at,telemetry);
    if(Math.abs(course.frameAt(at).curv)>.026||surfaceGrip(conditions,at,lane)<.9)break;
    const predicted=traffic.some(other=>other.totalU>totalU&&Math.abs(other.lat-lane)<halfWidth+other.halfWidth+.2&&other.speed<speed+2);
    if(predicted)break;
    cost-=2*(1/(tuning.topSpeed??26)-1/((tuning.topSpeed??26)+(varied?chargeProfile.bonus:tuning.boostSpeed??0)))*.8;
   }
  }
  const following=followingSpeedLimit({speed,grip:muNow,braking:brake,halfLength,halfWidth,intelligence,lat,totalU,traffic,lookahead:fast?horizon:55});
  // If the route stays in the traffic queue, account for the time lost behind
  // it. A clear pass can win, but a blocked side cannot beat its collision cost.
  if(Math.abs(plan.targetLat-lat)<.45&&Number.isFinite(following))cost+=Math.max(0,speed-following)*.09;
  cost+=Math.abs(plan.targetLat-lat)*.07;
  if(Math.abs(plan.targetLat)>.4&&Math.sign(plan.targetLat)!==preferredSide)cost+=.012;
  if(plan.mode==='racing-line')cost-=.04;
  if(previous&&plan.mode===previous.mode&&time<previous.committedUntil)cost-=.3;
  return {...plan,score:cost,risk,speedLimit:limit};
 };
 const choices=candidates.map(evaluate).sort((a,b)=>a.score-b.score),best=choices[0];
 const aim=clamp(drivingLineAt(best,u+Math.max(3,speed*.35),telemetry),-wMax,wMax);
 return {...best,aimLat:aim,lookaheadMetres:horizon,alternatives:choices.length,
  reason:best.risk?'yield-traffic':best.mode.startsWith('boost')?'clear-boost-lane':best.mode==='dry-line'?'dry-grip':best.mode.startsWith('lane')?'clear-passing-route':'racing-line'};
}
