import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {islandFootprint,islandMeshData,islandContact} from '../src/gp/car-island.js';
import {refineCarCircuit} from '../src/gp/car-circuit-refinement.js';
import {carSpeedKph} from '../src/gp/car-speed.js';
import alps from '../src/gp/circuits/r1-monaco.js';
import {alpsTurbo} from '../src/gp/circuits/alps-turbo.js';
import {solveCarIslandCollisions} from './car-engine.mjs';

test('actual Swiss road gains twelve safe acceleration lanes and low rounded islands without a road rewrite',()=>{
 const data=JSON.parse(readFileSync(new URL('../out/tcr/alps-review/alps-heat1-turbo-v24-seed46/race.json',import.meta.url)));
 const round=alpsTurbo(alps),before=JSON.stringify(round),course={samples:data.samples,uFinish:data.info.finish};
 const refined=refineCarCircuit(round,course),{gates,lanes}=refined.carChallenges;
 assert.equal(JSON.stringify(round),before);assert.equal(refined.outline,round.outline);
 assert.equal(gates.length,7);assert.equal(lanes.length,12);
 for(const g of gates){assert.equal(g.profile,'soft-island');assert.equal(g.height,.28);assert.ok(g.width<=.64&&g.length>=3.4);}
 for(const l of lanes){
  assert.ok(!gates.some(g=>l.u<g.u+g.length/2+4&&l.u+l.length>g.u-g.length/2-4));
  assert.ok(course.samples.filter(s=>s.u>=l.u-3&&s.u<=l.u+l.length+4).every(s=>Math.abs(s.curv)<.026));
  assert.ok(l.u+l.length<course.uFinish-45);
 }
 assert.deepEqual(refined,refineCarCircuit(round,course));
});

test('round nose removes square-corner contacts; glancing collision preserves tangential momentum',()=>{
 const gate={profile:'soft-island',u:0,lat:0,length:3.4,width:.64,height:.28},car={length:.1,width:.1};
 assert.equal(islandContact(gate,1.75,.35,car),null,'empty corner of the old bounding box is no longer solid');
 const contact=islandContact(gate,1.7,.15,car);assert.ok(contact&&Math.abs(contact.along)>.1&&Math.abs(contact.across)>.1);
 assert.equal(islandContact(gate,1.7+contact.along*(contact.depth+.001),.15+contact.across*(contact.depth+.001),car),null);
 const body={p:{x:1.9,y:.3,z:.6},v:{x:-8,y:0,z:-2},translation(){return this.p;},linvel(){return this.v;},setTranslation(p){this.p=p;},setLinvel(v){this.v=v;}};
 const hit=islandContact(gate,body.p.x,body.p.z,{length:.77,width:.44});assert.ok(hit);
 const tangent=[-hit.across,hit.along],before=body.v.x*tangent[0]+body.v.z*tangent[1];
 solveCarIslandCollisions({bodies:[body],course:{frameAt:()=>({p:[0,0,0],t:[1,0,0],r:[0,0,1],n:[0,1,0]})},gates:[gate],carYaw:[0],finishFrame:[null],dqFrame:[null]});
 assert.ok(Math.abs(body.v.x*tangent[0]+body.v.z*tangent[1]-before)<1e-9);
 assert.equal(islandContact(gate,body.p.x,body.p.z,{length:.77,width:.44}),null);
});

test('Rapier collider consumes the same bevelled vertices as the rendered island',async()=>{
 await RAPIER.init();const world=new RAPIER.World({x:0,y:0,z:0});
 try{
  const mesh=islandMeshData([3.4,.28,.64]);assert.ok(mesh.vertices.every(Number.isFinite));assert.equal(islandFootprint(3.4,.64).length,26);
  const desc=RAPIER.ColliderDesc.convexHull(new Float32Array(mesh.vertices));assert.ok(desc);
  const collider=world.createCollider(desc);world.step();
  assert.ok(collider.castRay(new RAPIER.Ray({x:0,y:1,z:0},{x:0,y:-1,z:0}),2,true)>0);
  assert.ok(collider.castRay(new RAPIER.Ray({x:1.65,y:1,z:.29},{x:0,y:-1,z:0}),2,true)<0);
 }finally{world.free();}
});

test('speedometers show measured km/h, not the replay rate or a cosmetic speed multiplier',()=>{
 const data={fps:60,timeline:{raceStart:2},marbles:[{finishFrame:10,dqFrame:null}],frames:Array.from({length:14},(_,f)=>[[Math.max(0,f-2)/6,0,0]])};
 assert.equal(carSpeedKph(data,0,0),0);
 for(const f of [3,5.5,9])assert.ok(Math.abs(carSpeedKph(data,0,f)-36)<1e-9);
 assert.equal(carSpeedKph(data,0,10),null);
 data.marbles[0]={finishFrame:null,dqFrame:8};data.frames[8][0][0]=1000;
 assert.ok(Math.abs(carSpeedKph(data,0,7)-36)<1e-9,'DQ teleport cannot inflate the last valid speed');
 assert.equal(carSpeedKph(data,0,8),null);
});
