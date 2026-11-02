import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import {Matrix4,Vector3}from'three';
import {variedRaceAction,BOOST_TIERS,boostAppearance}from'../src/gp/race-action-profile.js';
import {RACE_PACE,boostProfile,poweredAcceleration,waterResponse}from'../src/gp/car-pace.js';
import {bakeCarConditions,surfaceGrip}from'../src/gp/car-challenges.js';
import {planCarDriving}from'../src/gp/car-driver.js';
import {boostLaneGeometry}from'../src/gp/boost-lanes.js';
import {britishScenery,BRITAIN_MATERIALS}from'../src/gp/britain-scenery.js';
import {buildSceneryMeshes}from'../src/gp/scenery-mesh.js';
import {createCameraOcclusion}from'../src/gp/camera-occlusion.js';
const data=JSON.parse(fs.readFileSync('out/tcr/track-review/britain-heat1-world-v22-cotswold-seed66/race.json'));
const course={samples:data.samples,uFinish:data.info.finish},base={carChallenges:{patches:data.carConditions.patches,lanes:data.boosters.map(b=>({u:b.u0,length:b.length,width:b.width,latCenter:b.latCenter,target:b.target,accel:b.accel})),racecraft:RACE_PACE}};
const updated=variedRaceAction(base,course),conditions=bakeCarConditions(updated.carChallenges,68);
test('the actual UK road gets different real lane lengths, widths, targets, charges and powers without changing its geometry',()=>{
 const c=updated.carChallenges;assert.ok(c.lanes.length>=16);for(const key of ['length','width','target','accel','boostSeconds'])assert.ok(new Set(c.lanes.map(l=>l[key])).size>=3,key);
 assert.equal(c.racecraft.boostModel,'lane-charge-v2');assert.ok(c.lanes.some(l=>l.risk==='water-exit'));
 for(const l of c.lanes){assert.ok(Math.abs(l.latCenter)+l.width/2<3.2);assert.ok(l.u>55&&l.u+l.length<course.uFinish-100);assert.equal(boostProfile(c.racecraft,l).target,l.target);assert.equal(poweredAcceleration(c.racecraft,true,true,l),l.accel);}
 for(const p of c.patches)assert.ok(Math.abs(p.lat)+p.halfWidth<3.2,'a dry bypass must remain');
 assert.equal(base.carChallenges.racecraft,RACE_PACE);assert.deepEqual(base.carChallenges.lanes.map(l=>l.length),Array(24).fill(14));
});
test('throttle cannot cancel water drag: identical full-throttle runs lose speed in water while a dry bypass stays quick',()=>{
 const p={kind:'pond',u0:100,u1:138,lat:.7,halfWidth:1.85,drag:.022,grip:.5};
 const c=bakeCarConditions({patches:[p],gates:[],racecraft:{...RACE_PACE,waterModel:'tyre-water-v2'}},68);
 function run(lat){let u=94,v=40,min=v;for(let k=0;k<240;k++){const w=waterResponse(c,u,lat,v),mu=surfaceGrip(c,u,lat),throttle=Math.min(14*mu,Math.max(0,(44-v)*4));v=Math.max(0,v+(throttle*w.throttleMultiplier-w.drag)/120);u+=v/120;min=Math.min(min,v);}return {u,v,min};}
 const wet=run(.7),dry=run(-2.35);assert.ok(wet.min<dry.min-8,JSON.stringify({wet,dry}));assert.equal(dry.min,40);
 assert.equal(waterResponse(c,120,-2.35,40).coverage,0);
 assert.equal(waterResponse(c,90,.7,40).drag,0);
 assert.equal(surfaceGrip(c,119,.7),.5,'authored pond grip is not silently overwritten');
});
test('the planner uses a lane actual charge and target rather than granting every pad the same boost',()=>{
 const tuning=conditions.racecraft,a={u:100,totalU:100,lat:0,speed:40,time:1,intelligence:.7,stability:.7,conditions:{...conditions,patches:[]},course:{uFinish:2000,frameAt:()=>({w:3.2,curv:0})},telemetry:{racingLatAt:()=>0},boostRemaining:1};
 const low=planCarDriving({...a,boostLane:BOOST_TIERS[0]}),high=planCarDriving({...a,boostLane:BOOST_TIERS[2]});
 assert.equal(low.speedLimit,52);assert.equal(high.speedLimit,66);
 assert.deepEqual(planCarDriving({...a,rank:1,desiredWinner:0}),planCarDriving({...a,rank:12,desiredWinner:11}));
 assert.notEqual(boostAppearance(BOOST_TIERS[0]).color,boostAppearance(BOOST_TIERS[2]).color);
});
test('a driver takes clear nitro on dry asphalt but rejects the same lane when its wet exit costs more time',()=>{
 const c=bakeCarConditions({patches:[{kind:'pond',u0:100,u1:138,lat:.7,halfWidth:1.85,drag:.022,grip:.5}],gates:[],racecraft:updated.carChallenges.racecraft},68);
 const a={u:50,lat:0,speed:40,time:1,intelligence:.7,stability:.7,conditions:c,course:{uFinish:2000,frameAt:()=>({w:3.2,curv:0})},telemetry:{racingLatAt:()=>0},boosters:[{u0:82,u1:92,width:1.15,latCenter:1.3,target:66,accel:140,boostSeconds:1.6}]};
 const wet=planCarDriving(a),dry=planCarDriving({...a,conditions:{...c,patches:[]}});
 assert.equal(wet.mode,'dry-line');assert.ok(wet.targetLat<0);assert.equal(dry.mode,'boost-right-82');assert.equal(dry.targetLat,1.3);
});
test('an identical car starting behind can pass by taking nitro, and water measurably reduces that route advantage',()=>{
 // Isolated longitudinal control check, not a new saved race or chosen winner.
 const tuning=updated.carChallenges.racecraft,lane={u0:1,u1:11,latCenter:1.3,...BOOST_TIERS[2]};
 function run(wet){const c={racecraft:tuning,patches:wet?[{kind:'pond',u0:19,u1:57,lat:1.3,halfWidth:1.95,drag:.025}]:[]};let u=-5,v=44,charge=0,used=false,passed=false;
  for(let k=0;k<480;k++){const on=u>=lane.u0&&u<=lane.u1;if(on&&!used){charge=lane.boostSeconds;used=true;}
   const target=charge>0?boostProfile(tuning,lane).target:44,w=waterResponse(c,u,1.3,v);
   let a=v<target?Math.min(poweredAcceleration(tuning,on,charge>0,lane),(target-v)*4.5):-Math.min(22,(v-target)*6.8);
   if(a>0)a*=w.throttleMultiplier;v=Math.max(0,v+(a-w.drag)/120);u+=v/120;charge=Math.max(0,charge-1/120);if(u>44*(k+1)/120)passed=true;
  }return {passed,gap:u-176};
 }
 const dry=run(false),wet=run(true);assert.ok(dry.passed&&dry.gap>0);assert.ok(wet.gap<dry.gap-10,JSON.stringify({wet,dry}));
});
test('long boost meshes follow the saved road and have the actual lane width, with finite top-facing geometry',()=>{
 const lane={...updated.carChallenges.lanes.find(l=>l.length>=18)},b={...lane,u0:lane.u,u1:lane.u+lane.length};
 const g=boostLaneGeometry(data.samples,b),p=g.getAttribute('position');assert.ok(p.count>50);assert.ok([...p.array].every(Number.isFinite));
 for(let k=0;k<p.count;k+=2)assert.ok(Math.abs(new Vector3().fromBufferAttribute(p,k).distanceTo(new Vector3().fromBufferAttribute(p,k+1))-lane.width)<.03);
 assert.ok([...g.getAttribute('normal').array].every(Number.isFinite));g.dispose();
});
test('rich Cotswold dressing preserves the legacy recipe and shares every new opaque object with camera geometry',()=>{
 const legacy=britishScenery(data.samples),rich=britishScenery(data.samples,{profile:'cotswold-rich-v2'}),model=createCameraOcclusion({samples:data.samples,themeId:'britain',sceneryProfile:'cotswold-rich-v2'});
 assert.ok(rich.groups.length>legacy.groups.length*3,JSON.stringify({old:legacy.groups.length,new:rich.groups.length}));
 for(const key of ['britain-rolling-hill','britain-sheep-body','britain-barn','britain-stone-boundary','britain-pub-sign','britain-roadside-stone','britain-roadside-hedge']){
  const parts=rich.parts.filter(p=>p.category===key);assert.ok(parts.length,key);assert.equal(model.counts[key],parts.length,key);
  const part=parts[0],m=new Matrix4().fromArray(part.matrix),ray=[-1,1].map(s=>new Vector3(0,part.kind==='hill'?part.size[1]*.4:0,s*150).applyMatrix4(m).toArray());assert.ok(model.blocks(...ray),key);
 }
 const meshes=buildSceneryMeshes(rich.parts,BRITAIN_MATERIALS);assert.ok(meshes.every(m=>m.material));meshes.forEach(m=>m.geometry.dispose());
 assert.equal(britishScenery(data.samples),legacy,'legacy saved inputs keep their original recipe');
 fs.writeFileSync('out/action-quality-20261101/scenery-density.json',JSON.stringify({legacyGroups:legacy.groups.length,richGroups:rich.groups.length,legacyParts:legacy.parts.length,richParts:rich.parts.length,sharedCameraCounts:model.counts},null,2)+'\n');
});
