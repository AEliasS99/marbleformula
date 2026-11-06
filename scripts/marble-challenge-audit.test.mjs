import test from 'node:test';
import assert from 'node:assert/strict';
import {challengePlan,laneAt} from '../src/gp/obstacles/challenge-lanes.js';
import {marbleChallengeAudit} from './marble-challenge-audit.mjs';

// Synthetic recorded poses test the independent auditor, not physical readiness.
// The real twenty-body challenge test remains the production physics gate.
function fixture(){
 const plan={type:'route-choice',length:22,routes:[{id:'shortcut',clearWidth:1.12,points:[[0,-1.54],[22,-1.54]]},{id:'main',clearWidth:1.25,points:[[0,.64],[4,1.3],[6,-.04],[8,1.3],[10,-.04],[12,1.3],[14,-.04],[16,1.3],[18,-.04],[20,.64],[22,.64]]}]};
 const zones=[0,30].map(u=>({...structuredClone(plan),id:'route-choice-'+u,u0:u,u1:u+plan.length}));
 const data={fps:60,marbleRadius:.35,info:{length:100,laps:1},timeline:{raceStart:0},
  samples:Array.from({length:61},(_,u)=>({u,p:[u,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1]})),
  features:zones.map(z=>({type:z.type,u:z.u0})),challengeZones:zones,
  obstacles:zones.map(z=>({kind:'fin',challengeZone:z.id})),
  marbles:Array.from({length:6},(_,i)=>({abbr:'M'+i,finishFrame:330,dqFrame:null}))};
 data.frames=Array.from({length:331},(_,f)=>data.marbles.map((_,i)=>{
  const u=f/6,zone=zones.find(z=>u>=z.u0&&u<z.u1);
  const lat=zone?laneAt(zone.routes[i%2].points,u-zone.u0):0;
  return [u,.35,lat,0,0,0,1,u];
 }));
 return data;
}
test('recorded passage in both real-width corridors passes the route auditor',()=>{
 assert.equal(marbleChallengeAudit(fixture()).passed,true);
});
test('a painted zigzag wide enough to cut straight is not a longer route',()=>{
 const data=fixture();data.challengeZones[0].routes[1].clearWidth=4;
 assert.ok(marbleChallengeAudit(data).failures.some(f=>f.reason==='shortcut is not physically shorter'));
});
test('midpoint classification cannot hide a bypass elsewhere in the chicane',()=>{
 const data=fixture();for(const row of data.frames)if(row[1][7]>4&&row[1][7]<6)row[1][2]+=1;
 assert.ok(marbleChallengeAudit(data).failures.some(f=>f.reason==='route corridor bypassed'));
});
test('aggregate route counts cannot hide a single unused branch at each separate challenge',()=>{
 const data=fixture();
 for(const row of data.frames)for(const p of row){
  const zone=data.challengeZones.find(z=>p[7]>=z.u0&&p[7]<z.u1);
  if(zone)p[2]=laneAt(zone.routes[zone.u0===0?0:1].points,p[7]-zone.u0);
 }
 const audit=marbleChallengeAudit(data);
 assert.equal(audit.routeUse.main,6);assert.equal(audit.routeUse.shortcut,6);
 assert.equal(audit.failures.filter(f=>f.reason==='only one branch used in this challenge').length,2);
});
