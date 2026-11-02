// Native QA must inspect actual front/rear coverage, not rely on a shot label.
export function trackingReviewFrames(data){
 const finish=Math.min(...data.marbles.map(m=>m.finishFrame).filter(Number.isFinite));
 const result={};
 for(const kind of ['lead','chase']){
  const shots=data.shots.filter(s=>['lead','chase','wide','side','action'].includes(s.kind)&&s.start<finish).sort((a,b)=>(a.kind===kind?0:1)-(b.kind===kind?0:1));
  for(const shot of shots){
   const frame=Math.floor((shot.start+shot.end)/2),radius=Math.round(data.fps*.375),start=frame-radius,end=frame+radius;
   if(start<shot.start||end>=shot.end||start<data.timeline.raceStart||end>=finish)continue;
   const along=[];let valid=true;
   for(let f=start;f<=end;f++){
    const camera=data.cams[f],actors=data.marbles.map((m,i)=>({m,i})).filter(({m})=>(m.finishFrame==null||m.finishFrame>f)&&(m.dqFrame==null||m.dqFrame>f));
    let subject=Number.isInteger(camera[8])?actors.find(x=>x.i===camera[8]):null;
    subject??=actors.sort((a,b)=>Math.hypot(...data.frames[f][a.i].slice(0,3).map((v,k)=>v-camera[k+3]))-Math.hypot(...data.frames[f][b.i].slice(0,3).map((v,k)=>v-camera[k+3])))[0];
    if(!subject){valid=false;break;}
    const p=data.frames[f][subject.i],previous=data.frames[f-1][subject.i],next=data.frames[f+1][subject.i],velocity=next.slice(0,3).map((v,k)=>v-previous[k]),speed=Math.hypot(...velocity);
    if(speed<.001){valid=false;break;}
    const offset=velocity.reduce((sum,v,k)=>sum+v*(camera[k]-p[k]),0)/speed;
    if(kind==='lead'?offset<2:offset>-2){valid=false;break;}
    along.push(offset);
   }
   const cameraTravel=Math.hypot(...data.cams[end].slice(0,3).map((v,k)=>v-data.cams[start][k]));
   if(valid&&cameraTravel>=1){result[kind]={frame,shotKind:shot.kind,shotStart:shot.start,shotEnd:shot.end,window:[start,end],minAlong:Math.min(...along),maxAlong:Math.max(...along),cameraTravel};break;}
  }
  if(!result[kind])throw Error('Missing verified '+kind+' camera coverage');
 }
 return result;
}
