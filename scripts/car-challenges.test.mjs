import {test} from 'node:test';
import assert from 'node:assert/strict';
import alps from '../src/gp/circuits/r1-monaco.js';
import {bakeCarConditions,surfaceGrip,challengeLine,attackLaneActive,lateralBudget,brakingCommitment,tyreResponse} from '../src/gp/car-challenges.js';
import {sanitizeCarFeatures,solveCarChassisCollisions} from './car-engine.mjs';

test('conditions are reproducible, shared by all cars, and change across seeds',()=>{
  const a=bakeCarConditions(alps.carChallenges,17);
  assert.deepEqual(a,bakeCarConditions(alps.carChallenges,17));
  assert.notDeepEqual(a.patches,bakeCarConditions(alps.carChallenges,18).patches);
  assert.equal(surfaceGrip(a,120,-1.2),1);
  assert.ok(surfaceGrip(a,120,1)<0.71);
  assert.equal(surfaceGrip(a,100,1),1);
  assert.equal(bakeCarConditions(undefined,17),null);
  assert.equal(surfaceGrip(null,120,1),1);
});
test('sliding car footprints prevent body overlap that straight-car separation misses',()=>{
  const make=()=>[-.55,.55].map(z=>({p:{x:0,y:0,z},v:{x:10,y:0,z:0},translation(){return this.p;},linvel(){return this.v;},setTranslation(p){this.p=p;},setLinvel(v){this.v=v;}}));
  const sample={p:[0,0,0],t:[1,0,0],r:[0,0,1],n:[0,1,0],w:2.1};
  const run=(bodies,carYaw)=>solveCarChassisCollisions({bodies,carYaw,course:{samples:[sample]},MARBLES:[{stats:{est:3}},{stats:{est:3}}],dqFrame:[null,null],finishFrame:[null,null]});
  const straight=make();run(straight,[0,0]);assert.equal(straight[1].p.z-straight[0].p.z,1.1);
  const sliding=make();run(sliding,[.45,-.45]);assert.ok(sliding[1].p.z-sliding[0].p.z>1.2);
});
test('corner overload produces outward drift and friction loss, then recovers on a straight',()=>{
  const input={speed:14,curvature:.07,grip:.55,acceleration:-3,stability:.5,dt:1/120};
  const slide=tyreResponse(input);
  assert.ok(slide.excess>0 && slide.drag>0 && slide.drift<0);
  const opposite=tyreResponse({...input,curvature:-input.curvature});
  assert.equal(opposite.drift,-slide.drift);
  const clear=tyreResponse({...input,speed:8,curvature:0,acceleration:0,drift:slide.drift});
  assert.ok(Math.abs(clear.drift)<Math.abs(slide.drift));
  const safe=tyreResponse({...input,speed:7,curvature:.01,grip:1,acceleration:0});
  assert.equal(safe.excess,0);assert.equal(safe.drift,0);
});
test('braking commitment is reproducible and varies by driver without rank input',()=>{
  const c=bakeCarConditions(alps.carChallenges,17);
  const choices=Array.from({length:6},(_,i)=>brakingCommitment(c,i,3,.5));
  assert.deepEqual(choices,Array.from({length:6},(_,i)=>brakingCommitment(c,i,3,.5)));
  assert.ok(Math.max(...choices)>1.03 && Math.min(...choices)<1.02);
});
test('both wet inside and dry outside choices occur, without dependence on rank',()=>{
  const c=bakeCarConditions(alps.carChallenges,17);
  const choices=Array.from({length:6},(_,i)=>challengeLine(c,120,.5,i,.6,.5));
  assert.ok(choices.some(x=>x<0));assert.ok(choices.some(x=>x>0));
  assert.equal(challengeLine(c,320,.2,0,.6,.5),null);
});
test('attack pad activates only inside its visible road footprint',()=>{
  const pad={u0:60,u1:66.2,latCenter:1.08,width:1.42};
  assert.equal(attackLaneActive(pad,62,1.08),true);
  assert.equal(attackLaneActive(pad,62,-1),false);
  assert.equal(attackLaneActive(pad,67,1.08),false);
});
test('wet braking consumes steering budget; pads avoid bends and retain legacy layout when no geometry is supplied',()=>{
  assert.ok(lateralBudget(.55,3,.5)<lateralBudget(1,3,.5));
  assert.ok(lateralBudget(.55,3,.5)<lateralBudget(.55,0,.5));
  const us=Array.from({length:300},(_,i)=>i);
  const curv=us.map(u=>u>=50&&u<=85?.1:0);
  const pads=sanitizeCarFeatures([],300,{us,curv});
  assert.ok(pads.every(p=>!us.some((u,k)=>u>=p.u-6&&u<=p.u+12&&Math.abs(curv[k])>.025)));
  assert.equal(sanitizeCarFeatures([],300)[0].u,58);
});
