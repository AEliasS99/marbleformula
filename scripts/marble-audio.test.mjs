import test from 'node:test';import assert from 'node:assert/strict';import {limitBroadcastPeaks} from './marble-audio.mjs';
test('isolated impacts do not lower the whole soundtrack and linked stereo preserves direction',()=>{
 const rate=1000,left=new Float32Array(4000).fill(.1),right=new Float32Array(4000).fill(.05);left[1000]=20;right[1000]=10;limitBroadcastPeaks(left,right,rate);
 assert.ok(Math.abs(left[0]-.1)<1e-6);assert.ok(Math.abs(left[3500]-.1)<1e-6);assert.ok(Math.max(...left)<=.85001);assert.ok(left[1000]>.8);assert.equal(left[1000]/right[1000],2);assert.ok(left[1100]<.1,'linked release rather than instantaneous pumping');
});
test('quiet material remains intact and silent buffers remain finite',()=>{
 const left=Float32Array.from([0,.1,-.1,.02]),right=Float32Array.from([0,-.05,.1,0]),a=[...left],b=[...right];limitBroadcastPeaks(left,right);assert.deepEqual([...left],a);assert.deepEqual([...right],b);assert.throws(()=>limitBroadcastPeaks(new Float32Array(1),new Float32Array(2)));
});
