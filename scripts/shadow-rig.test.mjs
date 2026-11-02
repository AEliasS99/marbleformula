import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {stableShadowRig,SHADOW_SPAN,SHADOW_MAP_SIZE} from '../src/gp/shadow-rig.js';

test('shadow projection is independent of previous seeks and camera distance',()=>{
 const target=[23.17,-12.34,58.91];
 for(const night of [true,false]){
  const expected=stableShadowRig(target,night);
  for(const other of [[0,0,0],[250,300,-400],[-50,-8,92]]){
   stableShadowRig(other,night);assert.deepEqual(stableShadowRig(target,night),expected);
  }
  assert.equal(expected.span,SHADOW_SPAN);
  assert.ok(new Vector3(...expected.target).distanceTo(new Vector3(...target))<=Math.SQRT2*SHADOW_SPAN/SHADOW_MAP_SIZE+1e-10);
  const offset=new Vector3(...expected.position).sub(new Vector3(...expected.target));
  assert.ok(offset.distanceTo(new Vector3(...(night?[8,40,10]:[30,21,14])))<1e-10);
 }
});
test('small subpixel movements do not continuously shift the shadow texels',()=>{
 for(const night of [true,false]){
  const rig=stableShadowRig([0,0,0],night),offset=new Vector3(...rig.position).sub(new Vector3(...rig.target)).normalize();
  const right=new Vector3(0,1,0).cross(offset).normalize();
  const tiny=right.multiplyScalar(SHADOW_SPAN/SHADOW_MAP_SIZE*.2);
  const moved=stableShadowRig(tiny.toArray(),night);
  assert.ok(new Vector3(...moved.target).length()<1e-10);
 }
});
