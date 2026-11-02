import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,validateRenderSnapshot} from './render-contract.mjs';
import {sampleReplay} from './public/replay.js';
test('render provenance rejects stale designs, stale engines, damaged snapshots and failed racers',()=>{
 const input={project:{id:'project',revision:1},sourceHash:'source',settings:{duration:30}};input.hash=digest(JSON.stringify(input));
 const frame=t=>({t,racers:Array.from({length:6},()=>[0,0,t,0,0,0,1]),fixtures:[],wheels:Array.from({length:6},()=>[[0,t,.2]]),telemetry:Array.from({length:6},()=>({u:t,speed:1}))});
 const result={mode:'cars',sourceHash:'source',snapshotHash:input.hash,projectId:'project',revision:1,participants:Array.from({length:6},(_,i)=>({id:String(i)})),gates:[{quota:5},{quota:4},{quota:3}],standings:Array.from({length:6},()=>({status:'finished'})),duration:1,frames:[frame(0),frame(1)]};
 const job={status:'complete',sourceHash:'source',snapshotHash:input.hash,etag:'etag'};const args={job,input,result,currentSourceHash:'source',projectEtag:'etag'};
 assert.equal(validateRenderSnapshot(args).frames,360);
 assert.throws(()=>validateRenderSnapshot({...args,projectEtag:'edited'}),/design changed/);
 assert.throws(()=>validateRenderSnapshot({...args,currentSourceHash:'new-engine'}),/Physics changed/);
 assert.throws(()=>validateRenderSnapshot({...args,input:{...input,settings:{duration:60}}}),/integrity/);
 assert.throws(()=>validateRenderSnapshot({...args,result:{...result,standings:result.standings.map(s=>({...s,status:'stuck'}))}}),/failed/);
 assert.throws(()=>validateRenderSnapshot({...args,result:{...result,gates:[]}}),/three/);
});
test('editor and renderer sampling preserves exact frames, quaternion interpolation and final partial step',()=>{
 const f=(t,z,q,w)=>({t,racers:[[0,0,z,...q]],fixtures:[],wheels:[[[.2,w,.15]]],telemetry:[{u:z,speed:10}]});
 const r={duration:.05,frames:[f(0,0,[0,0,0,1],0),f(1/30,1,[0,Math.sin(.2),0,Math.cos(.2)],1),f(.05,1.5,[0,Math.sin(.3),0,Math.cos(.3)],1.5)]};
 const mid=sampleReplay(r,1/60);assert.equal(mid.racers[0][2],.5);assert.ok(Math.abs(mid.racers[0][4]-Math.sin(.1))<1e-10);assert.equal(mid.wheels[0][0][1],.5);
 assert.deepEqual(sampleReplay(r,.05).racers,r.frames[2].racers);assert.deepEqual(sampleReplay(r,100).racers,r.frames[2].racers);assert.equal(sampleReplay(r,-1).time,0);
});
