// Evolve the existing authored road; do not change its outline or scenery.
export function refineCarCircuit(round,course){
 const original=round.carChallenges;
 if(!original?.gates?.length)return round;
 const gates=original.gates.map(g=>({...g,profile:'soft-island',height:.28,length:Math.max(3.4,g.length),width:Math.min(g.width,.64)}));
 const clear=(u,length)=>u>18&&u+length<course.uFinish-45&&
   !gates.some(g=>u<g.u+g.length/2+4&&u+length>g.u-g.length/2-4)&&
   !(original.patches??[]).some(p=>u<p.u1+10&&u+length>p.u0-10)&&
   course.samples.filter(s=>s.u>=u-3&&s.u<=u+length+4).every(s=>Math.abs(s.curv)<.026);
 const lanes=original.lanes.filter(l=>clear(l.u,l.length)).map(l=>({...l}));
 const wanted=original.lanes.length+4;
 // First offer the alternative side at existing safe sectors. Then find
 // additional exits, keeping separated sectors and enough braking distance.
 for(const l of [...lanes]){
  if(lanes.length>=wanted)break;
  if(!lanes.some(q=>Math.abs(q.u-l.u)<1&&Math.sign(q.latCenter)===-Math.sign(l.latCenter)))lanes.push({...l,latCenter:-l.latCenter});
 }
 for(const s of course.samples){
  if(lanes.length>=wanted)break;
  const u=Math.ceil(s.u),length=6;
  if(!clear(u,length)||lanes.some(l=>u<l.u+l.length+22&&u+length>l.u-22))continue;
  for(const side of [-1,1]){
   if(lanes.length>=wanted)break;
   lanes.push({u,length,latCenter:side*1.08,width:1.35,target:28,accel:82});
  }
 }
 if(lanes.length<original.lanes.length+2)throw Error(`Not enough safe acceleration sectors for the refined road: ${lanes.length} lanes at ${lanes.map(l=>l.u).join(',')}`);
 return {...round,carChallenges:{...original,gates,lanes:lanes.sort((a,b)=>a.u-b.u),racecraft:{...original.racecraft,drivingModel:'lookahead-driver-v1',cockpitCamera:true},refinement:'rounded-islands-more-attack-lanes-v1'}};
}
