import {test} from 'node:test';
import assert from 'node:assert/strict';
import alps from '../src/gp/circuits/r1-monaco.js';
import {alpsTurbo} from '../src/gp/circuits/alps-turbo.js';
import {bakeCarConditions,carObstacleLine,attackLaneActive} from '../src/gp/car-challenges.js';
import {sanitizeCarFeatures,buildCarTelemetryProfile,solveCarIslandCollisions,carHalfExtents} from './car-engine.mjs';
import booster from '../src/gp/obstacles/booster.js';
import chicane from '../src/gp/obstacles/car-chicane.js';
import {OBSTACLES,BY_TYPE} from '../src/gp/obstacles/index.js';
import {auditCarIslands} from './car-island-audit.mjs';

test('turbo evolves the original Swiss course without changing its standard preset or marble planner',()=>{
  const before=JSON.stringify(alps),turbo=alpsTurbo(alps);
  assert.equal(turbo.outline,alps.outline);assert.equal(turbo.scale,alps.scale);
  assert.equal(turbo.carChallenges.patches,alps.carChallenges.patches);
  assert.equal(JSON.stringify(alps),before);
  assert.equal(OBSTACLES.some(o=>o.type==='car-chicane'),false);
  assert.equal(BY_TYPE['car-chicane'],chicane);
  const features=sanitizeCarFeatures([],620,null,turbo.carChallenges);
  assert.equal(features.filter(f=>f.type==='booster').length,8);
  assert.equal(features.filter(f=>f.type==='car-chicane').length,7);
});
test('central islands offer reproducible left and right routes with full car clearance',()=>{
  const conditions=bakeCarConditions(alpsTurbo(alps).carChallenges,34);
  const targets=Array.from({length:20},(_,i)=>carObstacleLine(conditions,136,0,.6,.9,1.38,i));
  assert.ok(targets.some(x=>x<0)&&targets.some(x=>x>0));
  for(const x of targets)assert.ok(Math.abs(x)>=.55/2+.6+.18-1e-9&&Math.abs(x)<=1.38);
  assert.deepEqual(targets,Array.from({length:20},(_,i)=>carObstacleLine(conditions,136,0,.6,.9,1.38,i)));
  assert.equal(carObstacleLine(null,136,.3,.6,.9,1.38,0),.3);
  assert.equal(carObstacleLine(conditions,400,.3,.6,.9,1.38,0),.3);
  // The next gate must not undo the safe route around the current gate.
  assert.ok(carObstacleLine(conditions,34,.8,.6,.9,1.38,0)<0);
});
test('authored pad footprint and physical obstacle records use the same dimensions',()=>{
  const old=process.env.GP_CARS;process.env.GP_CARS='1';
  try {
    const frameAt=u=>({p:[u,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1});
    const out={boosters:[]},statics=[];
    const preset=alpsTurbo(alps).carChallenges;
    booster.build(preset.lanes[0],{frameAt,out});const pad=out.boosters[0];
    assert.equal(pad.length,9);assert.equal(pad.width,1.35);assert.equal(pad.latCenter,-1.08);
    assert.equal(attackLaneActive(pad,25,-1.08),true);assert.equal(attackLaneActive(pad,25,1),false);
    chicane.build(preset.gates[0],{frameAt,statics});
    assert.deepEqual(statics[0].size,[2,.5,.8]);assert.equal(statics[0].lat,.65);assert.equal(statics[0].pos[0],34);
  } finally {if(old===undefined)delete process.env.GP_CARS;else process.env.GP_CARS=old;}
});
test('higher powertrain values change straight speed while retaining corner grip limits',()=>{
  const samples=Array.from({length:300},(_,i)=>({u:i*.5,curv:0,w:2.1}));
  const course={samples,SAMPLE:.5};
  const standard=buildCarTelemetryProfile(course),turbo=buildCarTelemetryProfile(course,alpsTurbo(alps).carChallenges.racecraft);
  assert.ok(turbo.vTargetAt(100)>standard.vTargetAt(100));
  assert.equal(turbo.vTargetAt(100),26);assert.equal(standard.vTargetAt(100),18);
});
test('islands contact the full chassis before its small floor probe can enter them',()=>{
  const make=(x,z,vx,vz)=>({p:{x,y:.3,z},v:{x:vx,y:0,z:vz},translation(){return this.p;},linvel(){return this.v;},setTranslation(p){this.p=p;},setLinvel(v){this.v=v;}});
  const course={frameAt:()=>({p:[0,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1]})};
  const gate={u:0,lat:0,width:.55,length:2,height:.5},front=make(-1.5,0,20,0),side=make(0,.5,0,-3),hits=[];
  const run=body=>solveCarIslandCollisions({bodies:[body],course,gates:[gate],carYaw:[0],finishFrame:[null],dqFrame:[null],onContact:(i,hit)=>hits.push(hit)});
  run(front);assert.ok(front.p.x < -1-carHalfExtents(0).length);assert.ok(front.v.x<=0);
  run(side);assert.ok(side.p.z>gate.width/2+carHalfExtents(0).width);assert.ok(side.v.z>=0);
  assert.equal(hits.length,2);assert.ok(hits[0].longitudinal<0&&hits[1].lateral>0);
  const clear=make(-10,2,20,0),before=structuredClone(clear.p);run(clear);assert.deepEqual(clear.p,before);
});
test('saved-pose audit rejects a car body inside an island even if other race checks pass',()=>{
  const data={timeline:{raceStart:0},samples:[{u:0,p:[0,0,0],t:[1,0,0],r:[0,0,1]}],marbles:[{finishFrame:null,dqFrame:null}],carConditions:{gates:[{u:0,lat:0,width:.55,length:2}]},frames:[[[0,.3,0,0,0,0,1,0]],[[0,.3,0,0,0,0,1,0]]]};
  assert.equal(auditCarIslands(data).passed,false);
  data.frames[1][0][0]=-5;assert.equal(auditCarIslands(data).passed,true);
});
