import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {elevatorCameraEnvelope,elevatorRiderInTransport} from './race-director.mjs';
import {venueBlocks} from '../src/gp/venue.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/tuscany-elevator-camera.json',import.meta.url)));
test('saved Tuscany rider stays excluded after the animation ends while hidden inside the lift envelope',()=>{
 const e=fixture.elevators[0],envelope=elevatorCameraEnvelope(e),rider=1;
 assert.equal(e.cycles.find(c=>c.riders.length===1&&c.riders[0]===rider).closeTopAt,7153);
 for(const f of [7153,7170,7192]){
  const position=fixture.rows[f][rider];
  assert.equal(elevatorRiderInTransport(e,envelope,position,rider,f),true,'hidden rider became racing subject at '+f);
  assert.equal(venueBlocks({buildings:[envelope]},[-60,9,-80],position),true,'the same envelope must drive visibility and eligibility');
 }
 assert.equal(elevatorRiderInTransport(e,envelope,fixture.rows[7210][rider],rider,7210),false,'released rider must become eligible');
 assert.equal(elevatorRiderInTransport(e,envelope,fixture.rows[7170][3],3,7170),false,'the racing Argentina subject stays eligible');
});
test('transport membership preserves timed rides and handles a rotated tower without excluding unrelated runners',()=>{
 const e={center:[10,-20,30],fwd:[0,0,1],length:4,width:2,lift:20,cycles:[{riders:[4],closeAt:100,openAt:200,closeTopAt:210}]},volume=elevatorCameraEnvelope(e);
 assert.equal(elevatorRiderInTransport(e,volume,[10,1,30],4,99),false);
 assert.equal(elevatorRiderInTransport(e,volume,[20,1,30],4,150),true);
 assert.equal(elevatorRiderInTransport(e,volume,[10,1,32.5],4,211),true);
 assert.equal(elevatorRiderInTransport(e,volume,[10,1,33.5],4,211),false);
 assert.equal(elevatorRiderInTransport(e,volume,[10,1,30],5,211),false);
});
