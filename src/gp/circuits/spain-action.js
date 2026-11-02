// Place real, shared collision/render features from the authored road geometry.
// Decisions depend on geometry and a fixed race seed, never the desired winner.
export function spainAction(base,course){
  const runs=[];let from=null;
  for(const s of course.samples){
    const straight=s.u>24&&s.u<course.uFinish-40&&Math.abs(s.curv)<.026;
    if(straight&&from===null)from=s.u;
    if(!straight&&from!==null){if(s.u-from>=22)runs.push({from,to:s.u,length:s.u-from});from=null;}
  }
  const sectors=runs.sort((a,b)=>b.length-a.length).slice(0,7).sort((a,b)=>a.from-b.from);
  if(sectors.length<3)throw Error('Spanish action design requires three safe sectors');
  const gates=[],lanes=[];
  sectors.forEach((s,i)=>{
    const start=Math.ceil(s.from+2),end=Math.floor(s.to-2),length=end-start;
    lanes.push({u:start,length:7,latCenter:i%2?1.08:-1.08,width:1.35,target:30,accel:82});
    for(let j=0;j<Math.min(4,Math.floor((length-12)/20)+1);j++){
      const u=start+12+j*20;if(u+3>end)break;
      gates.push({u,lat:j%3===1?0:j%3===0?.65:-.65,width:j%3===1?.55:.75,length:2,height:.5});
    }
    if(length>65)for(const side of [-1,1])lanes.push({u:end-8,length:7,latCenter:side*1.08,width:1.35,target:30,accel:82});
  });
  const pads=lanes.filter(l=>!gates.some(g=>l.u<g.u+g.length/2+2&&l.u+l.length>g.u-g.length/2-2));
  // Short off-line exits reward reaching the outside lane after a bend. Keep
  // them separated from islands and the other attack sectors.
  const exits=course.samples.filter(s=>s.u>150&&s.u<course.uFinish-60&&Math.abs(s.curv)<.03&&course.samples.filter(q=>q.u>=s.u&&q.u<=s.u+7).every(q=>Math.abs(q.curv)<.035)).sort((a,b)=>Math.abs(a.curv)-Math.abs(b.curv));
  let added=0;
  for(const s of exits){
    if(added===2)break;
    if(pads.some(p=>Math.abs(p.u-s.u)<80)||gates.some(g=>Math.abs(g.u-s.u)<35))continue;
    pads.push({u:Math.round(s.u),length:7,latCenter:added%2?-1.08:1.08,width:1.35,target:30,accel:82});added++;
  }
  const bends=course.samples.filter(s=>s.u>90&&s.u<course.uFinish-55&&Math.abs(s.curv)>.025&&Math.abs(s.curv)<.07&&!gates.some(g=>Math.abs(g.u-s.u)<24)&&!pads.some(l=>s.u>l.u-8&&s.u<l.u+l.length+8)).sort((a,b)=>Math.abs(b.curv)-Math.abs(a.curv));
  const patches=[];
  for(const b of bends){if(patches.length===2)break;if(patches.some(p=>Math.abs(p.u0-b.u)<65))continue;patches.push({id:`coastal-spray-${patches.length+1}`,label:'SEA SPRAY · WET INSIDE',u0:Math.round(b.u-5),u1:Math.round(b.u+7),lat:Math.sign(b.curv)*.98,halfWidth:.72});}
  return {...base,carChallenges:{variant:'coastal-action',patches,gates:gates.sort((a,b)=>a.u-b.u),lanes:pads.sort((a,b)=>a.u-b.u),
    sectors:sectors.map((s,i)=>({id:i+1,from:s.from,to:s.to})),
    racecraft:{topSpeed:26,acceleration:9.5,braking:10.3,cornerAcceleration:10.8,boostSpeed:6.5,boostSeconds:3.8,brakingBase:.94,brakingSpread:.25}}};
}
