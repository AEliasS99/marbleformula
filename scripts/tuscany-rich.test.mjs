import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {italianScenery,ITALY_MATERIALS} from '../src/gp/italy-scenery.js';import {italianScenery as frozen} from '../out/tcr/marble-review/italy-marbles-race-first-seed67/source-reviewed-replay/gp/italy-scenery.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';import {buildSceneryMeshes} from '../src/gp/scenery-mesh.js';import {italianTerrain} from '../src/gp/italy-terrain.js';
const data=JSON.parse(fs.readFileSync('out/tcr/marble-review/italy-marbles-race-first-seed67/race.json')),legacy=italianScenery(data.samples),rich=italianScenery(data.samples,{profile:'tuscany-rich-v2'});
test('the accepted old Italy recipe is unchanged; enrichment is explicit and additive',()=>{assert.deepEqual(legacy,frozen(data.samples));const added=new Set(['italy-backdrop-ridge','italy-olive-trunk','italy-olive-crown','italy-near-stone-wall']);assert.deepEqual(rich.parts.filter(p=>!added.has(p.category)),legacy.parts);assert.ok(rich.parts.length>legacy.parts.length);});
test('near, middle and far Tuscan layers enter the actual merged mesh AND the identical camera geometry',()=>{
 const model=createCameraOcclusion({samples:data.samples,themeId:'italy',sceneryProfile:'tuscany-rich-v2'});
 for(const key of ['italy-backdrop-ridge','italy-olive-crown','italy-near-stone-wall']){const parts=rich.parts.filter(p=>p.category===key);assert.ok(parts.length,key);assert.equal(model.counts[key],parts.length,key);}
 const hills=rich.parts.filter(p=>p.category==='italy-backdrop-ridge');assert.ok(hills.length>=18);for(const p of hills)for(const s of data.samples)assert.ok(Math.hypot(s.p[0]-p.matrix[12],s.p[2]-p.matrix[14])>p.size[0]+(s.w??3.2),'backdrop must not cut through the existing road');
 const meshes=buildSceneryMeshes(rich.parts,ITALY_MATERIALS);assert.ok(meshes.every(m=>m.material&&[...m.geometry.getAttribute('position').array].every(Number.isFinite)));meshes.forEach(m=>m.geometry.dispose());
 const terrain=italianTerrain(data.samples);for(const p of rich.parts.filter(p=>p.category==='italy-olive-trunk'))assert.ok(Math.abs(p.matrix[13]-p.size[2]/2-terrain.heightAt(p.matrix[12],p.matrix[14]))<1e-5,'olive trunk must meet its own local ground');
 fs.writeFileSync('out/quality-correction-20261101/scenery-structure.json',JSON.stringify({legacyParts:legacy.parts.length,richParts:rich.parts.length,categories:model.counts,nativeVisualApproval:false},null,2));
});
