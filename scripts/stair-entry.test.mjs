import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {STAIR,stairLoop,stairLocal} from '../src/gp/stair.js';
import {replayDockArrival} from './stair-dock-fixture.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/italy-stair-entry-stall.json',import.meta.url)));
test('recorded Tuscany entry reproduces rear-edge stalls; slower saved stairs collect every recorded arrival over twelve phases',async()=>{
 await RAPIER.init();
 const control=fixture.arrivals.map(a=>replayDockArrival(fixture,a,undefined));
 assert.ok(control.some(r=>r.stationaryFrames>0),'control failed to reproduce the recorded entry stall');
 for(const a of fixture.arrivals)for(let phase=0;phase<12;phase++){
  const result=replayDockArrival(fixture,a,.8,phase);
  assert.equal(result.stationaryFrames,0,`two-second dock stall from frame${a.frame}, phase${phase}`);
  assert.ok(result.boardSeconds!==null&&result.boardSeconds<4,`failed to collect arrival${a.frame}, phase${phase}`);
  assert.ok(result.final.y>fixture.elevator.center[1]+10,'rider did not continue physically up the shaft');
 }
});
test('saved historical stair clocks remain unchanged; new service speed preserves platform clearance and is serialized',()=>{
 const e=fixture.elevator,old=stairLoop(e),explicit=stairLoop({...e,slowSpeed:1.6});
 assert.deepEqual(old,explicit);assert.equal(old.count,37);assert.equal(old.cycle,33.56213906656797);
 const saved=JSON.parse(JSON.stringify({...e,slowSpeed:.8})),next=stairLoop(saved);
 assert.ok(next.dt*.8-STAIR.plate>=STAIR.gap,'slowing must not compress the platform clearance');
 for(const t of [0,1,109,111.333,214])for(let k=0;k<old.count;k++)assert.deepEqual(stairLocal(e,old,k,t),stairLocal(e,explicit,k,t));
 for(const speed of [0,-1,Infinity,NaN,10])assert.throws(()=>stairLoop({...e,slowSpeed:speed}),/Invalid stair/);
});
