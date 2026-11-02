import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCameraOcclusion,carBodyVisible} from '../src/gp/camera-occlusion.js';
test('a clear centre ray is insufficient when a checkpoint hides the rear of a car',()=>{
 const samples=Array.from({length:81},(_,i)=>({u:i*.5,p:[i*.5-20,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1}));
 const geometry=createCameraOcclusion({samples,checkpoints:[{u:20,index:1}]});
 const target=[.5,.3,0],above=[.5,8,0];
 assert.equal(geometry.blocks(above,target),false);
 assert.equal(carBodyVisible(geometry,above,target),false);
 assert.equal(carBodyVisible(geometry,[4,1.1,0],target),true);
});
test('low continuous rig clears the real sloping Tokyo checkpoint for leader and chaser',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./checkpoint-low-camera-fixture.json',import.meta.url)));
 const geometry=createCameraOcclusion(fixture);
 for(const frame of fixture.frames){
  assert.ok(frame.subjects.some(p=>!carBodyVisible(geometry,frame.before,p)),`old shot at ${frame.frame} must reproduce obstruction`);
  assert.ok(frame.subjects.every(p=>carBodyVisible(geometry,frame.after,p)),`repaired shot at ${frame.frame} must show both cars`);
 }
});
