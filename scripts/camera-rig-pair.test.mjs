import test from 'node:test';import assert from 'node:assert/strict';
import {clearCameraBoundary,clearCameraRigPair} from './race-director.mjs';
test('joint rigs resolve a blocked short shot that a boundary-only shift cannot',()=>{
 const isClear=(f,r)=>r===0?f<3126:r===1?f>=3135:f>=3126;
 const args={start:3065,boundary:3147,end:3229,minFrames:45,maxShift:30};
 assert.equal(clearCameraBoundary({...args,leftClear:f=>isClear(f,0),rightClear:f=>isClear(f,1)}),null);
 const pair=clearCameraRigPair({...args,rigCount:3,isClear});assert.deepEqual(pair,{cut:3126,left:0,right:2});
 for(let f=args.start;f<args.end;f++)assert.ok(isClear(f,f<pair.cut?pair.left:pair.right));
});
test('cannot conceal obstruction by a one-frame rescue or a long cut shift',()=>{
 const args={start:0,boundary:45,end:90,minFrames:45,maxShift:30,rigCount:2};
 assert.equal(clearCameraRigPair({...args,isClear:(f,r)=>r===0?f<44:f>=44}),null);
 assert.equal(clearCameraRigPair({...args,isClear:()=>false}),null);
});
