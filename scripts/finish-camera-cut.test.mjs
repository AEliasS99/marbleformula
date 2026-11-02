import test from 'node:test';import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {build} from 'esbuild';import {randomUUID} from 'node:crypto';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const fixture=new URL('../out/tcr/track-review/spain-heat1-costa-v5-seed43/race.json',import.meta.url);
test('finish camera jump is a hard cut for both motion-blur subframes',{skip:!existsSync(fixture)},async()=>{
 const file=resolve('out/tcr',`.finish-camera-${randomUUID()}.mjs`);
 const result=await build({entryPoints:['src/gp/race.ts'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});writeFileSync(file,result.outputFiles[0].text);
 try{
  const {buildRace}=await import(pathToFileURL(file).href),data=JSON.parse(readFileSync(fixture)),race=buildRace(data),f=Math.min(...data.marbles.map(m=>m.finishFrame).filter(Number.isFinite));
  assert.ok(Math.hypot(...data.cams[f].slice(0,3).map((x,i)=>x-data.cams[f-1][i]))>10,'Fixture must retain the real finish jump');
  const before=race.shotAt(f-.0875),after=race.shotAt(f+.0875);
  assert.ok(Math.hypot(...before.pos.map((x,i)=>x-data.cams[f][i]))<.001);
  assert.ok(Math.hypot(...before.pos.map((x,i)=>x-after.pos[i]))<.1,'Subframes must use the same finish rig');
 }finally{unlinkSync(file);}
});

const lensFixture=new URL('../out/tcr/alps-review/alps-heat2-turbo-v17-seed42/race.json',import.meta.url);
test('finish fallback lens jump does not double-expose either neighbouring frame',{skip:!existsSync(lensFixture)},async()=>{
 const file=resolve('out/tcr',`.finish-lens-${randomUUID()}.mjs`);
 const result=await build({entryPoints:['src/gp/race.ts'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});writeFileSync(file,result.outputFiles[0].text);
 try{
  const {buildRace}=await import(pathToFileURL(file).href),data=JSON.parse(readFileSync(lensFixture)),race=buildRace(data),f=Math.min(...data.marbles.map(m=>m.finishFrame).filter(Number.isFinite));
  assert.equal(data.cams[f][6]-data.cams[f-1][6],21,'Retain actual 55 to76 degree lens jump');
  assert.ok(Math.hypot(...data.cams[f].slice(0,3).map((x,i)=>x-data.cams[f-1][i]))<.1,'Position is continuous; position-only cut detection misses this');
  for(const frame of [f-1,f]){
   const before=race.shotAt(frame-.0875),after=race.shotAt(frame+.0875);
   assert.ok(Math.abs(before.fov-after.fov)<1,`No optical double exposure at ${frame}`);
   assert.ok(Math.abs(before.fov-data.cams[frame][6])<1);
   assert.ok(Math.abs(after.fov-data.cams[frame][6])<1);
  }
  const frame=f+2;assert.notEqual(race.shotAt(frame-.0875).fov,race.shotAt(frame+.0875).fov,'Keep continuous interpolation for ordinary gradual lens recovery');
 }finally{unlinkSync(file);}
});
