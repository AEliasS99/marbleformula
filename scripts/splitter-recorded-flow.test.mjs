import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import {buildTrackMesh} from '../src/gp/trackMesh.js';
import splitter from '../src/gp/obstacles/splitter.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/austria-splitter-recoil.json',import.meta.url)));

// Recreate recorded road/guard/post geometry. Velocities come only from the
// saved approach; no rescue, impulse, or target velocity is applied thereafter.
function traverse(c,height,speedScale,lateralOffset,restitution=.4){
 const world=new RAPIER.World({x:0,y:-25,z:0});world.timestep=1/120;
 try{
  const surface=c.samples.reduce((a,b)=>Math.abs(a.u-c.u)<Math.abs(b.u-c.u)?a:b);
  const start=c.position.map((v,j)=>v+lateralOffset*surface.r[j]);
  const add=(desc,b)=>world.createCollider(desc.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),b);
  const mesh=buildTrackMesh(c.samples,{endCaps:false,wallHeight:1.35}).physics;
  add(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.35).setRestitution(.12));
  for(const o of c.obstacles){
   const q=new Quaternion(...o.quat),center=new Vector3(...o.pos);
   if(['bumper','peg'].includes(o.kind))center.add(new Vector3(0,(height-o.height)/2,0).applyQuaternion(q));
   const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x,center.y,center.z).setRotation(q));
   let shape;
   if(o.shape==='cylinder')shape=RAPIER.ColliderDesc.cylinder((['bumper','peg'].includes(o.kind)?height:o.height)/2,o.radius);
   else if(o.shape==='box'){
    shape=RAPIER.ColliderDesc.cuboid(o.size[0]/2,o.size[1]/2,(o.depth??o.size[2])/2);
    if(o.depth)shape.setTranslation(0,0,o.side*(o.depth/2-o.size[2]/2));
   }else throw Error('Unsupported recorded static shape');
   add(shape.setFriction(o.friction??.2).setRestitution(o.kind==='bumper'?restitution:o.kind==='guard'?.2:o.kind==='fin'?.32:o.kind==='splitter'?.22:.3),body);
  }
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...start).setRotation(new Quaternion(...c.quaternion)).setLinvel(...c.velocity.map(v=>v*speedScale)).setLinearDamping(.046).setCanSleep(false));
  add(RAPIER.ColliderDesc.ball(.35).setFriction(.15).setRestitution(.48).setDensity(2),body);
  let enter=null,exit=null,escaped=false;
  for(let step=0;step<720;step++){
   world.step();const p=body.translation();
   const nearest=c.samples.reduce((r,s)=>{const distance=Math.hypot(s.p[0]-p.x,s.p[1]-p.y,s.p[2]-p.z);return distance<r.distance?{distance,u:s.u}:r;},{distance:Infinity});
   if(enter===null&&nearest.u>=c.u-1)enter=step;
   if(enter!==null&&exit===null&&nearest.u>=c.u+5)exit=step;
   const road=c.samples.reduce((a,s)=>Math.hypot(s.p[0]-p.x,s.p[2]-p.z)<Math.hypot(a.p[0]-p.x,a.p[2]-p.z)?s:a);
   const delta=[p.x-road.p[0],p.y-road.p[1],p.z-road.p[2]];
   if(Math.abs(delta.reduce((n,v,j)=>n+v*road.r[j],0))>road.w+.35||delta.reduce((n,v,j)=>n+v*road.n[j],0)<-1)escaped=true;
   // Follow landing beyond the transit window: a fast exit alone missed falls.
   if(nearest.u>=c.u+12)return {seconds:exit===null?Infinity:(exit-enter)/120,escaped};
  }
  return {seconds:Infinity,escaped};
 }finally{world.free();}
}

test('recorded Wachau splitter recoil clears under gravity with low physical hazard caps',async()=>{
 await RAPIER.init();process.env.GP_CARS='0';
 const parts=[],statics=[],out={boosters:[]};
 const frameAt=u=>({u,p:[u,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1});
 splitter.build({u:515},{physicsProfile:'contact-flow-v3',frameAt,statics,out,cylinder:(kind,u,lat,r,h,restitution,extra)=>parts.push({kind,u,lat,r,h,restitution,...extra})});
 const hazards=parts.filter(p=>['bumper','peg'].includes(p.kind));
 assert.equal(hazards.length,3);assert.equal(statics.length,2);assert.equal(out.boosters.length,1);
 assert.ok(hazards.every(p=>p.h-.12<.35/2));assert.ok(hazards.every(p=>p.restitution===.2));
 const legacy=[];splitter.build({u:515},{physicsProfile:'contact-flow-v2',frameAt,statics:[],out:{boosters:[]},cylinder:(kind,u,lat,r,h)=>legacy.push({kind,h})});
 assert.ok(legacy.filter(p=>['bumper','peg'].includes(p.kind)).every(p=>p.h===.85),'legacy take geometry changed');
 const control=fixture.cases.map(c=>traverse(c,.85,1,0,.45));
 console.log('recorded control transit',control);
 assert.ok(control.slice(0,2).some(r=>r.seconds>3),'control failed to reproduce saved recoil');
 for(const c of fixture.cases)for(const speed of [.85,1,1.15])for(const offset of [-.07,0,.07]){
  const result=traverse(c,hazards[0].h,speed,offset,.2);
  // A saved mid-recoil pose already contains upstream velocity from the old
  // collision. It must escape safely, but cannot undo that earlier lost time.
  // Fresh approaches and the full-race audit retain the strict 3-second limit.
  const limit=c.phase==='approach'?3:6;
  assert.ok(result.seconds<limit,`${c.country} frame${c.frame}: ${result.seconds}s at speed${speed}/offset${offset}`);
  assert.equal(result.escaped,false,`${c.country}: escaped after splitter`);
 }
});
