// Physical choices on the existing authored course, independent of rank,
// country, current winner or desired result. Opt-in for NEW exhibition bakes.
export const BOOST_TIERS=Object.freeze([
 {tier:'surge',label:'SURGE',length:28,width:2.1,target:52,accel:70,boostSeconds:3.8},
 {tier:'attack',label:'ATTACK',length:18,width:1.55,target:58,accel:105,boostSeconds:2.8},
 {tier:'nitro',label:'NITRO',length:10,width:1.15,target:66,accel:140,boostSeconds:1.6},
]);
export function variedRaceAction(round,course){
 const old=round.carChallenges;
 const patches=old.patches.map((p,i)=>({...p,u1:p.u0+[32,38,34][i%3],lat:Math.sign(p.lat)*[.7,.85,.75][i%3],halfWidth:[1.85,1.95,1.8][i%3],drag:[.022,.025,.02][i%3],grip:[.5,.44,.55][i%3],label:'WATER · DRY BYPASS'}));
 const clear=(u,length,margin=45)=>u>55&&u+length<course.uFinish-100&&patches.every(p=>u+length<p.u0-margin||u>p.u1+35)&&course.samples.filter(s=>s.u>=u-4&&s.u<=u+length+22).every(s=>Math.abs(s.curv)<.012);
 const lanes=old.lanes.map((lane,i)=>{
  const tier=BOOST_TIERS[i%3];const length=[tier.length,18,10,6].find(n=>n<=tier.length&&clear(lane.u,n));
  return length?{...lane,...tier,length,label:tier.label+' LANE'}:null;
 }).filter(Boolean);
 // Explicit risk/reward choice: a short powerful lane feeds the wet side,
 // while a normal dry route remains open. Never place it after a blind bend.
 for(const [i,p]of patches.entries()){
  const tier=BOOST_TIERS[2],u=p.u0-tier.length-8;
  const safe=course.samples.filter(s=>s.u>=u-10&&s.u<=p.u1+45).every(s=>Math.abs(s.curv)<.014);
  if(u>90&&safe&&!lanes.some(l=>Math.abs(l.u-u)<20))lanes.push({...tier,u,latCenter:Math.sign(p.lat)*1.3,risk:'water-exit',label:'NITRO · WET EXIT'});
 }
 lanes.sort((a,b)=>a.u-b.u||a.latCenter-b.latCenter);
 return {...round,carChallenges:{...old,patches,lanes,racecraft:{...old.racecraft,maximumSpeed:66,boostModel:'lane-charge-v2',waterModel:'tyre-water-v2'},refinement:'varied-powered-lines-physical-water-v4'}};
}
export function boostAppearance(lane){
 const style={surge:{color:'#68d9a4',accent:'#e3fff0',scroll:4},attack:{color:'#ffcc00',accent:'#fff2b3',scroll:6},nitro:{color:'#ff6544',accent:'#fff0dd',scroll:9}};
 return style[lane.tier]??{color:'#00e5ff',accent:'#ff2bd6',scroll:6};
}
