import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createCameraOcclusion,carBodyVisible} from '../src/gp/camera-occlusion.js';
const fixture=JSON.parse(readFileSync(new URL('./spain-checkpoint-camera-fixture.json',import.meta.url)));
test('saved Spanish checkpoint body occlusions remain visible after continuous shot repair',()=>{
 const model=createCameraOcclusion({samples:fixture.samples,checkpoints:[fixture.checkpoint]});
 for(const f of fixture.frames){const point=f.pose.slice(0,3),q=f.pose.slice(3,7);assert.equal(carBodyVisible(model,f.oldCamera,point,q,f.style),false,`Expected old occlusion at ${f.f}`);assert.equal(carBodyVisible(model,f.newCamera,point,q,f.style),true,`Body hidden after repair at ${f.f}`);}
});
