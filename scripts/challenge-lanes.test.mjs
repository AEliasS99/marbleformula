import {buildObstacles} from './season.mjs';
import {liftCleatPose,pointInFrame} from '../src/gp/trackMesh.js';
import {frameQuat,quatArr} from '../src/gp/obstacles/kit.js';
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import {buildTrackMesh} from '../src/gp/trackMesh.js';
import {OBSTACLES,BY_TYPE} from '../src/gp/obstacles/index.js';
import rollers from '../src/gp/obstacles/rollers.js';
import {AUTHORED_CHALLENGES,challengePlan,CHOICE} from '../src/gp/obstacles/challenge-lanes.js';
import {marbleChallengeAudit} from './marble-challenge-audit.mjs';

test('new lane challenges are authored opt-ins, and the shortcut is physically shorter for a .70m ball',()=>{
 for(const module of AUTHORED_CHALLENGES){assert.equal(BY_TYPE[module.type],module);assert.ok(!OBSTACLES.includes(module),'Legacy shuffled plans must retain their exact pool/order');}
 const plan=challengePlan('route-choice'),main=plan.routes.find(r=>r.id==='main'),fast=plan.routes.find(r=>r.id==='shortcut');
 assert.ok(main.clearWidth>.7&&main.clearWidth<3.1);assert.ok(fast.clearWidth>.7&&fast.clearWidth<1.4);
 // Lower bound between successive permissible BALL CENTRE intervals, rather
 // than claiming the painted zigzag's centreline is mandatory travel.
 const margin=main.clearWidth/2-.35;
 const lower=main.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-main.points[i][0],Math.max(0,Math.abs(p[1]-main.points[i][1])-2*margin),(p[2]??0)-(main.points[i][2]??0)),0);
 assert.ok(lower>CHOICE.length*1.025,'A marble could cut the chicane as short as the supposed shortcut');
 const needle=challengePlan('single-lane');assert.ok(needle.clearWidth>.7&&needle.clearWidth<1.4);
 assert.throws(()=>challengePlan('single-lane',{halfWidth:.8}),/full-width/);
});

