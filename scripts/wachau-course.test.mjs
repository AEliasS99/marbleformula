import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import round from '../src/gp/circuits/r12-wachau.js';
import {CIRCUITS} from '../src/gp/circuits/index.js';
import {findCrossings} from './circuit.mjs';

const sources=['src/gp/circuits/r12-wachau.js','scripts/season.mjs','scripts/circuit.mjs'];
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
test('Wachau has a separated single-pass route, full obstacle variety and a straight finish with runoff',async()=>{
 // Reuse only an explicitly supplied, source-matching geometry inspection.
 // Without it this test builds the actual course, without simulating a race.
 const evidence=process.env.WACHAU_GEOMETRY_EVIDENCE;
 let c;
 if(evidence){
  c=JSON.parse(fs.readFileSync(evidence));
  for(const p of sources)assert.equal(c.sourceHashes?.[p],hash(p),'Stale geometry: '+p);
  assert.equal(c.id,round.id);
 }else{
  process.env.GP_CARS='0';process.env.GP_LAPS='1';
  process.env.GP_MARBLE_PHYSICS='contact-flow-v3';
  const {buildCourse}=await import('./season.mjs');c=buildCourse(round);
 }
 assert.equal(CIRCUITS.length,5);assert.ok(!CIRCUITS.some(r=>r.id===round.id));
 assert.equal(findCrossings(round.outline).length,0);
 assert.ok(c.L>1900&&c.L<2100,'A real long route rather than repeated laps');
 assert.equal(c.elevators.length,0);assert.ok(!c.features.some(f=>f.type==='elevator'));
 assert.ok(c.samples.every(s=>[...s.p,...s.t,...s.r,...s.n,s.u,s.w,s.curv].every(Number.isFinite)));
 assert.ok(c.samples.some(s=>s.curv>.01)&&c.samples.some(s=>s.curv<-.01));
 const maxInnerRatio=Math.max(...c.samples.map(s=>s.w*Math.abs(s.curv)));
 assert.ok(maxInnerRatio<.8,'Inside road edge approaches a curvature fold');
 const finish=c.samples.filter(s=>s.u>=c.uFinish-25);
 assert.ok(finish.length>80&&finish.every(s=>Math.abs(s.curv)<.005),'Finish approach and runoff must be straight');
 assert.ok(c.END-c.uFinish>=19.999,'Twenty metre physical runoff');
 const sparse=c.samples.filter((_,i)=>i%2===0);let closest=Infinity,closestPair;
 for(let i=0;i<sparse.length;i++)for(let j=i+1;j<sparse.length;j++){
  const a=sparse[i],b=sparse[j],arc=Math.abs(a.u-b.u);
  if(Math.min(arc,c.L-arc)<65)continue;
  const distance=Math.hypot(a.p[0]-b.p[0],a.p[2]-b.p[2]);
  if(distance<closest){closest=distance;closestPair=[a.u,b.u];}
 }
 const maxHalfWidth=Math.max(...c.samples.map(s=>s.w));
 assert.ok(closest>2*maxHalfWidth+6,'Unrelated road branches need room for barriers and scenery');
 for(const type of new Set(round.layout.map(([type])=>type)))assert.ok(c.features.some(f=>f.type===type),'Missing '+type);
 const splitters=c.features.filter(f=>f.type==='splitter').map(f=>f.u);
 assert.ok(splitters.some(u=>u<c.uFinish/3)&&splitters.some(u=>u>2*c.uFinish/3),'Physical passing choices along the route');
 const checkpointZones=[.28,.54,.78].map(fraction=>{
  const target=c.uFinish*fraction;
  const available=c.samples.filter(s=>Math.abs(s.u-target)<35&&Math.abs(s.curv)<.035&&
   c.features.every(f=>s.u<f.u-f.span[0]-8||s.u>f.u+f.span[1]+8));
  assert.ok(available.length,'No clear zone for checkpoint '+fraction);
  return {fraction,target,availableSamples:available.length};
 });
 if(evidence)fs.writeFileSync(dirname(evidence)+'/audit.json',JSON.stringify({
  createdAt:new Date().toISOString(),status:'geometry-checks-passed-not-physics-or-native-approved',
  seed:69,laps:1,length:c.L,finish:c.uFinish,height:c.H,startShift:c.startShift,
  sampleCount:c.samples.length,featureCount:c.features.length,
  featureTypes:[...new Set(c.features.map(f=>f.type))],crossings:0,
  minimumNonNeighbourDistance:closest,closestPair,maxHalfWidth,maxInnerRatio,
  finishMaxCurvature:Math.max(...finish.map(s=>Math.abs(s.curv))),
  splitters,checkpointZones,elevators:0,officialCircuitsUntouched:true,
  sourceHashes:Object.fromEntries(sources.map(p=>[p,hash(p)])),geometrySHA256:hash(evidence),
  pending:['regional scenery and terrain','renderer and camera integration','native visual inspection','fixed seed69 physics bake','full 4K60 export and checks'],
 },null,2)+'\n');
});
