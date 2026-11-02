import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {build} from 'esbuild';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Vector3} from 'three';
import {cockpitSpeedAt,cockpitBlurSamples} from '../src/gp/car-cockpit.js';
test('new driver shots gain temporal supersampling while all exterior and historical settings are preserved',()=>{
 assert.equal(cockpitBlurSamples(2,'cockpit','race-seat-v2'),8);
 assert.equal(cockpitBlurSamples(16,'cockpit','race-seat-v2'),16);
 assert.equal(cockpitBlurSamples(2,'lead','race-seat-v2'),2);
 assert.equal(cockpitBlurSamples(2,'cockpit',undefined),2);
});
test('driver gaze velocity interpolates continuously while retaining each original integer-frame speed',()=>{
 const frames=[[[0,0,0]],[[1,0,0]],[[3,0,0]],[[6,0,0]]];
 assert.equal(cockpitSpeedAt(frames,0,0,60),60);assert.equal(cockpitSpeedAt(frames,0,1,60),120);
 assert.equal(cockpitSpeedAt(frames,0,.5,60),90);
 assert.ok(Math.abs(cockpitSpeedAt(frames,0,1-1e-6,60)-cockpitSpeedAt(frames,0,1+1e-6,60))<.001);
});
const fixture='out/tcr/track-review/colombia-heat1-andes-v11-seed55/race.json';
test('all three real Colombia cockpit clips have continuous fractional-frame gaze',{skip:!existsSync(fixture)},async()=>{
 const file=resolve('out/tcr',`.cockpit-continuity-${randomUUID()}.mjs`);
 const result=await build({entryPoints:['src/gp/race.ts'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});
 writeFileSync(file,result.outputFiles[0].text);
 try{
  const{buildRace}=await import(pathToFileURL(file).href),d=JSON.parse(readFileSync(fixture)),race=buildRace(d);
  let maximumBoundaryJump=0;
  for(const shot of d.shots.filter(s=>s.kind==='cockpit'))for(let f=shot.start+1;f<shot.end-1;f++){
   const a=race.shotAt(f-.00001),b=race.shotAt(f+.00001);
   const angle=new Vector3(...a.target).sub(new Vector3(...a.pos)).normalize().angleTo(new Vector3(...b.target).sub(new Vector3(...b.pos)).normalize())*180/Math.PI;
   maximumBoundaryJump=Math.max(maximumBoundaryJump,angle);
   assert.ok(angle<.002,`Cockpit jumps at actual frame${f}: ${angle}degrees`);
   assert.ok(new Vector3(...a.pos).distanceTo(new Vector3(...b.pos))<.0001,'camera remains attached to interpolated chassis');
  }
  console.log(JSON.stringify({maximumBoundaryJumpDegrees:maximumBoundaryJump,previousWorstDegrees:.18753469175124715}));
 }finally{unlinkSync(file);}
});
