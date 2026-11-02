// Review actual trajectories, not configured speed or leaderboard catch-up.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const quantile=(values,p)=>{const s=[...values].sort((a,b)=>a-b);return s.length?s[Math.min(s.length-1,Math.floor((s.length-1)*p))]:0;};
export function carPaceReport(data){
 const {fps,frames,marbles,timeline}=data,drivers=[],nearestGaps=[],packSpreads=[];
 const live=(i,f)=>(marbles[i].dqFrame===null||f<marbles[i].dqFrame)&&(marbles[i].finishFrame===null||f<marbles[i].finishFrame);
 const speeds=frames.map(()=>[]);
 for(let i=0;i<marbles.length;i++){
  let distance=0,steps=0;const values=[];
  for(let f=timeline.raceStart+1;f<frames.length&&live(i,f);f++){
   const step=Math.hypot(...frames[f][i].slice(0,3).map((v,k)=>v-frames[f-1][i][k]));
   distance+=step;steps++;values.push(step*fps*3.6);speeds[f][i]=step*fps;
  }
  drivers.push({country:marbles[i].abbr,meanKph:steps?distance*fps/steps*3.6:0,p95Kph:quantile(values,.95),maximumKph:Math.max(0,...values),activeSeconds:steps/fps});
 }
 const firstFinish=Math.min(...marbles.map(m=>m.finishFrame).filter(Number.isFinite));
 for(let f=timeline.raceStart+fps*3;f<Math.min(firstFinish,frames.length);f++){
  const ids=marbles.map((_,i)=>i).filter(i=>live(i,f));
  if(ids.length<2)continue;
  const ordered=[...ids].sort((a,b)=>frames[f][b][7]-frames[f][a][7]);
  const meanSpeed=ids.reduce((n,i)=>n+(speeds[f][i]??0),0)/ids.length;
  packSpreads.push((frames[f][ordered[0]][7]-frames[f][ordered.at(-1)][7])/Math.max(1,meanSpeed));
  for(const i of ids)nearestGaps.push(Math.min(...ids.filter(j=>j!==i).map(j=>Math.abs(frames[f][i][7]-frames[f][j][7])/Math.max(1,((speeds[f][i]??0)+(speeds[f][j]??0))/2))));
 }
 const meanKph=drivers.reduce((n,d)=>n+d.meanKph,0)/Math.max(1,drivers.length),maximumKph=Math.max(0,...drivers.map(d=>d.maximumKph));
 return {units:'Measured world metres and seconds; no display multiplier',drivers,meanKph,maximumKph,
  rivalWithinOneSecondFraction:nearestGaps.length?nearestGaps.filter(x=>x<=1).length/nearestGaps.length:0,
  medianNearestRivalSeconds:quantile(nearestGaps,.5),p95PackSpreadSeconds:quantile(packSpreads,.95),
  passed:Number.isFinite(meanKph)&&meanKph>=80&&maximumKph>=135,
  acceptance:'Minimum measured fleet mean80km/h and peak135km/h; editorial pace/action/cockpit review remains required'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 for(const path of process.argv.slice(2))console.log(JSON.stringify({path,...carPaceReport(JSON.parse(readFileSync(path)))}));
