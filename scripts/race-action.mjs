// Evidence from baked physical poses, not a seed-selection or winner script.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function raceAction(data) {
  const start=data.timeline.raceStart+data.fps*3;
  const end=Math.min(...data.marbles.map(m=>m.finishFrame).filter(Number.isFinite));
  if(!Number.isFinite(end)||end>data.frames.length)throw Error('A complete finish is required for action analysis');
  const active=(i,f)=>data.marbles[i].dqFrame===null||data.marbles[i].dqFrame>f;
  let sideBySide=0, leadChanges=0,lastLeader=null;
  for(let f=start;f<end;f++) {
    const row=data.frames[f];
    const ids=data.marbles.map((_,i)=>i).filter(i=>active(i,f)).sort((a,b)=>row[b][7]-row[a][7]);
    if(lastLeader!==null && ids[0]!==lastLeader && active(lastLeader,f))leadChanges++;
    lastLeader=ids[0];
    let battle=false;
    for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++) {
      const p=row[ids[a]],q=row[ids[b]],du=Math.abs(p[7]-q[7]);
      const distance=Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
      if(du<1.54 && distance>.75 && distance<2.6)battle=true;
    }
    if(battle)sideBySide++;
  }
  const passes=(data.events||[]).filter(e=>e.kind==='overtake' && e.frame>=start && e.frame<end);
  const decisive=passes.filter(e=>{
    const later=e.frame+data.fps;
    if(later>=end||!active(e.a,later)||!active(e.b,later))return false;
    return data.frames[later][e.a][7]-data.frames[later][e.b][7]>1.54;
  });
  let maxStepMetres=0;
  for(let f=start;f<data.frames.length;f++)for(let i=0;i<data.marbles.length;i++) {
    if(!active(i,f)||data.marbles[i].finishFrame!==null&&f>=data.marbles[i].finishFrame)continue;
    maxStepMetres=Math.max(maxStepMetres,Math.hypot(...data.frames[f][i].slice(0,3).map((v,k)=>v-data.frames[f-1][i][k])));
  }
  return {raceSeconds:(end-data.timeline.raceStart)/data.fps,recordedPasses:passes.length,
    decisivePasses:decisive.length,confirmedLeadPasses:decisive.filter(e=>e.pos===1).length,leadRankSwaps:leadChanges,maxStepMetres,wheelToWheelSeconds:sideBySide/data.fps,
    slidesSeconds:(data.carDiagnostics||[]).reduce((n,d)=>n+(d.slideSeconds||0),0),
    wallContactSteps:(data.carDiagnostics||[]).reduce((n,d)=>n+(d.wallContacts||0),0),
    contactSteps:(data.carDiagnostics||[]).reduce((n,d)=>n+(d.contactFrames||0),0),
    boostActivations:(data.carDiagnostics||[]).reduce((n,d)=>n+(d.boostActivations||0),0),
    recoveries:(data.carDiagnostics||[]).reduce((n,d)=>n+d.recoveries,0)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 for(const path of process.argv.slice(2))console.log(JSON.stringify({path,...raceAction(JSON.parse(readFileSync(path)))}));
