// Read saved real physics, not final classifications: a recovered runner can
// finish and still have an invalid trajectory. Never modifies the race.
export function marbleMotionReport(data){
 const {frames,marbles,fps}=data,start=data.timeline.raceStart;
 if(data.info?.vehicle!=='marble'||!Number.isFinite(fps)||fps<=0||!frames?.length)throw Error('Expected saved marble telemetry');
 const recoveries=(data.carDiagnostics??[]).reduce((n,x)=>n+(x.recoveries??0),0);
 const discontinuities=[],invalidPoses=[],delays=[];
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 // 60 world units/sec is a conservative upper bound, well above the18.5
 // powered pad target and ordinary machine launches. Teleports are not lifts.
 const maximumStep=60/fps;
 for(let i=0;i<marbles.length;i++){
  const runner=marbles[i],end=Math.min(frames.length-1,...[runner.finishFrame,runner.dqFrame].filter(Number.isFinite));
  const identity={marble:i,country:runner.abbr};
  for(let f=start;f<=end;f++){
   const pose=frames[f]?.[i];
   if(!pose||pose.length<8||!pose.every(Number.isFinite)){invalidPoses.push({...identity,frame:f});continue;}
   if(f>start&&frames[f-1]?.[i]?.every(Number.isFinite)){
    const step=distance(pose,frames[f-1][i]);
    if(step>maximumStep){const L=data.info.length,u=(((frames[f-1][i][7]+9.5)%L)+L)%L-9.5;
     const feature=data.features?.reduce((a,b)=>!a||Math.abs(b.u-u)<Math.abs(a.u-u)?b:a,null);
     discontinuities.push({...identity,frame:f,videoSecond:(f+(data.intro?.total??0))/fps,stepMetres:step,u,nearFeature:feature?.type,featureU:feature?.u});}
   }
  }
  // Full-window spread, not merely equal endpoints of a legitimate orbit.
  // These are review flags, not automatic DQ or a reason to advance a ball.
  const window=Math.round(1.5*fps);let previous=-Infinity;
  for(let f=start+window;f<=end;f+=Math.max(1,Math.round(fps/4))){
   if(f-previous<window)continue;
   const q=frames[f][i],u=(((q[7]+9.5)%data.info.length)+data.info.length)%data.info.length-9.5;
   const feature=data.features?.find(g=>u>=g.u-(g.span?.[0]??1)-1&&u<=g.u+(g.span?.[1]??4)+1);
   if(!['bumpers','pegs','splitter','spinner','pusher','turntable','hammer'].includes(feature?.type))continue;
   let lo=[Infinity,Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity,-Infinity];
   for(let k=f-window;k<=f;k++){const p=frames[k][i];for(const [j,idx]of [0,1,2,7].entries()){lo[j]=Math.min(lo[j],p[idx]);hi[j]=Math.max(hi[j],p[idx]);}}
   if(hi[3]-lo[3]<.7&&Math.hypot(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2])<.8){delays.push({...identity,fromFrame:f-window,toFrame:f,seconds:window/fps,u,feature:feature.type,featureU:feature.u});previous=f;}
  }
 }
 const faults=data.marblePhysicsDiagnostics?.faults??[];
 return {vehicle:'marble',passed:recoveries===0&&discontinuities.length===0&&invalidPoses.length===0&&faults.length===0,recoveries,maximumStepMetres:maximumStep,discontinuities,invalidPoses,delays,faults,delayReviewRequired:delays.length>0};
}
