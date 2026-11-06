import fs from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import {buildTrackMesh} from '../src/gp/trackMesh.js';
import rollers from '../src/gp/obstacles/rollers.js';
import {laneAt} from '../src/gp/obstacles/challenge-lanes.js';

import test from 'node:test';
import assert from 'node:assert/strict';
import {buildChallengeRibs} from '../src/gp/obstacles/challenge-ribs.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/india70-roof-entry.json',import.meta.url)));
const {zone,samples,marbleRadius:radius}=fixture;
function trackFrame(u){
 const i=samples.findIndex(s=>s.u>=u);
 if(i<1)return samples[i<0?samples.length-1:0];
 const a=samples[i-1],b=samples[i],k=(u-a.u)/(b.u-a.u);
 return {...a,u,...Object.fromEntries(['p','r','n','t'].map(key=>[key,a[key].map((v,j)=>v+(b[key][j]-v)*k)]))};
}
function project(p){
 const closest=samples.reduce((a,b)=>p.distanceToSquared(new Vector3(...a.p))<p.distanceToSquared(new Vector3(...b.p))?a:b);
 const u=closest.u+p.clone().sub(new Vector3(...closest.p)).dot(new Vector3(...closest.t));
 const s=trackFrame(u),delta=p.clone().sub(new Vector3(...s.p));
 return {u,lat:delta.dot(new Vector3(...s.r)),height:delta.dot(new Vector3(...s.n))};
}
async function replay(entryU,originalRoof=false){
 await RAPIER.init();
 const arrivals=fixture.arrivals[entryU],first=arrivals[0].frame,lastArrival=arrivals.at(-1).frame;
 const area=fixture.obstacles.filter(o=>originalRoof||o.kind!=='challenge-rib');
 if(!originalRoof)buildChallengeRibs({type:'single-lane',u:zone.u0},{frameAt:trackFrame,statics:area},zone);
 const mesh=buildTrackMesh(samples,{endCaps:false,wallHeight:1.35}).physics;
 const world=new RAPIER.World({x:0,y:-25,z:0});world.timestep=1/120;
 try{
  const add=(s,b)=>world.createCollider(s.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),b);
  add(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.35).setRestitution(.12));
  for(const o of area){
   const pos=new Vector3(...o.pos),q=new Quaternion(...o.quat);
   const size=o.size&&[...o.size];
   const body=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...pos.toArray()).setRotation(q));
   const shape=o.shape==='cylinder'?RAPIER.ColliderDesc.cylinder(o.height/2,o.radius):
    RAPIER.ColliderDesc.cuboid(size[0]/2,size[1]/2,(o.depth??size[2])/2);
   if(o.depth)shape.setTranslation(0,0,o.side*(o.depth/2-size[2]/2));
   add(shape.setFriction(o.friction??.2).setRestitution(o.restitution??.3),body);
  }
  const machine=rollers.physics(world,fixture.drums,{RAPIER,groups:{track:0xffffffff}});
  const active=[],records=[];
  const spawn=({index,country,frame,pose,velocity,omega})=>{
   const q=new Quaternion(...pose.slice(3,7));
   const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...pose.slice(0,3)).setRotation(q)
    .setLinvel(...velocity).setAngvel({x:omega[0],y:omega[1],z:omega[2]}).setLinearDamping(.046).setCanSleep(false));
   add(RAPIER.ColliderDesc.ball(radius).setFriction(.15).setRestitution(.48).setDensity(2),body);
   const rec={index,country,frame,exit:null,maxHeight:0,bypass:0};records.push(rec);active.push({body,rec});
  };
  let cursor=0;
  for(let tick=first*2;tick<=lastArrival*2+120*10;tick++){
   while(cursor<arrivals.length&&arrivals[cursor].frame*2<=tick)spawn(arrivals[cursor++]);
   machine.kinematics((tick+1)/120);world.step();
   for(let i=active.length-1;i>=0;i--){
    const {body,rec}=active[i],p=body.translation(),last=project(new Vector3(p.x,p.y,p.z)),u=last.u-zone.u0;
    rec.last=last;rec.maxHeight=Math.max(rec.maxHeight,last.height);
    if(u>=zone.throatStart&&u<=zone.throatEnd&&(last.height>zone.railHeight+radius||Math.min(...zone.routes.map(r=>Math.abs(last.lat-laneAt(r.points,u))))+radius>zone.clearWidth/2+.055))rec.bypass++;
    if(last.u>=zone.u1||last.height<-.5||Math.abs(last.lat)>2.5){
     if(last.u>=zone.u1)rec.exit=(tick-rec.frame*2)/120;
     world.removeRigidBody(body);active.splice(i,1);
    }
   }
  }
  for(const rec of records)rec.passed=rec.exit!==null&&rec.bypass===0;
  return {arrivals:records.length,passed:records.every(r=>r.passed),records};
 }finally{world.free();}
}
test('saved India70 low roof reproduces the launch, supported descending entry contains both recorded packs',async()=>{
 const control=await replay(555,true);
 assert.equal(control.records.find(r=>r.country==='MEX').passed,false,'Original recorded roof must reproduce launch, not silently pass');
 assert.ok(control.records.find(r=>r.country==='MEX').maxHeight>3);
 for(const entry of [550,555]){
  const result=await replay(entry);assert.equal(result.arrivals,20);
  assert.ok(result.passed,JSON.stringify(result.records.filter(r=>!r.passed)));
 }
});

test('descending roof has continuous outboard supports and closes before the lane throat',()=>{
 const statics=[],frameAt=u=>({u,p:[u,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1});
 buildChallengeRibs({type:'single-lane',u:0},{frameAt,statics},{length:19});
 const bars=statics.filter(o=>o.role==='crossbar');
 assert.equal(bars[0].pos[1],2.1);assert.equal(bars.find(o=>o.pos[0]===0).pos[1],1.1);
 for(let i=1;i<bars.length;i++)assert.ok(Math.hypot(bars[i].pos[0]-bars[i-1].pos[0]-.08,bars[i].pos[1]-bars[i-1].pos[1])<.7,'No marble-sized opening between the lowered bars');
 const beam=statics.find(o=>o.role==='stringer'&&o.pos[0]<-2.5),q=new Quaternion(...beam.quat).normalize();
 const direction=new Vector3(1,0,0).applyQuaternion(q);
 assert.ok(direction.y<-.3,'Support must follow the roof slope rather than float as horizontal disconnected pieces');
 for(const sign of [-1,1]){
  const end=new Vector3(...beam.pos).addScaledVector(direction,sign*(beam.size[0]-.01)/2);
  assert.ok(bars.some(bar=>Math.hypot(end.x-bar.pos[0],end.y-bar.pos[1])<.005),'Stringer endpoint must reach the adjoining crossbar');
 }
 for(const post of statics.filter(o=>o.role==='post'))assert.ok(Math.abs(post.pos[1]-post.size[1]/2+.14)<.001,'Posts remain tied to the road deck');
});
