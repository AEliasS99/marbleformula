import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {safeCarSmoothingPose,carPoseIslandOverlap} from './car-pose-clearance.mjs';
const fixture=JSON.parse(readFileSync(new URL('./tokyo-island-smoothing-fixture.json',import.meta.url)));
test('Tokyo seed35 smoothing cannot reintroduce the two observed island penetrations',()=>{
 assert.equal(fixture.cases.length,2);
 for(const c of fixture.cases){
  assert.ok(carPoseIslandOverlap(c.candidate,fixture.layout)>.01);
  assert.ok(carPoseIslandOverlap(c.current,fixture.layout)<=.01);
  const safe=safeCarSmoothingPose(c.candidate,c.current,fixture.layout);
  assert.deepEqual(safe,c.current);
  assert.ok(carPoseIslandOverlap(safe,fixture.layout)<=.01);
 }
});
test('clear blends and legacy circuits without islands retain smoothing',()=>{
 const c=fixture.cases[0];
 assert.equal(safeCarSmoothingPose(c.candidate,c.current,[]),c.candidate);
 const clear=[...c.current];clear[1]+=10;
 assert.equal(safeCarSmoothingPose(clear,c.current,fixture.layout),clear);
});
