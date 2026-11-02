import {spainAction} from './spain-action.js';
import {RACE_PACE} from '../car-pace.js';

// Same Coffee Andes outline, scenery, cars and production. Wider racing room
// and larger bend radii let the powertrain deliver actual racing speed.
export function colombiaRushRound(base){return {...base,carRoadScale:2.3,carRoadWidth:6.4};}

export function colombiaRushAction(base,course,{minimumSectors=6,maximumSectors=8,pondFractions=[.18,.38,.60,.79]}={}){
 const established=colombiaAction(base,course);
 const ponds=[],length=24;
 const candidates=course.samples.filter(s=>s.u>90&&s.u+length<course.uFinish-130&&Math.abs(s.curv)<.018);
 for(const fraction of pondFractions){
  const site=[...candidates].filter(s=>ponds.every(p=>Math.abs(s.u-p.u0)>120))
   .sort((a,b)=>Math.abs(a.u-course.uFinish*fraction)-Math.abs(b.u-course.uFinish*fraction))[0];
  if(!site)throw Error('Coffee Andes needs four separated water choices');
  ponds.push({id:`andes-pond-${ponds.length+1}`,kind:'pond',label:'WATER POND · DRY PASSING LINE',
   u0:Math.round(site.u),u1:Math.round(site.u)+length,lat:ponds.length%2?-1.15:1.15,halfWidth:1.15,drag:.0075});
 }
 const clear=(u,len)=>u>55&&u+len<course.uFinish-100&&
  ponds.every(p=>u+len<p.u0-45||u>p.u1+35)&&
  course.samples.filter(s=>s.u>=u-4&&s.u<=u+len+22).every(s=>Math.abs(s.curv)<.012);
 const options=course.samples.filter(s=>Number.isInteger(s.u)&&clear(s.u,14)).map(s=>s.u);
 const sectors=[];
 while(sectors.length<maximumSectors){
  const score=u=>sectors.length?Math.min(...sectors.map(v=>Math.abs(v-u))):-Math.abs(u-course.uFinish*.1);
  const u=options.filter(u=>!sectors.includes(u)).sort((a,b)=>score(b)-score(a)||a-b)[0];
  if(u===undefined||sectors.length&&score(u)<65)break;
  sectors.push(u);
 }
 if(sectors.length<minimumSectors)throw Error('Authored road needs '+minimumSectors+' safe powered sectors');
 const lanes=sectors.sort((a,b)=>a-b).flatMap((u,i)=>{
  const make=side=>({u,length:14,latCenter:side*2,width:1.65,target:RACE_PACE.maximumSpeed,accel:RACE_PACE.acceleration*10});
  // Alternating attack lines plus paired zones: a following car can choose the
  // open pad rather than spending the entire lap queuing behind the leader.
  return i%3===0?[-1,1].map(make):[make(i%2?-1:1)];
 });
 return {...established,carChallenges:{...established.carChallenges,variant:'andes-rush',gates:[],patches:ponds,lanes,
  racecraft:{...RACE_PACE},refinement:'flowing-road-water-choices-powered-lanes-v2'}};
}
// Reuse the production's geometry-aware action composer on the NEW Colombian
// road: these are physical lane choices, not scripted position changes.
export function colombiaAction(base,course){
 const round=spainAction(base,course);
 const {gates,patches}=round.carChallenges,length=6;
 // Spread attack strips over the whole lap rather than filling the first long
 // straight. The same clearances used by the refinement include the longer
 // rounded island ends, wet alternatives and the upcoming braking zone.
 const candidates=course.samples.filter(s=>{
  const u=s.u;return u>25&&u+length<course.uFinish-50&&
   !gates.some(g=>u<g.u+Math.max(3.4,g.length)/2+7&&u+length>g.u-Math.max(3.4,g.length)/2-7)&&
   !patches.some(p=>u<p.u1+10&&u+length>p.u0-10)&&
   course.samples.filter(q=>q.u>=u-3&&q.u<=u+length+4).every(q=>Math.abs(q.curv)<.026);
 }).map(s=>s.u).filter(u=>Number.isInteger(u));
 const selected=[];
 while(selected.length<8){
  const score=u=>selected.length?Math.min(...selected.map(x=>Math.abs(x-u))):-Math.abs(u-course.uFinish*.12);
  const u=candidates.filter(u=>!selected.includes(u)).sort((a,b)=>score(b)-score(a)||a-b)[0];
  if(u===undefined||selected.length&&score(u)<40)throw Error('Colombia needs eight separated, safe acceleration sectors');
  selected.push(u);
 }
 const lanes=selected.sort((a,b)=>a-b).map((u,i)=>({u,length,latCenter:i%2?1.08:-1.08,width:1.35,target:30,accel:82}));
 return {...round,carChallenges:{...round.carChallenges,variant:'andes-action',lanes,
  patches:patches.map((p,i)=>({...p,id:`coffee-dew-${i+1}`,label:'MOUNTAIN DEW · WET INSIDE'}))}};
}
