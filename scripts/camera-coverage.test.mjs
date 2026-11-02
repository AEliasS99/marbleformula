import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraRigOrder,clearCameraRigPair,trackingShotCycle} from './race-director.mjs';

test('car coverage gives both front and rear cameras regular turns, including battles',()=>{
 for(const battle of [false,true]){
  const cycle=trackingShotCycle('car',battle);
  assert.ok(cycle.filter(k=>['lead','chase'].includes(k)).length/cycle.length>=2/3);
  assert.ok(cycle.filter(k=>k==='lead').length>=2);
  assert.ok(cycle.filter(k=>k==='chase').length>=2);
  assert.ok(cycle.includes('top')&&cycle.includes('side'));
 }
 assert.deepEqual(trackingShotCycle('marble'),['wide','lead','side','chase','top','lead','orbit','side']);
});
test('fallbacks retain the requested viewing direction; blocked rigs still lose',()=>{
 const rigs=[{height:8,side:0,back:-6},{height:1.6,side:0,back:9,surface:true},{height:1.6,side:0,back:-9,surface:true}];
 const front=cameraRigOrder(rigs,'lead','car'),rear=cameraRigOrder(rigs,'chase','car');
 assert.equal(front[0],1);assert.equal(rear[0],2);
 assert.deepEqual(cameraRigOrder(rigs,'finish','car'),[0,1,2]);
 const pair=clearCameraRigPair({start:0,boundary:60,end:120,minFrames:45,maxShift:0,rigCount:3,leftOrder:front,rightOrder:rear,isClear:(f,r)=>r!==1});
 assert.equal(pair.left,0,'an unsafe front rig cannot be forced into the edit');assert.equal(pair.right,2);
});
