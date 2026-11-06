import test from 'node:test';
import assert from 'node:assert/strict';
import {buildObstacles} from './season.mjs';
import {OBSTACLES,BY_TYPE} from '../src/gp/obstacles/index.js';

const frameAt=u=>({u,p:[u,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1,curv:0});
function guards(type){
 const course={frameAt,features:[{type,u:10}],samples:Array.from({length:161},(_,i)=>frameAt(i*.5-10)),END:60,elevators:[]};
 return buildObstacles(course).statics.filter(o=>o.kind==='guard');
}
test('authored opt-in challenges receive their declared guards in the actual production builder',()=>{
 for(const type of ['route-choice','single-lane','roller-bank']){
  assert.ok(!OBSTACLES.includes(BY_TYPE[type]),'Keep historical shuffle pool unchanged');
  const declared=guards(type).filter(o=>o.size[1]===2.4);
  assert.equal(declared.length,60,type+' omitted its full thirty-metre guard zone');
  assert.equal(Math.min(...declared.map(o=>o.pos[0])),7.5);
  assert.equal(Math.max(...declared.map(o=>o.pos[0])),36.5);
  assert.ok(declared.every(o=>o.depth===.3&&o.pos[1]===1.73));
 }
});
test('legacy jump zone and everywhere containment remain unchanged',()=>{
 const records=guards('jump'),jump=records.filter(o=>o.size[1]===2);
 assert.equal(jump.length,30);
 assert.equal(Math.min(...jump.map(o=>o.pos[0])),7.5);
 assert.equal(Math.max(...jump.map(o=>o.pos[0])),21.5);
 assert.equal(records.filter(o=>o.size[1]===1).length,118);
});
