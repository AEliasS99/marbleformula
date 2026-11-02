import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector3} from 'three';
import france from '../src/gp/circuits/r11-provence.js';
import {CIRCUITS} from '../src/gp/circuits/index.js';
import {worldRushRound,worldRushAction} from '../src/gp/circuits/world-rush.js';
import {frenchScenery,FRANCE_MATERIALS} from '../src/gp/france-scenery.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
import {italianTerrain as regionalTerrain} from '../src/gp/italy-terrain.js';
import {buildSceneryMeshes} from '../src/gp/scenery-mesh.js';
import {findCrossings} from './circuit.mjs';
import {replayOcclusion} from './prepare-replay-camera.mjs';
process.env.GP_CARS='1';
const {buildCourse}=await import('./season.mjs');
const road=worldRushRound(france),course=buildCourse(road),round=worldRushAction(road,course);

test('new grand-tour outline is long and separate from official courses with separate flowing routes',()=>{
 assert.equal(CIRCUITS.length,5);assert.ok(!CIRCUITS.some(c=>c.id===france.id));
 assert.ok(course.L>4500&&course.L<6500,'long single tour rather than repeating laps');
 assert.equal(findCrossings(france.outline).length,0,'no crossing or stacked roads');
 assert.ok(course.samples.some(s=>s.curv>.006)&&course.samples.some(s=>s.curv<-.006));
 const sparse=course.samples.filter((_,i)=>i%12===0);let closest=Infinity;
 for(let i=0;i<sparse.length;i++)for(let j=i+1;j<sparse.length;j++){
  const a=sparse[i],b=sparse[j],arc=Math.abs(a.u-b.u);if(Math.min(arc,course.L-arc)<65)continue;
  closest=Math.min(closest,Math.hypot(a.p[0]-b.p[0],a.p[2]-b.p[2]));
 }
 assert.ok(closest>18,'non-neighbouring road branches lack separation: '+closest);
});
test('longer racing has distributed physical passing choices, not repeated laps or slower cars',()=>{
 const c=round.carChallenges;assert.equal(c.patches.length,8);assert.ok(c.lanes.length>=16);
 for(const p of c.patches){assert.ok(p.u0>50&&p.u1<course.uFinish-100);assert.ok(Math.abs(p.lat)+p.halfWidth<3.2);}
 for(const l of c.lanes){
  if(l.risk==='water-exit'){
   const pond=c.patches.find(p=>Math.abs(l.u+l.length+8-p.u0)<.01);assert.ok(pond,'wet-exit nitro must actually lead to its declared water choice');
   assert.ok(course.samples.filter(s=>s.u>=l.u-10&&s.u<=pond.u1+45).every(s=>Math.abs(s.curv)<.014),'no risk lane into a blind sharp bend');
   continue;
  }
  assert.ok(c.patches.every(p=>l.u+l.length<p.u0-45||l.u>p.u1+35));
  assert.ok(course.samples.filter(s=>s.u>=l.u-4&&s.u<=l.u+l.length+22).every(s=>Math.abs(s.curv)<.012));
 }
 assert.ok(c.lanes.some(l=>l.u<course.uFinish*.2)&&c.lanes.some(l=>l.u>course.uFinish*.8));
});
test('Provence scenery and grounded terrain share exact geometry with the camera model',()=>{
 const recipe=frenchScenery(course.samples),terrain=regionalTerrain(course.samples),model=createCameraOcclusion({samples:course.samples,themeId:'france'});
 assert.ok(recipe.groups.length>8);
 for(const category of ['france-building','france-olive-crown','france-windmill','france-lavender-flower','france-viaduct-pier','france-viaduct-cap']){
  const parts=recipe.parts.filter(p=>p.category===category);assert.ok(parts.length,category);
  assert.equal(model.counts[category],parts.length,'camera omitted '+category);
  const p=parts[0],m=new Matrix4().fromArray(p.matrix),ray=[-1,1].map(s=>new Vector3(0,0,s*15).applyMatrix4(m).toArray());assert.ok(model.blocks(...ray));
 }
 for(const s of course.samples)assert.ok(terrain.heightAt(s.p[0],s.p[2])<s.p[1]-.7);
 const meshes=buildSceneryMeshes(recipe.parts,FRANCE_MATERIALS);assert.ok(meshes.length>8);for(const m of meshes){assert.ok(m.material);m.geometry.dispose();}
});

test('saved France replay uses the same regional scenery as the live cameras',()=>{
 const {model}=replayOcclusion({id:france.id,samples:course.samples,info:{finish:course.uFinish},checkpoints:[]});
 const expected=frenchScenery(course.samples);
 for(const category of ['france-building','france-windmill','france-olive-crown','france-lavender-flower'])assert.equal(model.counts[category],expected.parts.filter(p=>p.category===category).length,category);
});
