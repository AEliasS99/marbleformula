// Compose fresh challenge placements on an existing authored circuit. The road
// outline, elevation and themed scene remain the original production assets.
export function composeSprint(base,course) {
  const segments=[];let start=null;
  for(const s of course.samples){
    const clear=s.u>20&&s.u<course.uFinish-35&&Math.abs(s.curv)<.018;
    if(clear&&start===null)start=s.u;
    if(!clear&&start!==null){if(s.u-start>=22)segments.push({from:start,to:s.u,length:s.u-start});start=null;}
  }
  const selected=segments.sort((a,b)=>b.length-a.length).slice(0,5).sort((a,b)=>a.from-b.from);
  if(selected.length<3)throw Error('Circuit has too few clear sections for the composed sprint');
  const gates=[],lanes=[];
  for(const [i,s] of selected.entries()){
    const from=Math.ceil(s.from+2),to=Math.floor(s.to-2),length=to-from;
    lanes.push({u:from,length:Math.min(8,Math.floor(length/3)),latCenter:i%2?1.08:-1.08,width:1.35,target:30,accel:82});
    const count=length>=62?3:length>=40?2:length>=25?1:0;
    for(let k=0;k<count;k++){
      const u=Math.round(from+12+k*21);
      if(u+3>to)break;
      gates.push({u,lat:count===1||k===1?0:(k===0?.65:-.65),width:count===1||k===1?.55:.8,length:2,height:.5});
    }
    if(length>=62)for(const side of [-1,1])lanes.push({u:to-9,length:8,latCenter:side*1.08,width:1.35,target:30,accel:82});
  }
  // Long-section exit strips must not lie on a safety island.
  const filtered=lanes.filter(l=>!gates.some(g=>l.u<g.u+g.length/2+2&&l.u+l.length>g.u-g.length/2-2));
  return {...base,carChallenges:{variant:'sprint',patches:[],gates:gates.sort((a,b)=>a.u-b.u),lanes:filtered.sort((a,b)=>a.u-b.u),
    racecraft:{topSpeed:26,acceleration:9.5,braking:10.3,cornerAcceleration:10.8,boostSpeed:6.5,boostSeconds:3.8,brakingBase:.94,brakingSpread:.25}}};
}
