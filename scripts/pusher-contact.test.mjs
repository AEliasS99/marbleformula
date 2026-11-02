import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import pusher,{pusherPos} from '../src/gp/obstacles/pusher.js';
import {pusherHeadVertices,pusherHeadGeometry} from '../src/gp/pusher-head.js';
import {buildTrackMesh,pointOnTrack} from '../src/gp/trackMesh.js';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/tuscany-pusher-contact.json',import.meta.url)));
const frameAt=(samples,u)=>{
 let i=0;while(i<samples.length-2&&samples[i+1].u<u)i++;
 const a=samples[i],b=samples[i+1],f=(u-a.u)/(b.u-a.u),mix=k=>a[k].map((v,j)=>v+(b[k][j]-v)*f);
 return {...a,u,p:mix('p'),t:mix('t'),r:mix('r'),n:mix('n'),w:a.w+(b.w-a.w)*f};
};

test('guarded pusher mesh matches collision hull and closes the rear pocket on either wall',()=>{
 for(const {head:p} of fixture.sections){
  const vertices=pusherHeadVertices(p),mesh=pusherHeadGeometry(p),position=mesh.getAttribute('position');
  const points=Array.from({length:vertices.length/3},(_,i)=>Array.from(vertices.slice(i*3,i*3+3)));
  for(let i=0;i<position.count;i++)assert.ok(points.some(q=>new Vector3(...q).distanceTo(new Vector3().fromBufferAttribute(position,i))<1e-6),'picture differs from physical envelope');
  const inward=new Vector3(...p.dir).applyQuaternion(new Quaternion(...p.quat).invert()).z>0?1:-1;
  const rear=Math.min(...points.map(v=>v[2]*inward));
  assert.ok(rear+p.travel<=-p.size[2]/2+1e-6,'rear skirt exposes a marble pocket at full extension');
  assert.equal(mesh.getAttribute('uv').count,position.count);
  mesh.dispose();
 }
});

test('new head is opt-in and retains the saved stroke and timing',()=>{
 const {u,samples}=fixture.sections[0],frame=u=>frameAt(samples,u),legacy={pushers:[]},corrected={pushers:[]};
 pusher.build({u},{frameAt:frame,out:legacy,sync:{}});
 pusher.build({u},{frameAt:frame,out:corrected,sync:{},physicsProfile:'contact-flow-v2'});
 assert.equal(legacy.pushers[0].headShape,undefined);
 assert.equal(corrected.pushers[0].headShape,'guarded-ramp-v1');
 const {headShape,...rest}=corrected.pushers[0];assert.deepEqual(rest,legacy.pushers[0]);
 for(const t of [0,.35,.7,1.05,1.4])assert.deepEqual(pusherPos(corrected.pushers[0],t),pusherPos(legacy.pushers[0],t));
});

test('four real Tuscany pushers clear a fixed 300-case entry grid without recovery or force assistance',async()=>{
 await RAPIER.init();const track=(1<<16)|2,ball=(2<<16)|7;
 for(const {u:u0,samples,head} of fixture.sections){
  const g=buildTrackMesh(samples,{endCaps:false,wallHeight:1.35}).physics;
  for(const lateral of [-1.7,-1.2,0,1.2,1.7])for(const speed of [3,7,11])for(const phase of [0,.2,.4,.6,.8]){
   const world=new RAPIER.World({x:0,y:-25,z:0});world.timestep=1/120;
   try{
    const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.trimesh(g.vertices,g.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.35).setRestitution(.12).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min).setCollisionGroups(track),floor);
    const machine=pusher.physics(world,[{...head,headShape:'guarded-ramp-v1'}],{RAPIER,groups:{track}});
    const s=frameAt(samples,u0-4),p=pointOnTrack(s,lateral,.355);
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...p).setLinvel(...s.t.map(v=>v*speed)).setLinearDamping(.046).setCanSleep(false));
    world.createCollider(RAPIER.ColliderDesc.ball(.35).setFriction(.15).setRestitution(.48).setDensity(2).setCollisionGroups(ball),body);
    let passed=false;
    for(let k=0;k<1440;k++){
     machine.kinematics(k/120+phase*head.period);world.step();const p=body.translation();
     let nearest=samples[0],distance=Infinity;
     for(const q of samples){const d=(p.x-q.p[0])**2+(p.y-q.p[1])**2+(p.z-q.p[2])**2;if(d<distance){distance=d;nearest=q;}}
     assert.ok(p.y>=nearest.p[1]-2,`fell: u${u0}, lane${lateral}, speed${speed}, phase${phase}`);
     const progress=nearest.u+(p.x-nearest.p[0])*nearest.t[0]+(p.y-nearest.p[1])*nearest.t[1]+(p.z-nearest.p[2])*nearest.t[2];
     if(progress>u0+8){passed=true;break;}
    }
    assert.ok(passed,`delayed: u${u0}, lane${lateral}, speed${speed}, phase${phase}`);
   }finally{world.free();}
  }
 }
});
