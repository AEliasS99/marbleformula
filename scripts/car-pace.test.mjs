import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3,PerspectiveCamera} from 'three';
import {RACE_PACE,brakingLookahead,poweredAcceleration,pondHalfWidth,waterCoverage,waterDrag} from '../src/gp/car-pace.js';
import {bakeCarConditions,surfaceGrip} from '../src/gp/car-challenges.js';
import {followingSpeedLimit,planCarDriving} from '../src/gp/car-driver.js';
import {selectCarCountries,carCheckpointSurvivors,carStartingGrid} from '../src/gp/car-roster.js';
import {cockpitCamera,cockpitRoadOptions} from '../src/gp/car-cockpit.js';
import {buildCarTelemetryProfile} from './car-engine.mjs';
import {colombiaRushRound,colombiaRushAction} from '../src/gp/circuits/colombia-action.js';
import colombia from '../src/gp/circuits/r7-coffeeandes.js';

const input=()=>({u:100,totalU:100,lat:0,speed:50,time:4,intelligence:.8,stability:.7,
 conditions:{seed:55,patches:[],gates:[],racecraft:{...RACE_PACE}},
 course:{uFinish:2200,frameAt:()=>({w:3.2,curv:0})},telemetry:{racingLatAt:()=>0},traffic:[],boosters:[]});
