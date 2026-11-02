// Read-only measurement of the actual saved race. No seed search or rebake.
import fs from'node:fs';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
import{waterCoverage}from'../src/gp/car-pace.js';
export function auditCompetition(d){
 const firstFinish=Math.min(...d.marbles.map(m=>m.finishFrame).filter(Number.isFinite));
 const start=d.timeline.raceStart,from=start+Math.round(10*d.fps);
 const latAt=(row)=>{const u=row[7];let lo=0,hi=d.samples.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(d.samples[m].u<=u)lo=m;else hi=m;}
  const s=d.samples[lo];return row.slice(0,3).reduce((sum,v,k)=>sum+(v-s.p[k])*s.r[k],0);};
 const speedAt=(f,i)=>Math.hypot(...d.frames[Math.min(f+1,d.frames.length-1)][i].slice(0,3).map((v,k)=>v-d.frames[Math.max(0,f-1)][i][k]))*d.fps/2;
 const ponds=(d.carConditions?.patches??[]).filter(p=>p.kind==='pond').map(p=>({id:p.id,length:p.u1-p.u0,halfWidth:p.halfWidth,hits:new Map()}));
 let leader=null,swaps=0,hold=0,longestHold=0;const leadSeconds={},leaderChanges=[],gaps=[];
 for(let f=start;f<firstFinish;f++){
  const active=d.marbles.map((m,i)=>({m,i})).filter(({m})=>(m.dqFrame===null||m.dqFrame>f)&&(m.finishFrame===null||m.finishFrame>f)).sort((a,b)=>d.frames[f][b.i][7]-d.frames[f][a.i][7]);
  if(f>=from&&active.length){const head=active[0].i;
   if(head!==leader){if(leader!==null){swaps++;leaderChanges.push({seconds:(f-start)/d.fps,from:d.marbles[leader].abbr,to:d.marbles[head].abbr});}leader=head;hold=0;}
   hold++;longestHold=Math.max(longestHold,hold);leadSeconds[d.marbles[head].abbr]=(leadSeconds[d.marbles[head].abbr]??0)+1/d.fps;
   if(active[1])gaps.push(d.frames[f][head][7]-d.frames[f][active[1].i][7]);
  }
  for(const {i}of active){const row=d.frames[f][i],lat=latAt(row);
   for(let k=0;k<ponds.length;k++){const patch=d.carConditions.patches.filter(p=>p.kind==='pond')[k],coverage=waterCoverage(patch,row[7],lat);if(coverage<.1)continue;
    const hit=ponds[k].hits.get(i)??{country:d.marbles[i].abbr,seconds:0,maximumCoverage:0,entryKph:speedAt(f,i)*3.6,minimumKph:Infinity};hit.seconds+=1/d.fps;hit.maximumCoverage=Math.max(hit.maximumCoverage,coverage);hit.minimumKph=Math.min(hit.minimumKph,speedAt(f,i)*3.6);ponds[k].hits.set(i,hit);
   }
  }
 }
 return {seed:d.seed,countries:d.marbles.map(m=>m.abbr),raceSeconds:(firstFinish-start)/d.fps,leaderChangesAfterTenSeconds:swaps,leaderChanges,longestLeadSeconds:longestHold/d.fps,leadSeconds,averageLeadGapMetres:gaps.reduce((n,g)=>n+g,0)/Math.max(1,gaps.length),maximumLeadGapMetres:Math.max(0,...gaps),
  allOvertakes:(d.events??[]).filter(e=>e.kind==='overtake').length,
  boosterVariants:{lengths:[...new Set(d.boosters.map(b=>b.length))],widths:[...new Set(d.boosters.map(b=>b.width))],targetsKph:[...new Set(d.boosters.map(b=>b.target*3.6))],accelerations:[...new Set(d.boosters.map(b=>b.accel))]},
  ponds:ponds.map(p=>({...p,hits:[...p.hits.values()].map(h=>({...h,speedLossKph:Math.max(0,h.entryKph-h.minimumKph)}))})),recordedDriving:d.carDrivingDiagnostics,recordedPhysical:d.carDiagnostics};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const d=JSON.parse(fs.readFileSync(process.argv[2])),report=auditCompetition(d);if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({raceSeconds:report.raceSeconds,leaderChanges:report.leaderChangesAfterTenSeconds,longestLeadSeconds:report.longestLeadSeconds,leadSeconds:report.leadSeconds,gap:report.averageLeadGapMetres,boosters:report.boosterVariants,ponds:report.ponds.map(p=>({id:p.id,cars:p.hits.length,maxLossKph:Math.max(0,...p.hits.map(h=>h.speedLossKph))}))},null,2));
}
