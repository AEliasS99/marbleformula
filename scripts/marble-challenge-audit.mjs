import {routeOffset} from '../src/gp/route-path.js';
import {Quaternion,Vector3,Triangle} from 'three';
import {laneAt} from '../src/gp/obstacles/challenge-lanes.js';
const pathLength=p=>p.slice(1).reduce((n,v,i)=>n+Math.hypot(v[0]-p[i][0],v[1]-p[i][1],(v[2]??0)-(p[i][2]??0)),0);
// A wide painted zigzag can be cut straight. Bound actual ball-centre travel
// between each corridor cross-section, including the recorded ball radius.
const shortestCorridorTravel=(route,radius)=>{
 const freedom=Math.max(0,route.clearWidth-2*radius);
 return route.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-route.points[i][0],Math.max(0,Math.abs(p[1]-route.points[i][1])-freedom),(p[2]??0)-(route.points[i][2]??0)),0);
};
const at=(samples,u)=>{
 let lo=0,hi=samples.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(samples[m].u<=u)lo=m;else hi=m;}
 const a=samples[lo],b=samples[hi],t=Math.max(0,Math.min(1,(u-a.u)/(b.u-a.u)));
 return Object.fromEntries(['p','t','n','r'].map(k=>[k,a[k].map((v,i)=>v+(b[k][i]-v)*t)]));
};
export function marbleChallengeAudit(data){
 const zones=data.challengeZones??[],expected=(data.features??[]).filter(f=>['single-lane','route-choice','roller-bank'].includes(f.type));
 if(!zones.length&&!expected.length)return {required:false,passed:true,method:'independent-saved-challenge-transit'};
 const failures=[],visits=[],routeUse={shortcut:0,main:0},r=data.marbleRadius;
 if(!(r>0)||zones.length!==expected.length)failures.push({reason:'missing challenge geometry or actual radius'});
 for(const zone of zones){
  if(!expected.some(f=>f.type===zone.type&&Math.abs(f.u-zone.u0)<.001))failures.push({zone:zone.id,reason:'challenge does not match authored feature'});
  if(zone.type!=='roller-bank'&&!(data.obstacles??[]).some(o=>o.challengeZone===zone.id&&o.kind==='fin'))failures.push({zone:zone.id,reason:'missing physical lane walls'});
  if(zone.type==='route-choice'){
   const fast=zone.routes?.find(x=>x.id==='shortcut'),main=zone.routes?.find(x=>x.id==='main');
   if(!fast||!main||!(fast.clearWidth>2*r)||!(main.clearWidth>2*r)||!(shortestCorridorTravel(main,r)>pathLength(fast.points)*1.025))failures.push({zone:zone.id,reason:'shortcut is not physically shorter'});
   if(zone.topology==='raised-main-v1'&&main){
    const decks=(data.obstacles??[]).filter(o=>o.challengeZone===zone.id&&o.kind==='challenge-deck');
    const triangles=decks.flatMap(o=>{
     if(o.shape!=='convex'||o.vertices?.length!==24)return [];
     const q=new Quaternion(...o.quat),p=new Vector3(...o.pos),v=Array.from({length:8},(_,i)=>new Vector3(...o.vertices.slice(i*3,i*3+3)).applyQuaternion(q).add(p));
     return [new Triangle(v[4],v[5],v[6]),new Triangle(v[4],v[6],v[7])];
    });
    const floorMatches=main.points.every(([u,lat,h])=>{
     const s=at(data.samples,zone.u0+u),p=new Vector3(...s.p.map((v,k)=>v+s.r[k]*lat+s.n[k]*(h??0)));
     return triangles.some(tri=>tri.closestPointToPoint(p,new Vector3()).distanceTo(p)<.04);
    });
    if(decks.length!==44||!floorMatches)failures.push({zone:zone.id,reason:'raised route surface missing or mismatched'});
    const lift=(data.lifts??[]).find(l=>l.challengeZone===zone.id);
    if(!lift?.path||lift.speed!==4||lift.count!==22||!lift.path.points.every(([u,,h])=>Math.abs(h-routeOffset(main.points,u)[1])<.001))failures.push({zone:zone.id,reason:'raised route carrier missing or mismatched'});
   }else if(zone.routes?.some(route=>route.points.some(p=>(p[2]??0)!==0)))failures.push({zone:zone.id,reason:'unsupported vertical route topology'});

  }
  const drums=(data.rollers??[]).filter(o=>o.challengeZone===zone.id);
  if(zone.type==='roller-bank'&&drums.length!==5)failures.push({zone:zone.id,reason:'missing full-width physical drums'});
  for(let lap=0;lap<data.info.laps;lap++)for(let i=0;i<data.marbles.length;i++){
   const marble=data.marbles[i],offset=lap*data.info.length,start=zone.u0+offset,end=zone.u1+offset,poses=[];let enter=null,exit=null;
   for(let f=data.timeline.raceStart;f<data.frames.length;f++){
    if(marble.dqFrame!=null&&f>=marble.dqFrame||marble.finishFrame!=null&&f>marble.finishFrame)break;
    const p=data.frames[f][i],u=p[7];
    if(enter===null&&u>=start&&u<end)enter=f;
    if(enter!==null){if(u>=end){exit=f;break;}poses.push({f,p,u:u-offset});}
   }
   if(enter===null)continue;
   if(exit===null&&marble.dqFrame!=null)continue;
   const row={zone:zone.id,type:zone.type,marble:i,country:marble.abbr,lap:lap+1,enter,exit,seconds:((exit??data.frames.length)-enter)/data.fps};
   if(exit===null||row.seconds>8)failures.push({...row,reason:'stalled or excessive challenge transit'});
   if(zone.type==='single-lane'){
    const throat=poses.filter(x=>x.u>=zone.u0+(zone.throatStart??8)&&x.u<=zone.u0+(zone.throatEnd??12));
    row.throatSamples=throat.length;
    row.bypassSamples=throat.filter(({p,u})=>{const s=at(data.samples,u),delta=p.slice(0,3).map((v,k)=>v-s.p[k]),lat=delta.reduce((n,v,k)=>n+v*s.r[k],0);return Math.min(...zone.routes.map(route=>Math.abs(lat-laneAt(route.points,u-zone.u0))))+r>zone.clearWidth/2+.055;}).length;
    if(!throat.length||row.bypassSamples)failures.push({...row,reason:'single lane bypassed or unobserved'});
   }else if(zone.type==='route-choice'){
    const mid=poses.filter(x=>x.u>=zone.u0+9&&x.u<=zone.u0+13),score={shortcut:0,main:0};
    for(const {p,u}of mid){const s=at(data.samples,u),lat=p.slice(0,3).reduce((n,v,k)=>n+(v-s.p[k])*s.r[k],0);for(const route of zone.routes)score[route.id]+=Math.abs(lat-laneAt(route.points,u-zone.u0))/Math.max(.01,route.clearWidth/2-r+.055);}
    if(!mid.length)failures.push({...row,reason:'branch passage not observed'});
    else{
     row.route=score.shortcut<score.main?'shortcut':'main';routeUse[row.route]++;
     const route=zone.routes.find(route=>route.id===row.route);
     const interior=poses.filter(x=>x.u>=zone.u0+2&&x.u<=zone.u1-2);
     row.bypassSamples=interior.filter(({p,u})=>{const s=at(data.samples,u),lat=p.slice(0,3).reduce((n,v,k)=>n+(v-s.p[k])*s.r[k],0);return Math.abs(lat-laneAt(route.points,u-zone.u0))+r>route.clearWidth/2+.055;}).length;
     if(row.bypassSamples)failures.push({...row,reason:'route corridor bypassed'});
     if(zone.topology==='raised-main-v1'){
      row.belowSurfaceSamples=interior.filter(({p,u})=>{const s=at(data.samples,u),height=p.slice(0,3).reduce((n,v,k)=>n+(v-s.p[k])*s.n[k],0),surface=routeOffset(route.points,u-zone.u0)[1];return height-r<surface-.08;}).length;
      if(row.belowSurfaceSamples)failures.push({...row,reason:'recorded passage below raised route surface'});
     }

    }
   }else if(zone.type==='roller-bank'){
    row.workingSurfaceContact=poses.some(({p})=>drums.some(d=>{const local=new Vector3(...p.slice(0,3)).sub(new Vector3(...d.pos)).applyQuaternion(new Quaternion(...d.quat).invert());return Math.abs(local.z)<d.length/2+.03&&Math.hypot(local.x,local.y)<=d.radius+r+.055;}));
   }
   visits.push(row);
  }
 }
 for(const zone of zones){
  const rows=visits.filter(v=>v.zone===zone.id);
  if(!rows.length)failures.push({zone:zone.id,reason:'no actual traversal'});
  if(zone.type==='route-choice'&&rows.length>=6&&(!rows.some(v=>v.route==='main')||!rows.some(v=>v.route==='shortcut')))failures.push({zone:zone.id,reason:'only one branch used in this challenge'});
  if(zone.type==='roller-bank'&&rows.filter(v=>v.workingSurfaceContact).length/rows.length<.8)failures.push({zone:zone.id,reason:'too many marbles bypassed the working surface'});
 }
 if(routeUse.main+routeUse.shortcut>=6&&(!routeUse.main||!routeUse.shortcut))failures.push({reason:'only one branch used; no demonstrated route choice',routeUse});
 return {required:true,passed:failures.length===0,method:'independent-saved-challenge-transit',zones:zones.length,visits:visits.length,routeUse,drumContactFraction:visits.filter(v=>v.type==='roller-bank'&&v.workingSurfaceContact).length/(visits.filter(v=>v.type==='roller-bank').length||1),failures,worst:[...visits].sort((a,b)=>b.seconds-a.seconds).slice(0,15)};
}
