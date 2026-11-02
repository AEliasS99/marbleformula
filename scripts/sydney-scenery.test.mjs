import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector3} from 'three';
import {sydneyScenery,sydneyGeometry} from '../src/gp/sydney-scenery.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
const samples=Array.from({length:121},(_,i)=>({u:i,p:[i-60,40-i*.25,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1}));
test('Sydney yachts have ground-connected cradles at every track elevation',()=>{
 const scene=sydneyScenery(samples),pads=scene.parts.filter(p=>p.category==='sydney-boatyard-pad'),hulls=scene.parts.filter(p=>p.category==='sydney-yacht-hull'),supports=scene.parts.filter(p=>p.category==='sydney-yacht-cradle');
 assert.ok(hulls.length>10);assert.equal(pads.length,hulls.length);assert.equal(supports.length,hulls.length*2);
 const bounds=p=>{const g=sydneyGeometry(p).applyMatrix4(new Matrix4().fromArray(p.matrix));g.computeBoundingBox();const b=g.boundingBox.clone();g.dispose();return b;};
 hulls.forEach((h,i)=>{const pad=bounds(pads[i]),hull=bounds(h);assert.ok(Math.abs(pad.min.y-scene.groundY)<1e-5);for(const support of supports.slice(2*i,2*i+2)){const b=bounds(support);assert.ok(Math.abs(b.min.y-pad.max.y)<1e-5);assert.ok(Math.abs(b.max.y-hull.min.y)<1e-5);}});
});
test('camera occlusion uses actual Sydney opaque parts without filling bridge openings',()=>{
 const {parts}=sydneyScenery(samples),model=createCameraOcclusion({samples,themeId:'sydney'}),arch=parts.find(p=>p.category==='sydney-bridge-arch'),m=new Matrix4().fromArray(arch.matrix);
 const ray=(x,y)=>[-1,1].map(z=>new Vector3(x,y,z).applyMatrix4(m).toArray());
 assert.equal(model.blocks(...ray(0,12)),true,'steel crown is an occluder');
 assert.equal(model.blocks(...ray(0,7)),false,'air below the arch must remain open');
 const hull=parts.find(p=>p.category==='sydney-yacht-hull'),hm=new Matrix4().fromArray(hull.matrix);
 assert.equal(model.blocks(...[-5,5].map(x=>new Vector3(x,0,0).applyMatrix4(hm).toArray())),true);
});
test('every Sydney bridge pylon reaches the ground beneath its own footprint',()=>{
 const {parts,groundY}=sydneyScenery(samples),pylons=parts.filter(p=>p.category==='sydney-bridge-pylon');assert.ok(pylons.length>10);
 for(const p of pylons){const g=sydneyGeometry(p).applyMatrix4(new Matrix4().fromArray(p.matrix));g.computeBoundingBox();assert.ok(Math.abs(g.boundingBox.min.y-groundY)<1e-5);g.dispose();}
});
