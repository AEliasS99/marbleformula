import {PerspectiveCamera,Quaternion,Vector3} from 'three';
import {sampleReplay} from '../../designer/public/replay.js';
const V=a=>new Vector3(...a),distance=(a,b)=>V(a.slice(0,3)).distanceTo(V(b.slice(0,3)));
const result=(r,i)=>r.standings.find(s=>s.id===r.participants[i].id);
const active=(r,s,t)=>r.participants.map((_,i)=>i).filter(i=>t<result(r,i).time&&s.telemetry[i].speed>1);
const rank=(s,ids)=>[...ids].sort((a,b)=>s.telemetry[b].u-s.telemetry[a].u||a-b);
// Decisions depend only on recorded telemetry. Seeking/rendering out of order is identical.
export function planCameras(r){
 const shots=[],finishes=r.standings.filter(s=>s.status==='finished').sort((a,b)=>a.time-b.time),finishStart=Math.max(0,(finishes[0]?.time??Infinity)-3.5);
 let current=null;
 for(let t=0;t<=r.duration+.001;t+=.25){
  const s=sampleReplay(r,t),ids=rank(s,active(r,s,t)),lead=ids[0];let candidate;
  const nearFinish=finishes.some(f=>f.time>=t-1&&f.time<=t+3.5);
  if(nearFinish)candidate={kind:'finish',ids:r.participants.map((_,i)=>i).filter(i=>result(r,i).status==='finished'),priority:100,reason:'Protect every finish crossing'};
  else {
   const before=sampleReplay(r,Math.max(0,t-.5));
   const unfinished=r.participants.map((_,i)=>i).filter(i=>t<result(r,i).time);
   const incident=unfinished.find(i=>t>1&&((s.telemetry[i].up<.55&&before.telemetry[i].up>=.55)||(before.telemetry[i].speed-s.telemetry[i].speed>6&&before.telemetry[i].speed>8)));
   const oldRank=rank(before,ids);
   const pass=ids.find(i=>ids.indexOf(i)<oldRank.indexOf(i)&&ids.some(j=>j!==i&&distance(s.racers[i],s.racers[j])<7));
   const elim=r.events.find(e=>e.status==='eliminated'&&e.time>=t&&e.time-t<.8);const ei=r.participants.findIndex(p=>p.id===elim?.participantId);
   const pairs=[];for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){const i=ids[a],j=ids[b],d=distance(s.racers[i],s.racers[j]);if(d<7&&Math.abs(s.telemetry[i].u-s.telemetry[j].u)<8)pairs.push({ids:[i,j],score:12-d+(a===0?2:0)});}pairs.sort((a,b)=>b.score-a.score);
   if(incident!==undefined)candidate={kind:'incident',ids:[incident,...ids.filter(j=>j!==incident&&distance(s.racers[incident],s.racers[j])<7).slice(0,2)],priority:90,reason:'Recorded rollover or sharp loss of speed'};
   else if(pass!==undefined)candidate={kind:'overtake',ids:[pass,...ids.filter(j=>j!==pass&&distance(s.racers[pass],s.racers[j])<7).slice(0,2)],priority:80,reason:'Live order changed in a close battle'};
   else if(ei>=0&&ids.includes(ei))candidate={kind:'checkpoint',ids:[ei,...ids.filter(j=>j!==ei&&distance(s.racers[ei],s.racers[j])<10).slice(0,2)],priority:70,reason:'Checkpoint elimination approach'};
   else if(t<2||Math.floor(t/8)%2===1)candidate={kind:'drone',ids:ids.filter(i=>lead!==undefined&&distance(s.racers[lead],s.racers[i])<16).slice(0,6),priority:20,reason:'Locate the moving lead pack'};
   else if(pairs.length)candidate={kind:'battle',ids:pairs[0].ids,priority:40,reason:'Close running cars'};
   else candidate={kind:'leader',ids:lead===undefined?[]:[lead],priority:10,reason:'Current live leader'};
  }
  const alive=current?.ids.some(i=>t<result(r,i).time&&(current.kind==='incident'||s.telemetry[i].speed>1));
  const age=current?t-current.start:Infinity;
  const beforeFinish=finishStart>t&&finishStart-t<1.5&&candidate.priority<80;
  if(!current||current.kind==='finish'&&!nearFinish||candidate.kind==='finish'&&current.kind!=='finish'||!alive&&current.kind!=='finish'||!beforeFinish&&age>=3&&(candidate.kind!==current.kind||candidate.ids.join()!==current.ids.join())||candidate.priority>=80&&candidate.priority>current.priority&&age>=1.5||!beforeFinish&&age>=6&&current.kind!=='finish'){
   if(current)current.end=t;current={...candidate,start:t,end:r.duration+.01};shots.push(current);
  }

 }
 return shots;
}
export function cameraAt(r,shots,time,finish,aspect=16/9){
 const t=Math.max(0,Math.min(r.duration,time)),s=sampleReplay(r,t),shot=shots.find(x=>t>=x.start&&t<x.end)||shots.at(-1);
 const running=rank(s,active(r,s,t));let ids=shot.ids.filter(i=>t<result(r,i).time+(shot.kind==='finish'?.15:0));
 if(shot.kind==='finish')ids=ids.filter(i=>result(r,i).time-t<4);
 if(!ids.length&&shot.kind!=='finish')ids=running.slice(0,3);
 const points=ids.map(i=>V(s.racers[i].slice(0,3)));
 if(shot.kind==='finish')points.push(V(finish.position));
 if(!points.length)points.push(V(finish.position));
 let center=points.reduce((v,p)=>v.add(p),new Vector3()).divideScalar(points.length);
 // Smooth chassis vibration, without mutable camera history or smearing editorial cuts.
 let forward=V(finish.tangent).setY(0).normalize();
 if(shot.kind!=='finish'&&ids.length){const i=ids[0],a=sampleReplay(r,Math.max(0,t-.2)).racers[i],b=sampleReplay(r,Math.min(r.duration,t+.2)).racers[i];const v=V(b.slice(0,3)).sub(V(a.slice(0,3))).setY(0);if(v.length()>.1)forward=v.normalize();else forward=new Vector3(0,0,1).applyQuaternion(new Quaternion(...s.racers[i].slice(3))).setY(0).normalize();}
 const side=new Vector3().crossVectors(forward,new Vector3(0,1,0)).normalize();
 const radius=Math.max(2.8,...points.map(p=>p.distanceTo(center)+1.3));
 const drone=shot.kind==='drone',finishShot=shot.kind==='finish';
 const direction=forward.clone().multiplyScalar(finishShot?-.65:-1).addScaledVector(side,finishShot?1.6:.8).add(new Vector3(0,drone?2.6:finishShot?1.1:.85,0)).normalize();
 const fov=drone?48:44,half=Math.tan(fov*Math.PI/360),dist=Math.max(drone?15:12,radius/(half*Math.min(aspect,1)) *1.22);
 const camera=new PerspectiveCamera(fov,aspect,.05,1500);camera.position.copy(center).addScaledVector(direction,dist);
 // Reserve left side for the timing tower and upper band for titles.
 camera.lookAt(center);const right=new Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new Vector3(0,1,0).applyQuaternion(camera.quaternion);
 const target=center.clone().addScaledVector(right,-dist*half*aspect*.14).addScaledVector(up,dist*half*.08);
 camera.lookAt(target);camera.updateMatrixWorld();
 return {kind:shot.kind,reason:shot.reason,ids,position:camera.position.toArray(),target:target.toArray(),fov,points:points.map(p=>p.toArray())};
}
