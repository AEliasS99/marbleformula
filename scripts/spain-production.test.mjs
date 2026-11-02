import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {Box3,Matrix4,Vector3} from 'three';
import {CIRCUITS} from '../src/gp/circuits/index.js';
import {productionLocation,productionReviewIdentity} from '../src/gp/production-locations.js';
import {spainAction} from '../src/gp/circuits/spain-action.js';
import {spanishScenery,SPAIN_MATERIALS} from '../src/gp/spain-scenery.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
import {buildSpainMeshes} from '../src/gp/spain-mesh.js';
const path=new URL('../out/tcr/spain-course-geometry.json',import.meta.url);
const fixture=existsSync(path)?JSON.parse(readFileSync(path)):null;

test('Spanish exhibition extends the production registry without changing the official five rounds',()=>{
  assert.equal(CIRCUITS.length,5);assert.ok(!CIRCUITS.some(c=>c.id==='r6-barcelona'));
  const place=productionLocation('spain');assert.equal(place.round.country,'Spain');assert.equal(place.round.id,'r6-barcelona');
  assert.equal(productionReviewIdentity('spain',1,'costa-v1',43).composition,'Spain-Race-4k');
});
test('merged Spanish village/rock geometry has complete finite render attributes',()=>{
  const samples=fixture?.samples??Array.from({length:81},(_,i)=>({u:i*.5,p:[i*.5,-i*.1,0],r:[0,0,1],n:[0,1,0],t:[1,0,0],w:2.1}));
  const meshes=buildSpainMeshes(samples);
  assert.ok(meshes.length>6&&meshes.length<20);
  for(const {geometry:g}of meshes){assert.ok(g.boundingSphere&&Number.isFinite(g.boundingSphere.radius));for(const name of ['position','normal','uv'])assert.ok(g.getAttribute(name).array.every(Number.isFinite));assert.equal(g.getAttribute('uv').count,g.getAttribute('position').count);g.dispose();}
});
test('the real Spanish action layout has reproducible route choices, separated attack lanes and safe finish space',{skip:!fixture},()=>{
  const base=productionLocation('spain').round,before=JSON.stringify(base),v=spainAction(base,fixture),{gates,lanes,patches}=v.carChallenges;
  assert.equal(v.outline,base.outline);assert.equal(JSON.stringify(base),before);assert.deepEqual(v,spainAction(base,fixture));
  assert.ok(gates.length>=8&&lanes.length>=8&&patches.length===2);
  assert.ok(gates.some(g=>g.lat===0)&&gates.some(g=>g.lat<0)&&gates.some(g=>g.lat>0));
  for(const g of gates)assert.ok(g.u>24&&g.u<fixture.uFinish-40);
  for(const l of lanes)assert.ok(!gates.some(g=>l.u<g.u+g.length/2+2&&l.u+l.length>g.u-g.length/2-2));
  for(const p of patches)assert.ok(Math.abs(p.lat)>p.halfWidth,'A dry alternative must stay available');
});
test('Spanish opaque camera geometry exactly shares the render recipe and keeps the road clear',{skip:!fixture},()=>{
  const scene=spanishScenery(fixture.samples),model=createCameraOcclusion({samples:fixture.samples,themeId:'spain'});
  assert.ok(scene.groups.length>40&&scene.parts.length>2000);
  assert.equal(model.boxes.length,scene.parts.length);
  for(const p of scene.parts){assert.ok(SPAIN_MATERIALS[p.material]);assert.ok(p.matrix.every(Number.isFinite));}
  for(const category of ['spain-building','spain-roof','spain-palm','spain-flag','spain-olive','spain-market'])assert.ok(model.counts[category]>0);
  assert.equal(model.counts['spain-sea'],undefined);
  assert.equal(scene.parts.filter(p=>p.category==='spain-mountain').length,22);
  // A car-height centre line cannot pass through the new decorative assets.
  for(const s of fixture.samples){const p=new Vector3(...s.p).addScaledVector(new Vector3(...s.n),.35);assert.ok(model.clearance(p)>.35,`Scenery crosses road at ${s.u}`);}
  const p=scene.parts.find(p=>p.category==='spain-building'),m=new Matrix4().fromArray(p.matrix);
  const a=new Vector3(0,0,-p.size[2]).applyMatrix4(m),b=new Vector3(0,0,p.size[2]).applyMatrix4(m);
  assert.ok(model.blocks(a,b));
});
