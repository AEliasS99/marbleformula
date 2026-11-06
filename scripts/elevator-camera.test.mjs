import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {elevatorCameraEnvelope,elevatorCameraVolumes,elevatorRiderInTransport,cameraRacingPool} from './race-director.mjs';
import {venueBlocks,venueClearance} from '../src/gp/venue.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/tuscany-elevator-camera.json',import.meta.url)));
test('saved Tuscany rider stays excluded after the animation ends while hidden inside the lift envelope',()=>{
 const e=fixture.elevators[0],envelope=elevatorCameraEnvelope(e),rider=1;
 assert.equal(e.cycles.find(c=>c.riders.length===1&&c.riders[0]===rider).closeTopAt,7153);
 for(const f of [7153,7170]){
  const position=fixture.rows[f][rider];
  assert.equal(elevatorRiderInTransport(e,envelope,position,rider,f),true,'hidden rider became racing subject at '+f);
  assert.equal(venueBlocks({buildings:[envelope]},[-60,9,-80],position),true,'the same envelope must drive visibility and eligibility');
 }
 for(const f of [7192,7210])assert.equal(elevatorRiderInTransport(e,envelope,fixture.rows[f][rider],rider,f),false,'rider outside rendered structure must become eligible');
 assert.equal(elevatorRiderInTransport(e,envelope,fixture.rows[7170][3],3,7170),false,'the racing Argentina subject stays eligible');
});
test('dock arrival stays the subject when all road racers are inside the tower',()=>{
 assert.deepEqual(cameraRacingPool([13,8],i=>i===13,()=>false),[8]);
 assert.deepEqual(cameraRacingPool([13,8],()=>false,i=>i===13),[13]);
 assert.deepEqual(cameraRacingPool([13,8],()=>true,()=>true),[13,8]);
});
test('recorded Italy handoff keeps the arrival visible until the upstairs rider exits',()=>{
 const saved=JSON.parse(fs.readFileSync(new URL('./fixtures/italy-stair-camera-handoff.json',import.meta.url)));
 const e=saved.elevator,volume=elevatorCameraVolumes(e);
 for(const f of [7157,7158]){
  const hidden=i=>elevatorRiderInTransport(e,volume,saved.rows[f][i],i,f);
  assert.equal(hidden(13),true);
  assert.equal(hidden(8),false);
  assert.deepEqual(cameraRacingPool([13,8],hidden,()=>false),[8]);
 }
 for(const f of [7196,7197,7198,7202,7217]){
  const hidden=i=>elevatorRiderInTransport(e,volume,saved.rows[f][i],i,f);
  assert.equal(hidden(13),false,'exited Sweden stays eligible at '+f);
  assert.equal(cameraRacingPool([13,8],hidden,()=>true)[0],13);
 }
});
test('the wider rendered plinth blocks the bottom but is not extruded up the stair',()=>{
 const e=fixture.elevators[0],buildings=elevatorCameraVolumes(e);
 const point=y=>[e.center[0]+e.length/2+.22,e.center[1]+y,e.center[2]];
 assert.equal(venueClearance({buildings},point(-.58)),0);
 assert.ok(venueClearance({buildings},point(e.lift))>0);
 const rung=[e.center[0]+e.length/2+.16,e.center[1]+1.2,e.center[2]];
 assert.equal(venueClearance({buildings},rung),0,'actual outer rung is still opaque');
});
test('stair envelope covers the actual plinth, tilted cradle, rear rung and header',()=>{
 const e=fixture.elevators[0],v=elevatorCameraEnvelope(e),L=e.length;
 const tilt=14*Math.PI/180;
 const extents=[(L+.46)/2,(L-.08)/2*Math.cos(tilt)+.34*Math.sin(tilt),L/2+.12+.08/2,(L+.24)/2];
 for(const x of extents)assert.ok(v.box.x[1]>=x&&v.box.x[0]<=-x);
 assert.ok(v.box.x[1]<(L/2+.25),'do not hide exited riders with the former metre of padding');
});
test('transport membership preserves timed rides and handles a rotated tower without excluding unrelated runners',()=>{
 const e={center:[10,-20,30],fwd:[0,0,1],length:4,width:2,lift:20,cycles:[{riders:[4],closeAt:100,openAt:200,closeTopAt:210}]},volume=elevatorCameraEnvelope(e);
 assert.equal(elevatorRiderInTransport(e,volume,[10,1,30],4,99),false);
 assert.equal(elevatorRiderInTransport(e,volume,[20,1,30],4,150),true);
 assert.equal(elevatorRiderInTransport(e,volume,[10,1,32.5],4,211),true);
 assert.equal(elevatorRiderInTransport(e,volume,[10,1,33.5],4,211),false);
 assert.equal(elevatorRiderInTransport(e,volume,[10,1,30],5,211),false);
});
