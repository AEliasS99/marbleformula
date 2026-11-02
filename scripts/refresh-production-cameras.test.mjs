import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {cameraRandom} from './race-director.mjs';
import {refreshProductionCameras,nonCameraHash} from './refresh-production-cameras.mjs';
import {PerspectiveCamera,Vector3} from 'three';

test('camera random choices depend only on camera seed and circuit',()=>{
  const draws=(seed,id)=>{const rand=cameraRandom(seed,id);return Array.from({length:100},rand);};
  assert.deepEqual(draws(17,'r1-monaco'),draws(17,'r1-monaco'));
  assert.notDeepEqual(draws(17,'r1-monaco'),draws(18,'r1-monaco'));
  assert.notDeepEqual(draws(17,'r1-monaco'),draws(17,'r2-silverstone'));
});

const path=new URL('../out/tcr/alps-review/alps-heat1-evolution-seed17/race.json',import.meta.url);
test('seed17 post-smoothing repair preserves physics and continuous shots',{skip:!existsSync(path)},async()=>{
  const original=JSON.parse(readFileSync(path)),hash=nonCameraHash(original);
  const updated=await refreshProductionCameras(original);
  assert.equal(nonCameraHash(updated),hash);
  assert.deepEqual(updated.cameraAudit.unresolvedFramingFrames,[]);
  assert.deepEqual(updated.cameraAudit.unresolvedOcclusionFrames,[]);
  assert.equal(updated.cams.length,original.frames.length);
  // These production stills previously cropped P1's nose and the close chaser.
  for(const f of [974,2400]){
    const c=updated.cams[f],lens=new PerspectiveCamera(c[6],16/9,.05,1500);
    lens.position.set(...c.slice(0,3));lens.lookAt(...c.slice(3,6));lens.updateMatrixWorld();
    const duel=updated.marbles.map((m,i)=>({m,i,u:updated.frames[f][i][7]})).filter(({m})=>(m.finishFrame==null||m.finishFrame>f)&&(m.dqFrame==null||m.dqFrame>f)).sort((a,b)=>b.u-a.u).slice(0,2);
    for(const {i} of duel){
      const p=new Vector3(...updated.frames[f][i].slice(0,3));
      assert.ok(lens.position.distanceTo(p)>=3.49,`Car too close at frame${f}`);
      for(const x of [-1,1])for(const y of [-.5,.5])for(const z of [-1,1]){
        const q=p.clone().add(new Vector3(x,y,z)).project(lens);
        assert.ok(q.z>-1&&q.z<1&&Math.abs(q.x)<.8&&Math.abs(q.y)<.78,`Cropped duel body at frame${f}, car${i}`);
      }
    }
  }
  const cuts=new Set(updated.shots.map(s=>s.start));
  for(let f=1;f<updated.cams.length;f++){
    if(cuts.has(f))continue;
    const step=Math.hypot(...updated.cams[f].slice(0,3).map((v,i)=>v-updated.cams[f-1][i]));
    assert.ok(step<=1,`Camera moved ${step}m within a shot at frame${f}`);
  }
});
