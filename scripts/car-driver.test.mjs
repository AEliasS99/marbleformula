import test from 'node:test';
import assert from 'node:assert/strict';
import {planCarDriving,drivingLineAt,followingSpeedLimit} from '../src/gp/car-driver.js';

const car=(totalU,lat,speed,vLat=0)=>({totalU,lat,speed,vLat,halfWidth:.44,halfLength:.77});
const base=()=>({u:100,totalU:100,lat:0,speed:20,time:3,intelligence:.8,stability:.7,driver:0,
 conditions:{seed:47,patches:[],gates:[],racecraft:{topSpeed:26,braking:10.3,cornerAcceleration:10.8,boostSpeed:6.5,boostSeconds:3.8}},
 course:{uFinish:600,frameAt:()=>({w:2.1,curv:0})},telemetry:{racingLatAt:()=>0},traffic:[],boosters:[]});
const pads=[{u0:125,u1:131,latCenter:-1.08,width:1.35},{u0:125,u1:131,latCenter:1.08,width:1.35}];

test('a clear straight keeps the racing line and does not brake for no reason',()=>{
 const p=planCarDriving(base());assert.equal(p.mode,'racing-line');assert.equal(p.risk,0);assert.equal(p.speedLimit,26);
});
test('paired boost lanes are evaluated separately; a blocked left strip cannot win over a clear right strip',()=>{
 const p=planCarDriving({...base(),boosters:pads,traffic:[car(103,-1.15,20)]});
 assert.equal(p.reason,'clear-boost-lane');assert.equal(p.targetLat,1.08);assert.equal(p.risk,0);
 assert.equal(planCarDriving({...base(),boosters:[...pads].reverse(),traffic:[car(103,-1.15,20)]}).targetLat,p.targetLat);
});
test('overtaking sweeps the whole manoeuvre and avoids an occupied side',()=>{
 const p=planCarDriving({...base(),traffic:[car(116,0,10),car(100,-1.25,20)]});
 assert.equal(p.reason,'clear-passing-route');assert.ok(p.targetLat>1);assert.equal(p.risk,0);assert.ok(p.speedLimit<20,'back off while moving out from behind the blocker');
});
test('a fast car arriving from behind prevents a cut across its lane',()=>{
 const p=planCarDriving({...base(),boosters:pads,traffic:[car(92,-1.2,32)]});
 assert.ok(p.targetLat>=0,'do not cross the fast left-hand car');assert.equal(p.risk,0);
});
test('a sharp bend ahead causes braking on the straight before entry',()=>{
 const p=planCarDriving({...base(),speed:26,course:{uFinish:600,frameAt:u=>({w:2.1,curv:u>119?.12:0})}});
 assert.ok(p.speedLimit<23&&p.speedLimit>8);assert.ok(p.lookaheadMetres>40);
});
test('wet inside versus dry outside is a grip/time decision, not a random last-second dive',()=>{
 const input=base();input.conditions.patches=[{u0:110,u1:135,lat:1.0,halfWidth:1.1,grip:.55}];
 input.course.frameAt=()=>({w:2.1,curv:.07});input.telemetry.racingLatAt=()=>.9;
 const p=planCarDriving(input);assert.ok(p.targetLat<.5);assert.equal(p.risk,0);assert.ok(Number.isFinite(p.speedLimit));
});
test('following a stopped car has a physical braking limit and includes complete chassis length',()=>{
 const input={speed:25,totalU:100,lat:0,traffic:[car(112,0,0)],braking:10.3,grip:1};
 const dry=followingSpeedLimit(input),wet=followingSpeedLimit({...input,grip:.55});
 assert.ok(dry<15&&dry>0);assert.ok(wet<dry);assert.equal(followingSpeedLimit({...input,traffic:[car(112,1.5,0)]}),Infinity);
});
test('commitment keeps a safe chosen route stable, and trajectory is continuous and reachable',()=>{
 const input={...base(),boosters:pads,traffic:[car(103,-1.15,20)]},p=planCarDriving(input);
 const next=planCarDriving({...input,u:102,totalU:102,time:3.1,lat:.03,previous:p});
 assert.equal(next.mode,p.mode);assert.equal(next.startU,p.startU);
 assert.equal(drivingLineAt(p,p.startU,input.telemetry),p.originLat);
 assert.equal(drivingLineAt(p,p.startU+p.transition,input.telemetry),p.targetLat);
 let maxChange=0;for(let u=p.startU+.1;u<=p.startU+p.transition;u+=.1)maxChange=Math.max(maxChange,Math.abs(drivingLineAt(p,u,input.telemetry)-drivingLineAt(p,u-.1,input.telemetry)));
 assert.ok(maxChange<.03,'no lateral teleport in the proposed path');
});
test('same physical scene and seed gives the same decision regardless of leaderboard rank',()=>{
 const input={...base(),boosters:pads,traffic:[car(103,-1.15,20)]};
 assert.deepEqual(planCarDriving({...input,rank:1}),planCarDriving({...input,rank:6}));
 assert.deepEqual(planCarDriving(input),planCarDriving(input));
});
test('collecting boost does not instantly reverse an unfinished safe lane change',()=>{
 const input={...base(),boosters:pads,traffic:[car(103,-1.15,20)]},p=planCarDriving(input);
 const charged=planCarDriving({...input,u:126,totalU:126,lat:.95,time:3.4,boosters:[],boostRemaining:3,previous:p});
 assert.equal(charged.mode,p.mode);assert.equal(charged.risk,0);
});
