import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import RAPIER from '@dimforge/rapier3d-compat';import{Quaternion,Vector3}from'three';
import{buildTrackMesh,pointOnTrack}from'../src/gp/trackMesh.js';
import vortex,{vortexEntryGuide}from'../src/gp/obstacles/vortex.js';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/tuscany-vortex-entry.json',import.meta.url))),samples=f.samples;
const frameAt=u=>{let i=0;while(i<samples.length-2&&samples[i+1].u<u)i++;const a=samples[i],b=samples[i+1],t=(u-a.u)/(b.u-a.u);return{...a,p:a.p.map((x,j)=>x+(b.p[j]-x)*t)};};
const corrected=vortexEntryGuide(f.vortex,frameAt),track=(1<<16)|2,ball=(2<<16)|7;
const cases=f.cases.map(c=>{const qa=new Quaternion(...c.previousQuat),qb=new Quaternion(...c.nextQuat);const dq=qb.multiply(qa.invert()).normalize();if(dq.w<0)dq.set(-dq.x,-dq.y,-dq.z,-dq.w);const angle=2*Math.acos(Math.min(1,dq.w)),s=Math.sqrt(1-dq.w*dq.w);return{...c,angular:s<1e-5?[0,0,0]:[dq.x,dq.y,dq.z].map(x=>x/s*angle*30)};});
for(const lateral of [-1.7,-1,0,1,1.7])for(const speed of [3,7,11,15]){const s=frameAt(33);cases.push({id:`grid-${lateral}-${speed}`,pose:[...pointOnTrack(s,lateral,.355),0,0,0,1],velocity:s.t.map(x=>x*speed),angular:[0,0,-speed/.35]});}
test('fitted vortex guide clears 58 fixed and recorded Tuscany ingress cases without a rim trap or fall',async()=>{
 await RAPIER.init();const result={variants:{}};
for(const variant of ['baseline','fitted']){
 const out=[];
 for(const c of (variant==='baseline'?cases.filter(c=>c.id==='grid--1.7-15'):cases)){const world=new RAPIER.World({x:0,y:-25,z:0});world.timestep=1/120;
 try{const floor=world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),g=buildTrackMesh(samples,{endCaps:false,wallHeight:1.35}).physics;
 world.createCollider(RAPIER.ColliderDesc.trimesh(g.vertices,g.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.35).setRestitution(.12).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min).setCollisionGroups(track),floor);
 const machine=vortex.physics(world,[f.vortex],{RAPIER,groups:{track,clear:track},trackBody:floor});
 for(const orig of f.statics){const o=orig.kind==='fin'&&orig.pos[0]<-10&&variant==='fitted'?corrected:orig;
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...o.pos).setRotation({x:o.quat[0],y:o.quat[1],z:o.quat[2],w:o.quat[3]}));
 const shape=o.shape==='box'?(o.depth?RAPIER.ColliderDesc.cuboid(o.size[0]/2,o.size[1]/2,o.depth/2).setTranslation(0,0,o.side*(o.depth/2-o.size[2]/2)):RAPIER.ColliderDesc.cuboid(...o.size.map(x=>x/2))):RAPIER.ColliderDesc.cylinder(o.height/2,o.radius);
 world.createCollider(shape.setFriction(o.friction??.2).setRestitution(o.kind==='fin'?.32:o.kind==='guard'?.2:.45).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min).setCollisionGroups(track),body);}
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...c.pose.slice(0,3)).setLinvel(...c.velocity).setRotation({x:c.pose[3],y:c.pose[4],z:c.pose[5],w:c.pose[6]}).setAngvel({x:c.angular[0],y:c.angular[1],z:c.angular[2]}).setLinearDamping(.046).setCanSleep(false));world.createCollider(RAPIER.ColliderDesc.ball(.35).setFriction(.15).setRestitution(.48).setDensity(2).setCollisionGroups(ball),body);
 let entered=false,seconds=20,exited=false,fallen=false;
 for(let k=0;k<2400;k++){const p=body.translation();body.setLinearDamping(machine.inside(p)?.008:.046);world.step();const x=body.translation(),radius=Math.hypot(x.x-f.vortex.center[0],x.z-f.vortex.center[2]);if(radius<f.vortex.radius-.36&&x.y<f.vortex.center[1]+.2)entered=true;if(x.y<-16||Math.abs(x.z-f.vortex.center[2])>7){fallen=true;break;}if(x.x>f.vortex.center[0]+5){seconds=k/120;exited=true;break;}}
 const p=body.translation(),vel=body.linvel();out.push({id:c.id,entered,exited,fallen,seconds,position:[p.x,p.y,p.z],speed:Math.hypot(vel.x,vel.y,vel.z)});
 }finally{world.free();}}
 result.variants[variant]=out;
}
 const baseline=result.variants.baseline[0];assert.equal(baseline.entered,false);assert.ok(baseline.speed<.01,'Recorded regression must reproduce original stationary trap');
 for(const c of result.variants.fitted){assert.equal(c.entered,true,c.id+' missed the bowl');assert.equal(c.fallen,false,c.id+' fell');assert.ok(c.exited||c.speed>1,c.id+' remains stationary');}
 for(const id of ['USA-lap2','NLD-lap2','grid--1.7-15'])assert.equal(result.variants.fitted.find(c=>c.id===id).exited,true,id+' failed to exit');
});

test('guide fits actual ramp while preserving the legacy bowl and default guide',()=>{
 const legacy={vortices:[]},updated={vortices:[]},oldStatics=[],newStatics=[];
 vortex.build({u:f.vortex.u},{frameAt,statics:oldStatics,out:legacy});
 vortex.build({u:f.vortex.u},{frameAt,statics:newStatics,out:updated,physicsProfile:'contact-flow-v2'});
 assert.deepEqual(updated,legacy);assert.equal(oldStatics[0].profile,undefined);assert.equal(newStatics[0].profile,'ramp-fitted-v1');
 const o=newStatics[0],q=new Quaternion(...o.quat).normalize();
 for(const t of [.05,.25,.5,.75,.85]){
  const bottom=new Vector3(o.size[0]*(t-.5),-o.size[1]/2,0).applyQuaternion(q).add(new Vector3(...o.pos));
  const u=bottom.x-samples[0].p[0]+samples[0].u,road=frameAt(u).p[1];
  assert.ok(Math.abs(bottom.y-road)<.04,'Guide floats above or is buried in ramp');
 }
});