test('race-speed braking sees a bend and stopped traffic beyond the old 55m horizon',()=>{
 const a=input();a.conditions.patches=[{u0:0,u1:600,lat:0,halfWidth:4,grip:.55}];a.course.frameAt=u=>({w:3.2,curv:u>=180?.07:0});
 const plan=planCarDriving(a);assert.ok(plan.lookaheadMetres>80);assert.ok(plan.speedLimit<49&&plan.speedLimit>30);
 const traffic=[{totalU:180,lat:0,speed:0,halfLength:.77,halfWidth:.44}];
 assert.equal(followingSpeedLimit({...a,traffic}),Infinity,'old limited sensor misses the stopped car');
 assert.ok(followingSpeedLimit({...a,traffic,braking:22,grip:.55,lookahead:brakingLookahead(50,22,.55)})<50);
 assert.ok(brakingLookahead(50,22,.55)>brakingLookahead(50,22,1));
});
test('clear straights permit actual higher speed and tenfold lane acceleration without changing HUD units',()=>{
 const a=input(),plan=planCarDriving({...a,boostRemaining:2});
 assert.equal(plan.speedLimit,58);assert.equal(poweredAcceleration(RACE_PACE,true,true),140);
 assert.equal(poweredAcceleration(RACE_PACE,true,true)/poweredAcceleration(RACE_PACE,false,false),10);
 const samples=Array.from({length:600},(_,i)=>({u:i*.5,curv:0,w:3.2}));
 const straight=buildCarTelemetryProfile({samples,SAMPLE:.5},RACE_PACE);
 assert.ok(straight.vTargetAt(150)*3.6>150);
 samples.forEach(s=>s.curv=.014);
 const bend=buildCarTelemetryProfile({samples,SAMPLE:.5},RACE_PACE);
 assert.ok(bend.vTargetAt(150)<40,'gentle-looking curvature still enforces real lateral grip at speed');
});
test('pond slowdown exists only inside the same rounded rendered footprint, with a dry passing route',()=>{
 const p={kind:'pond',u0:120,u1:144,lat:1.15,halfWidth:1.15,drag:.0075};
 const conditions=bakeCarConditions({patches:[p],gates:[],racecraft:RACE_PACE},55);
 assert.equal(pondHalfWidth(p,120),0);assert.equal(pondHalfWidth(p,132),1.15);
 assert.equal(waterCoverage(p,132,-1.5),0);assert.equal(surfaceGrip(conditions,132,-1.5),1);
 assert.ok(surfaceGrip(conditions,132,1.15)<.75);
 assert.equal(waterDrag(conditions,132,-1.5,40),0);assert.ok(waterDrag(conditions,132,1.15,40)>=10);
 assert.equal(waterDrag(conditions,119,1.15,40),0);
 const a=input();a.conditions=conditions;a.lat=1.15;a.u=a.totalU=105;
 const plan=planCarDriving(a);assert.ok(plan.targetLat<.5,'planner finds the dry route before entering water');
});
test('twelve real countries retain stats, three elimination checkpoints and six final contenders',()=>{
 const all=Array.from({length:12},(_,i)=>({abbr:`C${i}`,stats:{vel:3}})),codes=all.map(c=>c.abbr).join(',');
 const selected=selectCarCountries(all,codes);assert.equal(selected.length,12);assert.ok(selected.every(c=>all.includes(c)));
 assert.deepEqual(carCheckpointSurvivors(12),[10,8,6]);assert.deepEqual(carCheckpointSurvivors(6),[5,4,3]);assert.deepEqual(carCheckpointSurvivors(10),[8,6,4]);
 assert.throws(()=>selectCarCountries(all,codes.replace('C11','C0')));
 const grid=carStartingGrid(12),laneWidth=9.4/grid.lanes;
 assert.equal(grid.rows,2);assert.ok(laneWidth>.88+.2);assert.ok(grid.rowGap>1.54+.2,'complete starting chassis are separated');
 assert.equal(carStartingGrid(10).lanes,10,'official final grid stays intact');
});
test('the higher-speed passing decision is deterministic and cannot read rank or desired winner',()=>{
 const a=input();a.traffic=[{totalU:130,lat:0,speed:24,halfWidth:.44,halfLength:.77}];
 assert.deepEqual(planCarDriving({...a,rank:1,desiredWinner:0}),planCarDriving({...a,rank:12,desiredWinner:8}));
 const plan=planCarDriving(a);assert.equal(plan.risk,0);assert.ok(Math.abs(plan.targetLat)>1,'take a clear passing route instead of forming a single-file queue');
});
test('new driver framing keeps the steering wheel low and gaze bounded, retaining the existing chassis attachment',()=>{
 const samples=[{u:0,p:[0,0,0],n:[0,1,0]},{u:100,p:[100,0,20],n:[0,1,0]}];
 const options=cockpitRoadOptions(samples,20,50,'race-seat-v2'),shot=cockpitCamera([20,0,4],[0,0,0,1],options);
 assert.equal(shot.fov,74);assert.ok(new Vector3(...shot.pos).distanceTo(new Vector3(20,0,4))<.1);
 assert.ok(new Vector3(...shot.target).sub(new Vector3(...shot.pos)).normalize().dot(new Vector3(1,0,0))>.98);
 const cam=new PerspectiveCamera(74,16/9,.018,1500);cam.position.fromArray(shot.pos);cam.up.fromArray(shot.up);cam.lookAt(new Vector3(...shot.target));cam.updateMatrixWorld();
 const topOfWheel=new Vector3(.20,-.062,0).multiply(new Vector3(1.22,.92,1.05)).add(new Vector3(20,0,4)).project(cam);
 assert.ok(topOfWheel.y<-.5,'wheel stays in the bottom quarter rather than covering the racing view');
 assert.deepEqual(cockpitRoadOptions(samples,0,50,undefined),{});
});
test('Rush evolves the authored Colombian outline and replaces solid gates with separated water choices',()=>{
 const f=JSON.parse(readFileSync('out/tcr/colombia-course-geometry.json'));
 // Pure geometry test, not an alternate production bake. Expand the saved road
 // frame to exercise the composer; actual buildCourse is checked separately.
 const samples=f.samples.map(s=>({...s,u:s.u*2.3,curv:s.curv/2.3,w:3.2}));
 const course={...f,samples,L:f.L*2.3,uFinish:f.uFinish*2.3};
 const road=colombiaRushRound(colombia),round=colombiaRushAction(road,course),c=round.carChallenges;
 assert.equal(road.outline,colombia.outline);assert.equal(c.gates.length,0);assert.equal(c.patches.length,4);assert.ok(c.lanes.length>=8);
 for(const p of c.patches)assert.ok(Math.abs(p.lat)+p.halfWidth<3.2);
 for(const lane of c.lanes){assert.equal(lane.accel,140);assert.equal(lane.target,58);assert.ok(c.patches.every(p=>lane.u+lane.length<p.u0-45||lane.u>p.u1+35));}
});
