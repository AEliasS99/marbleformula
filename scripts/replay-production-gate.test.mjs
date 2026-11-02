import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {build} from 'esbuild';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {replayOcclusion,auditReplay} from './prepare-replay-camera.mjs';
const base='out/tcr/track-review/colombia-heat2-andes-v12-seed56';
test('the real Colombia gantry regression fails the old replay and clears the corrected full-body replay',{skip:!existsSync(base+'/replay-camera.json'),timeout:120000},async()=>{
 const file=resolve('out/tcr',`.replay-gate-test-${randomUUID()}.mjs`);
 const compiled=await build({entryPoints:[base+'/source-replay-v3/gp/race.ts'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});
 writeFileSync(file,compiled.outputFiles[0].text);
 try{
  const {buildRace}=await import(pathToFileURL(file).href),d=JSON.parse(readFileSync(base+'/race.json')),rig=JSON.parse(readFileSync(base+'/replay-camera.json'));
  const {model}=replayOcclusion(d),before=buildRace(d),after=buildRace({...d,replayCamera:rig});
  const old=auditReplay(d,before,model),corrected=auditReplay(d,after,model);
  assert.ok(old.blockedOrOutOfFrame>0,'retain the actual failure that technical decode missed');
  assert.equal(corrected.blockedOrOutOfFrame,0);assert.equal(corrected.passed,true);
  assert.equal(corrected.replaySamples,(d.timeline.results.at-d.timeline.replay.at)*5);
  let unchanged=0;
  for(let f=0;f<d.timeline.total;f++){
   if(f>=d.timeline.replay.at&&f<d.timeline.results.at)continue;
   assert.deepEqual(after.shotAt(f),before.shotAt(f));unchanged++;
  }
  console.log(JSON.stringify({oldBlockedSamples:old.blockedOrOutOfFrame,correctedSamples:corrected.replaySamples,unchangedNonReplayFrames:unchanged}));
 }finally{unlinkSync(file);}
});
