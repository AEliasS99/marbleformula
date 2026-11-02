import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {Matrix4,Vector3} from 'three';
import {checkpointLayout,CHECKPOINT_BOARD_Y} from '../src/gp/checkpoint-layout.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
import {refreshProductionCameras,nonCameraHash} from './refresh-production-cameras.mjs';

test('checkpoint boards block rays and reserve near-camera space without blocking the road beneath',()=>{
  const samples=Array.from({length:41},(_,i)=>({u:i*.5,p:[i*.5,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1}));
  const checkpoints=[{u:10,index:1}],model=createCameraOcclusion({samples,checkpoints});
  const arch=checkpointLayout(samples,checkpoints)[0],m=new Matrix4().fromArray(arch.matrix);
  const world=(x,y,z)=>new Vector3(x,y,z).applyMatrix4(m).toArray();
  assert.equal(model.blockedBy(world(0,CHECKPOINT_BOARD_Y,-2),world(0,CHECKPOINT_BOARD_Y,2)),'checkpoint-board');
  assert.equal(model.blocks(world(0,.4,-2),world(0,.4,2)),false);
  assert.equal(model.clearance(world(0,CHECKPOINT_BOARD_Y,0)),0);
  assert.equal(model.counts['checkpoint-board'],1);
});

const path=new URL('../out/tcr/alps-review/alps-heat3-showcase-v7-seed33/race.json',import.meta.url);
test('exact seed33 frame2040 regression sees the checkpoint that hid the race',{skip:!existsSync(path)},()=>{
  const data=JSON.parse(readFileSync(path)),model=createCameraOcclusion({samples:data.samples,themeId:'alps',checkpoints:data.checkpoints});
  const f=2040,camera=data.cams[f].slice(0,3);
  const active=data.marbles.map((m,i)=>({m,i})).filter(({m})=>(m.finishFrame===null||m.finishFrame>f)&&(m.dqFrame===null||m.dqFrame>f));
  assert.ok(active.some(({i})=>model.blockedBy(camera,data.frames[f][i].slice(0,3))?.startsWith('checkpoint'))||model.clearance(camera)<.2);
});
test('camera-only repair resolves the real checkpoint regression and preserves all non-camera data',{skip:!existsSync(path)},async()=>{
  const data=JSON.parse(readFileSync(path)),before=nonCameraHash(data),updated=await refreshProductionCameras(data);
  assert.equal(nonCameraHash(updated),before);
  assert.deepEqual(updated.cameraAudit.unresolvedOcclusionFrames,[]);
  assert.deepEqual(updated.cameraAudit.unresolvedFramingFrames,[]);
  assert.equal(updated.cameraAudit.sceneryEnvelopes['checkpoint-board'],3);
});
