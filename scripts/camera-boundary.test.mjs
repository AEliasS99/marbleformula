import test from 'node:test';
import assert from 'node:assert/strict';
import {clearCameraBoundary} from './race-director.mjs';
test('move a midpoint cut before its two obstructed frames, preserving continuous shots',()=>{
 const cut=clearCameraBoundary({start:1104,boundary:1193,end:1370,minFrames:45,maxShift:30,leftClear:f=>f!==1190&&f!==1191,rightClear:()=>true});
 assert.equal(cut,1190);
 assert.ok(cut-1104>=45&&1370-cut>=45);
});
test('a cut cannot create a short rescue shot or cross the search window',()=>{
 assert.equal(clearCameraBoundary({start:0,boundary:45,end:90,minFrames:45,maxShift:30,leftClear:f=>f!==44,rightClear:()=>true}),null);
 assert.equal(clearCameraBoundary({start:0,boundary:100,end:200,minFrames:45,maxShift:10,leftClear:f=>f<80,rightClear:()=>true}),null);
});
test('an already clear cut stays exactly where it was',()=>{
 assert.equal(clearCameraBoundary({start:0,boundary:60,end:120,minFrames:45,maxShift:30,leftClear:()=>true,rightClear:()=>true}),60);
});