async function physicalPass(type,{speed=5,phase=0,side=1}={}){
 await RAPIER.init();const world=new RAPIER.World({x:0,y:-25,z:0});world.timestep=1/120;
 const q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-.13),inverse=q.clone().invert(),V=a=>new Vector3(...a).applyQuaternion(q).toArray();
 const frameAt=u=>({u,p:V([u,0,0]),t:V([1,0,0]),n:V([0,1,0]),r:[0,0,1],w:2.1,curv:0});
 const samples=Array.from({length:135},(_,i)=>frameAt(-15+i*.5)),statics=[],out={rollers:[]};
 BY_TYPE[type].build({type,u:0,side},{frameAt,statics,out});

 if(type==='route-choice'){
  const actual=buildObstacles({frameAt,features:[{type,u:0}],samples,END:45,elevators:[]}).statics.filter(o=>o.kind==='guard'&&o.size[1]===2.4);
  for(const o of actual){const q=new Quaternion(...o.quat),offset=new Vector3(0,0,o.side*(o.depth/2-o.size[2]/2)).applyQuaternion(q);statics.push({...o,pos:o.pos.map((v,i)=>v+offset.toArray()[i]),size:[o.size[0],o.size[1],o.depth]});}
 }

 const add=(shape,body)=>world.createCollider(shape.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),body);
 try{
  const mesh=buildTrackMesh(samples,{endCaps:false,wallHeight:1.4}).physics;
  add(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.35).setRestitution(.12));
  for(const o of statics){const b=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...o.pos).setRotation(new Quaternion(...o.quat)));
   add((o.shape==='convex'?RAPIER.ColliderDesc.convexHull(new Float32Array(o.vertices)):o.shape==='box'?RAPIER.ColliderDesc.cuboid(...o.size.map(x=>x/2)):RAPIER.ColliderDesc.cylinder(o.height/2,o.radius)).setFriction(o.friction).setRestitution(o.restitution),b);
  }
  const machine=rollers.physics(world,out.rollers,{RAPIER,groups:{track:0xffffffff}});
  const lift=out.lifts?.[0];
  const carriers=type==='route-choice'?Array.from({length:lift.count},(_,k)=>{
   const pose=liftCleatPose(lift,k,phase,frameAt),body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...pose.pos).setRotation(new Quaternion(...pose.quat)));
   add(RAPIER.ColliderDesc.cuboid(.06,.17,lift.half).setFriction(.5).setRestitution(.05),body);return body;
  }):[];

  const actors=Array.from({length:20},(_,i)=>{
   const p=V([-6-Math.floor(i/5)*.84,.36,(i%5-2)*.72]),v=V([speed,0,0]);
   const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...p).setLinvel(...v).setLinearDamping(.046).setAngvel({x:0,y:0,z:-speed/.35}).setCanSleep(false));
   add(RAPIER.ColliderDesc.ball(.35).setFriction(.15).setRestitution(.48).setDensity(2),b);return b;
  });
  const end=out.challengeZones[0].u1,finish=Array(20).fill(null),frames=[];
  for(let step=0;step<120*18;step++){
   machine.kinematics(step/120);
   carriers.forEach((b,k)=>{const p=liftCleatPose(lift,k,step/120+phase,frameAt);b.setNextKinematicTranslation({x:p.pos[0],y:p.pos[1],z:p.pos[2]});b.setNextKinematicRotation(new Quaternion(...p.quat));});world.step();
   if(step%2)continue;
   const row=actors.map((b,i)=>{const p=b.translation(),pose=new Vector3(p.x,p.y,p.z).applyQuaternion(inverse),rot=b.rotation();if(finish[i]===null&&pose.x>end+.3)finish[i]=frames.length;return [p.x,p.y,p.z,rot.x,rot.y,rot.z,rot.w,pose.x];});frames.push(row);
   if(finish.every(f=>f!==null))break;
  }
  const data={fps:60,marbleRadius:.35,info:{length:80,laps:1,finish:40},timeline:{raceStart:0},samples,features:[{type,u:0}],challengeZones:out.challengeZones,obstacles:statics,rollers:out.rollers,lifts:out.lifts??[],frames,marbles:finish.map((f,i)=>({abbr:'M'+i,finishFrame:f,dqFrame:null}))};
  const audit=marbleChallengeAudit(data);
  if(process.env.CHALLENGE_EVIDENCE_DIR){fs.mkdirSync(process.env.CHALLENGE_EVIDENCE_DIR,{recursive:true});fs.writeFileSync(process.env.CHALLENGE_EVIDENCE_DIR+'/'+type+'-'+speed+'-'+phase+'-'+side+'.json',JSON.stringify({data,audit}));}
  assert.ok(finish.every(f=>f!==null),type+' trapped a full pack: '+JSON.stringify(actors.flatMap((b,i)=>finish[i]===null?[{i,pos:b.translation(),velocity:b.linvel()}]:[])));
  assert.ok(audit.passed,type+': '+JSON.stringify(audit));
  return data;
 }finally{world.free();}
}
test('twenty real rigid bodies pass the single lane and its audit rejects a recorded bypass',async()=>{
 const data=await physicalPass('single-lane'),bad=structuredClone(data);
 for(const row of bad.frames)for(const p of row)if(p[7]>=8&&p[7]<=12)p[2]+=1.2;
 assert.ok(!marbleChallengeAudit(bad).passed);
 const missing=structuredClone(data);missing.obstacles=[];assert.ok(!marbleChallengeAudit(missing).passed);
});
test('elevated choice reuses actual lift cleats across entry speeds, drive phases and mirrored sides',async()=>{
 for(const speed of [2.5,9,18,25])for(const phase of [0,.1,.2])for(const side of [1,-1])await physicalPass('route-choice',{speed,phase,side});
});
test('raised route audit rejects missing decks, buried passages and absent carrier geometry',async()=>{
 const data=await physicalPass('route-choice');
 for(const defect of ['decks','carrier','underpass']){
  const bad=structuredClone(data);
  if(defect==='decks')bad.obstacles=bad.obstacles.filter(o=>o.kind!=='challenge-deck');
  if(defect==='carrier')bad.lifts=[];
  if(defect==='underpass')for(const row of bad.frames)for(const p of row)if(p[7]>4&&p[7]<18&&p[2]>-.9){p[0]-=Math.sin(.13)*1.5;p[1]-=Math.cos(.13)*1.5;}
  assert.ok(!marbleChallengeAudit(bad).passed,defect+' must not pass');
 }
});
test('full-width powered drums actually engage the pack; a sunk non-working bank fails',async()=>{
 const data=await physicalPass('roller-bank'),bad=structuredClone(data);bad.rollers.forEach(r=>r.pos[1]-=3);
 assert.ok(!marbleChallengeAudit(bad).passed);
});

test('open physical guides contain rolling packs at measured India70 approach speeds',async()=>{
 for(const type of ['single-lane','roller-bank'])for(const speed of [2.5,9,18,25])await physicalPass(type,{speed});
});
