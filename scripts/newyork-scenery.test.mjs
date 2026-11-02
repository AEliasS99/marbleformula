import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector3} from 'three';
import {newYorkScenery} from '../src/gp/newyork-scenery.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
const samples=Array.from({length:121},(_,i)=>({u:i,p:[i-60,40-i*.25,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1}));
test('New York camera rays cannot pass through authored towers, setbacks, spires or LED billboards',()=>{
 const buildings=newYorkScenery(samples),occlusion=createCameraOcclusion({samples,themeId:'newyork'});
 assert.ok(buildings.length>10);
 assert.equal(occlusion.counts['newyork-tower'],buildings.length);
 for(const b of buildings){
  const m=new Matrix4().makeRotationY(b.rotY).setPosition(b.x,b.groundY,b.z);
  for(const p of b.parts){
   const ray=[-1,1].map(sign=>new Vector3(p.pos[0],p.pos[1],p.pos[2]+sign*(b.w+2)).applyMatrix4(m).toArray());
   assert.ok(occlusion.blocks(...ray),p.category);
  }
 }
});
