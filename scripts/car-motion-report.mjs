// Saved-pose continuity in metres/seconds. Legacy races retain the 1m guard.
// The opt-in nitro model has a 66m/s powertrain, so 1m at 60fps is not a jump.
export function carMotionReport(data){
 const tuning=data.carConditions?.racecraft,modern=tuning?.boostModel==='lane-charge-v2';
 const fps=data.fps,maxSpeed=tuning?.maximumSpeed;
 if(!Number.isFinite(fps)||fps<=0||(modern&&(!Number.isFinite(maxSpeed)||maxSpeed<=0)))return {passed:false,error:'Invalid motion units or speed envelope'};
 // Existing controller: steering <=2.5m/s plus tyre drift <=3.2m/s.
 // Positions are stored to millimetres: two endpoints add <0.004m error.
 const maxStep=modern?Math.hypot(maxSpeed,2.5+3.2)/fps+.004:1;
 const acceleration=modern?Math.max(tuning.braking,tuning.acceleration*(tuning.boostAccelerationMultiplier??1),...(data.boosters??[]).map(b=>b.accel??0)):0;
 if(modern&&!Number.isFinite(acceleration))return {passed:false,error:'Invalid acceleration envelope'};
 const maxStepChange=acceleration/fps**2+.008,failures=[];
 let tested=0,highSpeedSteps=0,peakStep=0,peakHighSpeedChange=0;
 for(let i=0;i<data.marbles.length;i++){
  const m=data.marbles[i],end=Math.min(data.frames.length,m.finishFrame??Infinity,m.dqFrame??Infinity);
  let previous=null;
  for(let f=data.timeline.raceStart+1;f<end;f++){
   const a=data.frames[f-1]?.[i],b=data.frames[f]?.[i];tested++;
   if(!a?.slice(0,8).every(Number.isFinite)||!b?.slice(0,8).every(Number.isFinite)){
    failures.push({frame:f,car:i,reason:'non-finite pose'});previous=null;continue;
   }
   const step=Math.hypot(...b.slice(0,3).map((v,k)=>v-a[k]));peakStep=Math.max(peakStep,step);
   if(step>maxStep)failures.push({frame:f,car:i,reason:'speed envelope',step});
   if(modern&&step>1){
    highSpeedSteps++;
    if(previous!==null){const change=Math.abs(step-previous);peakHighSpeedChange=Math.max(peakHighSpeedChange,change);
     if(change>maxStepChange)failures.push({frame:f,car:i,reason:'abrupt high-speed discontinuity',change});
    }
   }
   previous=step;
  }
 }
 return {passed:tested>0&&failures.length===0,model:modern?'configured-nitro-envelope':'legacy-one-metre',fps,maxSpeed:modern?maxSpeed:null,maxStep,maxStepChange:modern?maxStepChange:null,tested,highSpeedSteps,peakStep,peakHighSpeedChange,failureCount:failures.length,examples:failures.slice(0,12)};
}
