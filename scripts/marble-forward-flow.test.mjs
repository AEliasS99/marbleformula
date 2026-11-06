import test from 'node:test';import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';import RAPIER from '@dimforge/rapier3d-compat';
import hammer,{swingQuat} from '../src/gp/obstacles/hammer.js';import turntable,{turntableQuat} from '../src/gp/obstacles/turntable.js';import bumpers from '../src/gp/obstacles/bumpers.js';
const frameAt=u=>({u,p:[u,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1});
process.env.GP_CARS='0';
function machines(module,profile){const out={swings:[],turntables:[]};for(const u of [20,40,60])module.build({u},{out,frameAt,sync:{},physicsProfile:profile});return out;}
test('every forward-flow hammer sweeps downstream at bottom contact; legacy alternating brake remains available',()=>{
 const next=machines(hammer,'contact-flow-v3').swings,old=machines(hammer).swings;
 assert.ok(old.some(h=>h.spin<0));assert.deepEqual(next.map(h=>Math.sign(h.lat)),[1,-1,1]);
 for(const h of next){
  const sw={...h,phase:0};const a=new Vector3(0,-h.length,0).applyQuaternion(new Quaternion().fromArray(swingQuat(sw,-.001))),b=new Vector3(0,-h.length,0).applyQuaternion(new Quaternion().fromArray(swingQuat(sw,.001)));
  assert.ok(b.x>a.x,'head strikes backwards at the actual bottom of its circle');
 }
});
test('turntables push downstream on the main centreline and retain a full marble-width bypass',()=>{
 for(const tt of machines(turntable,'contact-flow-v3').turntables){
  const lat=tt.pos[2],r=.45,record={...tt,phase:0};const a=new Vector3(0,0,r).applyQuaternion(new Quaternion().fromArray(turntableQuat(record,-.001))),b=new Vector3(0,0,r).applyQuaternion(new Quaternion().fromArray(turntableQuat(record,.001)));
  assert.ok(b.x>a.x);assert.ok(2.1-Math.abs(lat)-Math.hypot(tt.ribTo,tt.ribWidth/2)>.78);assert.ok(2.1-(lat+tt.radius)>.78);assert.ok(tt.ribHeight<.35/2);
 }
});
test('twenty real rigid-body marbles traverse the revised pinball without rescue or velocity forcing',async()=>{
 await RAPIER.init();const world=new RAPIER.World({x:0,y:-25,z:0});world.timestep=1/120;
 try{
  const q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-.13),rot={x:q.x,y:q.y,z:q.z,w:q.w};
  const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setRotation(rot));
  world.createCollider(RAPIER.ColliderDesc.cuboid(20,.1,2.1).setTranslation(0,-.1,0).setFriction(.35).setRestitution(.12).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),floor);
  for(const side of [-1,1])world.createCollider(RAPIER.ColliderDesc.cuboid(20,1,.08).setTranslation(0,.9,side*2.18),floor);
  const parts=[];bumpers.build({u:0},{physicsProfile:'contact-flow-v3',cylinder:(kind,u,lat,r,h,restitution,extra)=>parts.push({u,lat,r,h,restitution,...extra})});
  assert.equal(parts.length,3,'the actual pinball posts must be present in the physical test');
  for(const p of parts)assert.ok(p.h-.12<.35,'sunk pinball cap must stay below a rolling marble centre so it cannot form a full-height stopping wall');
  for(const p of parts){assert.ok(2.1-Math.abs(p.lat)-p.r>2.3*.7,'two marbles can arch across the narrower bypass');world.createCollider(RAPIER.ColliderDesc.cylinder(p.h/2,p.r).setTranslation(p.u,p.h/2-.12,p.lat).setFriction(p.friction).setRestitution(p.restitution).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),floor);}
  const velocity=new Vector3(5,0,0).applyQuaternion(q),inverse=q.clone().invert();
  const actors=Array.from({length:20},(_,i)=>{const p=new Vector3(-1-Math.floor(i/5)*.80,.355,(i%5-2)*.72).applyQuaternion(q),body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setLinvel(velocity.x,velocity.y,velocity.z).setLinearDamping(.046).setCanSleep(false).setCcdEnabled(true));world.createCollider(RAPIER.ColliderDesc.ball(.35).setRestitution(.48).setFriction(.15).setDensity(2),body);return body;});
  const crossed=new Set();for(let step=0;step<120*10;step++){world.step();actors.forEach((b,i)=>{const p=b.translation();if(new Vector3(p.x,p.y,p.z).applyQuaternion(inverse).x>6)crossed.add(i);});}
  assert.equal(crossed.size,20,'pinball trapped members of a full twenty-marble pack: '+JSON.stringify(actors.flatMap((b,i)=>crossed.has(i)?[]:[{i,position:b.translation(),velocity:b.linvel()}])));
 }finally{world.free();}
});
