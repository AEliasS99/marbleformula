import test from 'node:test';import assert from 'node:assert/strict';import{marbleProductionProfiles,marbleProductionLaps}from'./marble-production-profiles.mjs';
test('single-pass preparation is explicit and legacy preparations retain two laps',()=>{
 assert.equal(marbleProductionLaps(),2);
 assert.equal(marbleProductionLaps({requested:'1'}),1);
 for(const requested of [0,3,1.5,'',null,true,'1x'])assert.throws(()=>marbleProductionLaps({requested}),/one or two laps/);
});
test('camera resume retains the saved one-pass clock and rejects a lap change',()=>{
 for(const laps of [1,2]){
  const saved={info:{laps}},before=JSON.stringify(saved);
  assert.equal(marbleProductionLaps({resume:true,saved}),laps);
  assert.equal(marbleProductionLaps({resume:true,saved,requested:String(laps)}),laps);
  assert.throws(()=>marbleProductionLaps({resume:true,saved,requested:3-laps}),/cannot change saved laps/);
  assert.equal(JSON.stringify(saved),before);
 }
 assert.throws(()=>marbleProductionLaps({resume:true}),/saved race metadata/);
 assert.throws(()=>marbleProductionLaps({resume:true,saved:{info:{}}}),/one or two laps/);
});
test('new production defaults cannot silently restore backwards machines, hiss mix or the old plain Italy scenery',()=>{
 assert.deepEqual(marbleProductionProfiles({location:'italy'}),{physicsProfile:'contact-flow-v3',audioProfile:'asmr-v2',visualProfile:'tuscany-craft'});
 assert.equal(marbleProductionProfiles({location:'france'}).audioProfile,'asmr-v2');assert.equal(marbleProductionProfiles({location:'france'}).visualProfile,'legacy');
});
test('Austria keeps the existing crafted machinery with its own regional scene and no legacy fallback',()=>{
 assert.deepEqual(marbleProductionProfiles({location:'austria'}),{physicsProfile:'contact-flow-v3',audioProfile:'asmr-v2',visualProfile:'wachau-craft'});
 assert.throws(()=>marbleProductionProfiles({location:'austria',requested:{visualProfile:'legacy'}}),/crafted regional scenery/);
 assert.throws(()=>marbleProductionProfiles({location:'france',requested:{visualProfile:'wachau-craft'}}),/Austria circuit/);
 assert.equal(marbleProductionProfiles({location:'austria',resume:true,saved:{info:{physicsProfile:'contact-flow-v3',sceneryProfile:'wachau-venue-v1'},audioProfile:'asmr-v2'}}).visualProfile,'wachau-craft');
});
test('camera-only resume preserves old saved profiles and rejects an implicit physics/audio replacement',()=>{
 const saved={info:{physicsProfile:'contact-flow-v2',sceneryProfile:'tuscany-rich-v2'},audioProfile:'asmr-v1'};
 assert.deepEqual(marbleProductionProfiles({location:'italy',resume:true,saved}),{physicsProfile:'contact-flow-v2',audioProfile:'asmr-v1',visualProfile:'legacy'});
 assert.throws(()=>marbleProductionProfiles({location:'italy',resume:true,saved,requested:{physicsProfile:'contact-flow-v3'}}),/cannot change/);
 assert.throws(()=>marbleProductionProfiles({location:'italy',resume:true,saved,requested:{audioProfile:'asmr-v2'}}),/cannot change/);
});
