import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {marbleMotionReport} from './marble-motion-report.mjs';
import {marblePadAcceleration,marbleStationaryWindow} from '../src/gp/marble-physics.js';
import splitter from '../src/gp/obstacles/splitter.js';
import frozenSplitter from '../out/tcr/marble-review/italy-marbles-race-first-seed67/source-reviewed-replay/gp/obstacles/splitter.js';
import spinner from '../src/gp/obstacles/spinner.js';import turntable from '../src/gp/obstacles/turntable.js';
import frozenSpinner from '../out/tcr/marble-review/italy-marbles-race-first-seed67/source-reviewed-replay/gp/obstacles/spinner.js';
import frozenTurntable from '../out/tcr/marble-review/italy-marbles-race-first-seed67/source-reviewed-replay/gp/obstacles/turntable.js';
const italy=JSON.parse(fs.readFileSync('out/tcr/marble-review/italy-marbles-race-first-seed67/race.json'));
test('actual delivered Italy fails:96 measured teleports, even if the old check claims zero',()=>{
 const before=JSON.stringify(italy),r=marbleMotionReport(italy);assert.equal(r.recoveries,96);assert.equal(r.discontinuities.length,96);assert.equal(r.passed,false);
 const noCounter=marbleMotionReport({...italy,carDiagnostics:[]});assert.equal(noCounter.passed,false);assert.equal(noCounter.discontinuities.length,96);assert.equal(JSON.stringify(italy),before);
});
const pad={u0:10,u1:14,width:1.4,latCenter:1,target:16,accel:50};
const frame={u:12,p:[0,0,0],t:[1,0,0],r:[0,0,1],n:[0,1,0],w:2.1};
const args={pad,frame,position:[0,.35,1],velocity:[5,0,0],radius:.35,dt:1/120};
test('visible powered pads cannot accelerate flying or wrong-lane marbles, or overshoot their target',()=>{
 assert.equal(marblePadAcceleration(args),50);
 for(const position of [[0,1.2,1],[0,.35,-1],[0,-1,1]])assert.equal(marblePadAcceleration({...args,position}),0);
 assert.equal(marblePadAcceleration({...args,frame:{...frame,gap:true}}),0);
 assert.equal(marblePadAcceleration({...args,velocity:[5,3,0]}),0);
 const a=marblePadAcceleration({...args,velocity:[15.9,0,0]});assert.ok(a>0&&15.9+a*args.dt<=16);
 assert.equal(marblePadAcceleration({...args,velocity:[18,0,0]}),0);
 assert.equal(marblePadAcceleration({...args,frame:{...frame,u:9}}),0);
});
test('a complete vortex orbit with matching endpoints is not a stationary jam',()=>{
 const frames=Array.from({length:121},(_,i)=>[[Math.cos(i/120*Math.PI*2),0,Math.sin(i/120*Math.PI*2)]]);
 assert.equal(marbleStationaryWindow(frames,0,0,120,[1,0,0]),false);
 assert.equal(marbleStationaryWindow(Array.from({length:121},()=>[[1,0,0]]),0,0,120,[1,0,0]),true);
});
function recipe(module,f,profile){
 const cylinders=[],statics=[],out={boosters:[]},frameAt=u=>{const s=italy.samples.reduce((a,b)=>Math.abs(b.u-u)<Math.abs(a.u-u)?b:a);return {...s,u};};
 module.build(f,{frameAt,statics,out,physicsProfile:profile,cylinder:(kind,u,lat,radius,height,restitution,extra={})=>{const s=frameAt(u);cylinders.push({kind,u,lat,radius,height,restitution,...extra});}});
 return {cylinders,statics,out};
}
test('legacy splitters remain intact; every corrected hazard-side opening exceeds a marble diameter with margin',()=>{
 for(const f of italy.features.filter(x=>x.type==='splitter')){
  assert.deepEqual(recipe(splitter,f),recipe(frozenSplitter,f));
  const parts=recipe(splitter,f,'contact-flow-v2'),wall=parts.statics.find(x=>x.kind==='splitter'&&x.shape==='box');assert.ok(wall);
  const side=Math.round(f.u)%2===0?1:-1,wallEdge=-.18+wall.size[2]/2;
  assert.equal(parts.cylinders.filter(x=>x.kind==='bumper'||x.kind==='peg').length,3);
  for(const c of parts.cylinders.filter(x=>x.kind==='bumper'||x.kind==='peg')){
   assert.ok(c.lat*side-c.radius-wallEdge>.78);
   assert.ok(2.1-c.lat*side-c.radius>.78);
  }
 }
});
test('moving tips keep a full ball-width escape; existing default rotor recipes remain identical',()=>{
 for(const [type,current,frozen,key]of [['spinner',spinner,frozenSpinner,'spinners'],['turntable',turntable,frozenTurntable,'turntables']]){
  const f=italy.features.find(x=>x.type===type),frameAt=u=>({...italy.samples.find(s=>s.u>=u),u});
  const build=(module,physicsProfile)=>{const out={[key]:[]};module.build(f,{frameAt,out,sync:{},physicsProfile});return out[key][0];};
  assert.deepEqual(build(current),build(frozen));
  const corrected=build(current,'contact-flow-v2');
  if(type==='spinner')assert.ok(2.1-Math.hypot(corrected.size[2],corrected.hook)>.78);
  else assert.ok(2.1-Math.hypot(corrected.ribTo,corrected.ribWidth/2)>.78);
 }
});
