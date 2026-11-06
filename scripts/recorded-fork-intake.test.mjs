import fs from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import {buildTrackMesh,liftCleatPose,pointInFrame} from '../src/gp/trackMesh.js';
import {buildRaisedChoice} from '../src/gp/obstacles/raised-choice.js';
import {marbleChallengeAudit} from '../scripts/marble-challenge-audit.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import jaipur from '../src/gp/circuits/r13-jaipur.js';

// Spawn each marble once at its recorded approach, using velocity estimated
// from neighboring poses. This exercises real contact and lift phase locally.
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/india70-fork-arrivals.json', import.meta.url)));
const {radius, length} = fixture;
await RAPIER.init();
test('Jaipur fork guides redistribute the recorded wall-biased arrivals through both real branches', () => {
 for (const {zone, samples, guards, arrivals} of fixture.cases) {
  const authored = jaipur.layout.find(entry => entry.u === zone.u0);
  assert.ok(authored && [-1, 1].includes(authored.intakeSide));
 const sVec=samples.map(s=>new Vector3(...s.p));
 const frameAt=u=>{
  const i=samples.findIndex(s=>s.u>=u);
  if(i<1)return samples[i<0?samples.length-1:0];
  const a=samples[i-1],b=samples[i],k=(u-a.u)/(b.u-a.u);
  return {...a,u,...Object.fromEntries(['p','r','n','t'].map(key=>[key,a[key].map((v,j)=>v+(b[key][j]-v)*k)]))};
 };
 const mesh=buildTrackMesh(samples,{endCaps:false,wallHeight:1.35}).physics;
 for (const useGuide of [false, true]) {
  const world=new RAPIER.World({x:0,y:-25,z:0});world.timestep=1/120;
  try{
   const add=(s,b)=>world.createCollider(s.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),b);
   add(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.35).setRestitution(.12));
   const statics=[...guards],out={};
   buildRaisedChoice({type:'route-choice',u:zone.u0,side:zone.side,...(useGuide ? {intakeSide: authored.intakeSide} : {})},{frameAt,statics,out});
   for(const o of statics){
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...o.pos).setRotation(new Quaternion(...o.quat)));
    const shape=o.shape==='convex'?RAPIER.ColliderDesc.convexHull(new Float32Array(o.vertices)):RAPIER.ColliderDesc.cuboid(o.size[0]/2,o.size[1]/2,(o.depth??o.size[2])/2);
    if(o.depth)shape.setTranslation(0,0,o.side*(o.depth/2-o.size[2]/2));
    add(shape.setFriction(o.friction??.2).setRestitution(o.restitution??.3),body);
   }
   const lift=out.lifts[0];
   const carriers=Array.from({length:lift.count},(_,k)=>{
    const pose=liftCleatPose(lift,k,arrivals[0].f/60,frameAt);
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...pose.pos).setRotation(new Quaternion(...pose.quat)));
    add(RAPIER.ColliderDesc.cuboid(.06,.17,lift.half).setFriction(.5).setRestitution(.08),body);
    return body;
   });
   const active=new Map(),frames=[],marbles=arrivals.map(({country})=>({abbr:country,finishFrame:null,dqFrame:null}));
   let next=0;
   for(let tick=arrivals[0].f*2;tick<=arrivals.at(-1).f*2+120*10;tick++){
    while(next<arrivals.length&&arrivals[next].f*2<=tick){
     const {pose:p,before,after}=arrivals[next];
     const q=new Quaternion(...p.slice(3,7)),dq=new Quaternion(...after.slice(3,7)).multiply(new Quaternion(...before.slice(3,7)).invert()).normalize();
     if(dq.w<0)dq.set(-dq.x,-dq.y,-dq.z,-dq.w);
     const den=Math.hypot(dq.x,dq.y,dq.z),angle=2*Math.acos(Math.min(1,dq.w)),omega=den<1e-5?[0,0,0]:[dq.x,dq.y,dq.z].map(v=>v*angle*30/den);
     const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...p.slice(0,3)).setRotation(q).setLinvel(...p.slice(0,3).map((_,k)=>(after[k]-before[k])*30)).setAngvel({x:omega[0],y:omega[1],z:omega[2]}).setLinearDamping(.046).setCanSleep(false));
     add(RAPIER.ColliderDesc.ball(radius).setFriction(.15).setRestitution(.48).setDensity(2),body);active.set(next++,body);
    }
    carriers.forEach((body,k)=>{const pose=liftCleatPose(lift,k,(tick+1)/120,frameAt);body.setNextKinematicTranslation({x:pose.pos[0],y:pose.pos[1],z:pose.pos[2]});body.setNextKinematicRotation(new Quaternion(...pose.quat));});
    world.step();if(tick%2)continue;
    const row=marbles.map(()=>[0,0,0,0,0,0,1,-999]);
    for(const [i,body] of active){
     const tr=body.translation(),p=new Vector3(tr.x,tr.y,tr.z);let index=0,dist=Infinity;
     for(let j=0;j<sVec.length;j++){const v=p.distanceToSquared(sVec[j]);if(v<dist){dist=v;index=j;}}
     const near=samples[index],u=near.u+p.clone().sub(sVec[index]).dot(new Vector3(...near.t));
     const q=body.rotation();row[i]=[p.x,p.y,p.z,q.x,q.y,q.z,q.w,u];
     if(u>=zone.u1){marbles[i].finishFrame=frames.length;world.removeRigidBody(body);active.delete(i);}
    }
    frames.push(row);if(next===arrivals.length&&active.size===0)break;
   }
   const audit=marbleChallengeAudit({fps:60,marbleRadius:radius,info:{laps:1,length},timeline:{raceStart:0},samples,frames,marbles,features:[{type:zone.type,u:zone.u0}],challengeZones:out.challengeZones,obstacles:statics,lifts:out.lifts});
   if (useGuide) {
    assert.ok(marbles.every(m => m.finishFrame !== null), zone.id + ' trapped an arrival');
    assert.ok(audit.passed, JSON.stringify(audit.failures));
    assert.ok(audit.routeUse.shortcut > 0 && audit.routeUse.main > 0, zone.id);
   } else if (zone.u0 !== 745) {
    // The approximate replay reproduces two of the three one-sided forks.
    assert.ok(audit.failures.some(f => f.zone === zone.id && f.reason === 'only one branch used in this challenge'));
   }
  } finally {
   world.free();
  }
 }
 }
});
