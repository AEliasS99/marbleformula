import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';
import {channelCTAWindow,channelCTAAt,channelCTAState,channelCTABounds} from '../src/gp/channel-cta.js';
test('both actual marble and car timelines keep every racing/replay frame clear',()=>{
 for(const p of ['out/tcr/marble-review/italy-marbles-race-first-seed67/race.json','out/tcr/track-review/britain-heat1-world-v22-cotswold-seed66/race.json']){
  const d=JSON.parse(fs.readFileSync(p)),before=JSON.stringify(d),w=channelCTAWindow(d.timeline,d.fps);
  for(let f=0;f<d.timeline.results.at;f++)assert.equal(channelCTAAt(f,w,d.fps),null);
  assert.ok(w.start>d.timeline.results.at);assert.ok(w.end<d.timeline.total);assert.ok(w.end-w.start<=14*d.fps);
  assert.equal(JSON.stringify(d),before);
 }
});
test('actual cars and marbles see a pre-green reminder without obscuring any live or replay frame',()=>{
 for(const p of ['out/tcr/marble-review/italy-marbles-race-first-seed67/race.json','out/tcr/track-review/france-heat1-world-v24-provence-seed68/race.json']){
  const d=JSON.parse(fs.readFileSync(p));assert.ok(channelCTAState(d.fps,d.timeline,d.fps)?.compact);
  for(let f=d.timeline.raceStart-Math.floor(.5*d.fps);f<d.timeline.results.at;f++)assert.equal(channelCTAState(f,d.timeline,d.fps),null);
  const close=channelCTAWindow(d.timeline,d.fps);assert.ok(channelCTAState(close.start+d.fps,d.timeline,d.fps));assert.equal(channelCTAState(close.start+d.fps,d.timeline,d.fps).compact,false);
 }
 const short={raceStart:380,results:{at:900},total:1170};assert.equal(channelCTAState(60,short,60,{shortEnd:1170}),null);
});
test('the Short has one readable closing prompt after the results arrive and no extra frames',()=>{
 const w=channelCTAWindow({results:{at:900},total:1170},60,{shortEnd:1170});assert.deepEqual(w,{start:960,end:1155});assert.equal(channelCTAAt(959,w,60),null);assert.ok(channelCTAAt(1000,w,60).opacity>.9);assert.equal(channelCTAAt(1170,w,60),null);
});
test('native landscape/portrait cards fit safe margins and stay outside the established results panel',()=>{
 for(const compact of [false,true])for(const [w,h]of [[3840,2160],[1920,1080],[1080,1920]]){
  const b=channelCTABounds(w,h,{compact});assert.ok(b.left>=0&&b.top>=0&&b.left+b.width<=w&&b.top+b.height<=h-32*b.scale);
  if(!b.portrait&&!compact)assert.ok(b.left+b.width<(w-1060*b.scale)/2);
  else if(b.portrait)assert.ok(b.top>h/2+400*b.scale,'below the results panel, above player controls');
 }
});
test('arbitrary render ordering gives deterministic fades without fake subscription state',()=>{
 const w={start:60,end:540};for(const f of [61,80,140,500,539])assert.deepEqual(channelCTAAt(f,w,60),channelCTAAt(f,w,60));assert.equal(channelCTAAt(60,w,60).opacity,0);assert.equal(channelCTAWindow({results:{at:500},total:510},60),null);
});
