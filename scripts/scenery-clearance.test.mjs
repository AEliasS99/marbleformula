import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sceneryLayout} from '../src/gp/scenery-layout.js';

test('complete Swiss trackside terraces remain outside the real road and barrier margin',()=>{
 const {samples}=JSON.parse(readFileSync(new URL('../src/gp/races/r1-monaco.json',import.meta.url))),layout=sceneryLayout(samples);
 assert.ok(layout.alpsTrackFlags.length>50,'authored trackside scenery must remain populated');
 for(const p of layout.alpsTrackFlags){
  assert.ok(p.trackClearanceVerified,'every accepted Swiss group needs road clearance');
  const radius=[1.68,2.18,1.18][p.variant];
  for(const s of samples){
   if(Math.abs(s.p[1]-(p.y+.05))>9.5)continue;
   assert.ok(Math.hypot(p.x-s.p[0],p.z-s.p[2])>=radius+.35+(s.w??2.2)-1e-8,'terrace must not enter the road or barrier margin');
  }
 }
 for(const p of layout.alpsPastures){
  assert.ok(p.trackClearanceVerified,'large pastures need scale-aware clearance');
  const radius=5.4*.98*p.scale;
  for(const s of samples){
   if(Math.abs(s.p[1]-(p.y-.35))>11.5)continue;
   assert.ok(Math.hypot(p.x-s.p[0],p.z-s.p[2])>=radius+.35+(s.w??2.2)-1e-8,'scaled pasture must not enter the road or barrier margin');
  }
 }
 assert.deepEqual(sceneryLayout(samples),layout,'placement must remain deterministic');
});
