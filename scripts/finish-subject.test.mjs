import test from 'node:test';import assert from 'node:assert/strict';import{finishSubjectAt}from'./race-director.mjs';
test('finish coverage releases an old crossing after 0.9s and targets the next live arrival',()=>{
 assert.deepEqual(finishSubjectAt([100,244],153,60),{at:100,i:0});
 assert.deepEqual(finishSubjectAt([100,244],154,60),{at:244,i:1});
 assert.equal(finishSubjectAt([100,null],154,60),null);
 assert.deepEqual(finishSubjectAt([244],136,60),{at:244,i:0});
 assert.equal(finishSubjectAt([244],135,60),null);
});
