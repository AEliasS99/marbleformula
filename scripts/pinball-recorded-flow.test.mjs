import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import {buildTrackMesh} from '../src/gp/trackMesh.js';
import bumpers from '../src/gp/obstacles/bumpers.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/italy-pinball-recoil.json',import.meta.url)));

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
   if(o.kind==='bumper')center.add(new Vector3(0,(height-o.height)/2,0).applyQuaternion(q));
   const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x,center.y,center.z).setRotation(q));
   let shape;
   if(o.shape==='cylinder')shape=RAPIER.ColliderDesc.cylinder((o.kind==='bumper'?height:o.height)/2,o.radius);
   else if(o.shape==='box'){
    shape=RAPIER.ColliderDesc.cuboid(o.size[0]/2,o.size[1]/2,(o.depth??o.size[2])/2);
    if(o.depth)shape.setTranslation(0,0,o.side*(o.depth/2-o.size[2]/2));
   }else throw Error('Unsupported recorded static shape');
   add(shape.setFriction(o.friction??.2).setRestitution(o.kind==='bumper'?restitution:o.kind==='guard'?.2:.22),body);
  }
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...start).setRotation(new Quaternion(...c.quaternion)).setLinvel(...c.velocity.map(v=>v*speedScale)).setAngvel({x:c.angularVelocity[0],y:c.angularVelocity[1],z:c.angularVelocity[2]}).setLinearDamping(.046).setCanSleep(false));
  add(RAPIER.ColliderDesc.ball(.35).setFriction(.15).setRestitution(.48).setDensity(2),body);
  let enter=null,exit=null,escaped=false;
  for(let step=0;step<720;step++){
   world.step();const p=body.translation();
   const nearest=c.samples.reduce((r,s)=>{const distance=Math.hypot(s.p[0]-p.x,s.p[1]-p.y,s.p[2]-p.z);return distance<r.distance?{distance,u:s.u}:r;},{distance:Infinity});
   if(enter===null&&nearest.u>=c.u-1)enter=step;
   if(enter!==null&&exit===null&&nearest.u>=c.u+6)exit=step;
   const road=c.samples.reduce((a,s)=>Math.hypot(s.p[0]-p.x,s.p[2]-p.z)<Math.hypot(a.p[0]-p.x,a.p[2]-p.z)?s:a);
   const delta=[p.x-road.p[0],p.y-road.p[1],p.z-road.p[2]];
   if(Math.abs(delta.reduce((n,v,j)=>n+v*road.r[j],0))>road.w+.35||delta.reduce((n,v,j)=>n+v*road.n[j],0)<-1)escaped=true;
   // Follow landing beyond the transit window: a fast exit alone missed falls.
   if(nearest.u>=c.u+12)return {seconds:exit===null?Infinity:(exit-enter)/120,escaped};
  }
  return {seconds:Infinity,escaped};
 }finally{world.free();}
}

test('actual Tuscany pinball recoil is prevented for recorded arrivals and nearby velocities/lines',async()=>{
 await RAPIER.init();process.env.GP_CARS='0';
 const parts=[];bumpers.build({u:61},{physicsProfile:'contact-flow-v3',cylinder:(kind,u,lat,r,h,restitution,extra)=>parts.push({kind,u,lat,r,h,restitution,...extra})});
 assert.equal(parts.length,3);assert.ok(parts.every(p=>p.h-.12<.35/2),'the shoulder must remain below half the marble radius');
 assert.ok(parts.every(p=>p.restitution===.2),'retain a restrained physical rebound');
 const height=parts[0].h;
 assert.ok(fixture.cases.slice(2).some(c=>traverse(c,.28,1,0,.4).escaped),'control failed to reproduce recorded escape');
 assert.ok(traverse(fixture.cases[0],.4,1,0).seconds>3,'control no longer reproduces the recorded recoil delay');
 for(const c of fixture.cases)for(const speed of[.85,1,1.15])for(const offset of[-.07,0,.07]){
  const result=traverse(c,height,speed,offset,parts[0].restitution);
  assert.ok(result.seconds<3,`${c.country}: ${result.seconds}s at speed${speed}/offset${offset}`);
  assert.equal(result.escaped,false,`${c.country}: escaped after pinball at speed${speed}/offset${offset}`);
 }
});
