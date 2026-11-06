// Independently measure progress through each real obstacle on saved poses.
// A race can have zero recoveries and still waste seconds fighting one hammer.
const windows={bumpers:{after:6,seconds:3},hammer:{after:5,seconds:3.5},turntable:{after:4,seconds:3},splitter:{after:5,seconds:3},pegs:{after:13,seconds:4.5}};
export function marbleObstacleFlow(data){
 const visits=[],eliminations=[];
 for(const feature of data.features.filter(f=>windows[f.type]))for(let lap=0;lap<data.info.laps;lap++)for(let i=0;i<data.marbles.length;i++){
  const spec=windows[feature.type],marble=data.marbles[i],start=feature.u-1+lap*data.info.length,end=feature.u+spec.after+lap*data.info.length;
  let enter=null,exit=null;
  for(let f=data.timeline.raceStart;f<data.frames.length;f++){
   if(marble.dqFrame!=null&&f>=marble.dqFrame)break;
   if(marble.finishFrame!=null&&f>marble.finishFrame)break;
   const u=data.frames[f][i][7];if(enter===null&&u>=start&&u<end)enter=f;
   if(enter!==null&&u>=end){exit=f;break;}
  }
  if(enter===null)continue;
  const row={type:feature.type,u:feature.u,lap:lap+1,marble:i,country:marble.abbr,enter,exit,seconds:((exit??data.frames.length)-enter)/data.fps,maximumSeconds:spec.seconds};
  if(exit===null&&marble.dqFrame!=null){eliminations.push({...row,reason:'actual checkpoint elimination'});continue;}
  // The finish may truncate a final obstacle window; it is not a jam.
  if(exit===null&&marble.finishFrame!=null&&end>data.info.length*(data.info.laps-1)+data.info.finish)continue;
  visits.push(row);
 }
 const blocked=visits.filter(v=>v.exit===null||v.seconds>v.maximumSeconds);
 return {passed:visits.length>0&&blocked.length===0,method:'independent-saved-progress-transit',limits:windows,visits:visits.length,checkpointEliminations:eliminations.length,blocked,worst:[...visits].sort((a,b)=>b.seconds-a.seconds).slice(0,20)};
}
