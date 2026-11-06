import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion} from 'three';
import {buildTrackMesh,pointInFrame,TRACK,TRACK_DEPTH} from '../src/gp/trackMesh.js';
import {frameQuat} from '../src/gp/obstacles/kit.js';
import hammer from '../src/gp/obstacles/hammer.js';
import pusher from '../src/gp/obstacles/pusher.js';
import splitter from '../src/gp/obstacles/splitter.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/austria-machine-containment.json',import.meta.url)));
const modules={hammer,pusher,splitter};

// Replay a recorded hammer arrival and airborne pre-escape poses against the
// actual local road/machine. Airborne cases verify containment, not the impact.
// No corrective forces, rescue teleports, race result or winner is used.
function traverse(c,repaired,speed=1,offset=0){
 const world=new RAPIER.World({x:0,y:-25,z:0});world.timestep=1/120;
 try{
  const add=(shape,body)=>world.createCollider(shape.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),body);
  const mesh=buildTrackMesh(c.samples,{endCaps:false,wallHeight:1.35}).physics;
  add(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.35).setRestitution(.12));
  for(const o of c.obstacles){
   const b=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...o.pos).setRotation(new Quaternion(...o.quat)));
   let shape=o.shape==='cylinder'?RAPIER.ColliderDesc.cylinder(o.height/2,o.radius):RAPIER.ColliderDesc.cuboid(o.size[0]/2,o.size[1]/2,(o.depth??o.size[2])/2);
   if(o.depth)shape.setTranslation(0,0,o.side*(o.depth/2-o.size[2]/2));
   add(shape.setFriction(o.friction??.2).setRestitution(o.kind==='bumper'?o.restitution:o.kind==='guard'?.2:o.kind==='fin'?.32:o.kind==='splitter'?.22:.3),b);
  }
  const frameAt=u=>c.samples.reduce((a,s)=>Math.abs(a.u-u)<Math.abs(s.u-u)?a:s);
  const zone=repaired?modules[c.kind].guardProfiles?.['contact-flow-v3']:null;
  if(zone)for(let u=c.u+zone[0];u<c.u+zone[1];u++)for(const side of[-1,1]){
   const s=frameAt(u+.5),h=zone[2],pos=pointInFrame(s,side*(s.w+TRACK.wall/2),TRACK_DEPTH+h/2-.05);
   const b=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...pos).setRotation(frameQuat(s)));
   add(RAPIER.ColliderDesc.cuboid(.52,h/2,.15).setTranslation(0,0,side*(.15-.025)).setFriction(.2).setRestitution(.2),b);
  }
  let machine=null;
  if(c.machine){
   const record=structuredClone(c.machine),t0=c.frame/60;
   if(c.kind==='hammer'){
    if(repaired){
     const out={swings:[]};hammer.build({u:c.u},{frameAt,out,sync:{},physicsProfile:'contact-flow-v3'});
     record.restitution=out.swings[0].restitution;
    }
    // Creating at the recorded orientation avoids a false first-step impulse.
    record.phase+=record.spin*t0;
   }else record.phase+=2*Math.PI*t0/record.period;
   machine=modules[c.kind].physics(world,[record],{RAPIER,groups:{track:0xffffffff}});
  }
  const s=frameAt(c.u),start=c.position.map((x,j)=>x+offset*s.r[j]);
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...start).setRotation(new Quaternion(...c.quaternion)).setLinvel(...c.velocity.map(v=>v*speed)).setLinearDamping(.046).setCanSleep(false));
  add(RAPIER.ColliderDesc.ball(.35).setFriction(.15).setRestitution(.48).setDensity(2),body);
  let enter=null,exit=null,escaped=false;
  for(let step=0;step<960;step++){
   machine?.kinematics((step+1)/120);world.step();const p=body.translation();
   const road=c.samples.reduce((a,s)=>Math.hypot(s.p[0]-p.x,s.p[2]-p.z)<Math.hypot(a.p[0]-p.x,a.p[2]-p.z)?s:a);
   const delta=[p.x-road.p[0],p.y-road.p[1],p.z-road.p[2]],lat=delta.reduce((n,x,j)=>n+x*road.r[j],0),up=delta.reduce((n,x,j)=>n+x*road.n[j],0);
   if(Math.abs(lat)>road.w+.4||up< -1)escaped=true;
   if(enter===null&&road.u>=c.u-1)enter=step;
   if(enter!==null&&exit===null&&road.u>=c.u+5)exit=step;
   if(road.u>=c.u+30||escaped)return {seconds:exit===null?Infinity:(exit-enter)/120,escaped};
  }
  return {seconds:Infinity,escaped};
 }finally{world.free();}
}

test('saved machine approaches remain contained and the hammer releases promptly',async()=>{
 await RAPIER.init();
 const controls=fixture.cases.map(c=>traverse(c,false));console.log('recorded machine controls',controls);
 assert.ok(controls[0].seconds>3.5,'recorded hammer delay must reproduce');
 assert.ok(controls.slice(1).every(r=>r.escaped),'recorded machine escapes must reproduce');
 for(const c of fixture.cases)for(const speed of [.9,1,1.1])for(const offset of[-.04,0,.04]){
  const r=traverse(c,true,speed,offset);
  assert.equal(r.escaped,false,`${c.kind} ${c.country} speed${speed} offset${offset} escaped`);
  assert.ok(r.seconds<(c.kind==='hammer'?3.5:3),`${c.kind} ${c.country} speed${speed} offset${offset}: ${r.seconds}s`);
 }
});
