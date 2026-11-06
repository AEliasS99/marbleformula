import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Matrix4,Vector3} from 'three';
import {wachauLayout,wachauRiverDistance,WACHAU_PROFILE} from '../src/gp/wachau-layout.js';
import {wachauScenery,WACHAU_MATERIALS} from '../src/gp/wachau-scenery.js';
import {italianTerrain} from '../src/gp/italy-terrain.js';
import {buildSceneryMeshes} from '../src/gp/scenery-mesh.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
import {replayOcclusion} from './prepare-replay-camera.mjs';
import {craftedVenue} from '../src/gp/crafted-venue.js';
import {roadClearanceVolumes,sceneryBoxClearsRoad} from '../src/gp/scenery-road-clearance.js';
import round from '../src/gp/circuits/r12-wachau.js';
// Explicit geometry evidence is for scenery development; the full production
// bake still independently validates actual physics and camera footage.
process.env.GP_CARS='0';process.env.GP_LAPS='1';process.env.GP_MARBLE_PHYSICS='contact-flow-v3';
const c=process.env.WACHAU_GEOMETRY_EVIDENCE?JSON.parse(fs.readFileSync(process.env.WACHAU_GEOMETRY_EVIDENCE)):
 (await import('./season.mjs')).buildCourse(round);
const layout=wachauLayout(c.samples),terrain=italianTerrain(c.samples,{profile:WACHAU_PROFILE,length:c.L});
const recipe=wachauScenery(c.samples,{length:c.L});
test('Wachau keeps the full crafted treatment and coherent regional scenery',()=>{
 for(const profile of ['tuscany-venue-v3',WACHAU_PROFILE])assert.equal(craftedVenue({info:{sceneryProfile:profile}}),true);
 assert.equal(craftedVenue({info:{sceneryProfile:'tuscany-rich-v2'}}),false);assert.equal(craftedVenue(),false);
 for(const kind of ['village','orchard','terrace','castle','abbey'])assert.ok(layout.sites.some(s=>s.kind===kind),'Missing regional '+kind);
 for(const s of layout.sites)assert.ok(layout.clear(s.x,s.z,Math.hypot(s.halfX,s.halfZ)),'Site encroaches on roadway');
 for(const s of c.samples)assert.ok(terrain.heightAt(s.p[0],s.p[2])<s.p[1]-.7,'Earth enters the road at '+s.u);
 const meshes=buildSceneryMeshes(recipe.parts,WACHAU_MATERIALS,{localCoordinates:true});
 assert.ok(meshes.length>=14);for(const m of meshes){assert.ok(m.material,'Undefined material '+m.key);assert.ok(m.geometry.getAttribute('sceneryLocal'));m.geometry.dispose();}
});
test('bounded river stays outside every road sample and inside its carved channel',()=>{
 for(const s of c.samples)assert.ok(wachauRiverDistance(layout.river,s.p[0],s.p[2])>layout.river.halfWidth+s.w+20,'Water overlaps road');
 for(const [x,z]of layout.river.points)assert.ok(terrain.heightAt(x,z)<layout.river.waterY-.2,'Terrain covers the river');
 assert.equal(recipe.parts.filter(p=>p.category==='austria-river').length,layout.river.points.length-1);
});
test('graded settlements, orchard trunks and retaining walls meet the actual terrain',()=>{
 for(const p of recipe.parts){
  if(!['austria-settlement-foundation','austria-orchard-trunk','austria-verge-wall','austria-viaduct-pier'].includes(p.category))continue;
  const h=p.kind==='cylinder'?p.size[2]:p.size[1],m=new Matrix4().fromArray(p.matrix);
  const bottom=new Vector3(0,-h/2,0).applyMatrix4(m),ground=terrain.heightAt(bottom.x,bottom.z);
  assert.ok(bottom.y<=ground+.12,'Floating '+p.category+' gap '+(bottom.y-ground));
  assert.ok(bottom.y+h>ground,'Buried '+p.category);
 }
});
test('live and saved replay cameras include the exact regional opaque scene',()=>{
 const model=createCameraOcclusion({samples:c.samples,themeId:'austria',sceneryProfile:WACHAU_PROFILE,courseLength:c.L});
 const saved={id:round.id,samples:c.samples,info:{length:c.L,finish:c.uFinish,sceneryProfile:WACHAU_PROFILE},checkpoints:[]};
 const replay=replayOcclusion(saved).model;
 for(const category of new Set(recipe.parts.map(p=>p.category))){
  const count=recipe.parts.filter(p=>p.category===category).length;
  assert.equal(model.counts[category],count,category);assert.equal(replay.counts[category],count,'replay '+category);
 }
 assert.equal(model.counts['austria-terrain'],terrain.tiles.length);
 const p=recipe.parts.find(p=>p.category==='austria-abbey-building'),m=new Matrix4().fromArray(p.matrix);
 const a=new Vector3(0,0,-18).applyMatrix4(m).toArray(),b=new Vector3(0,0,18).applyMatrix4(m).toArray();
 assert.ok(model.blocks(a,b),'Abbey missing from ray queries');
});

test('viaduct assemblies leave every roadway and the finish runoff unobstructed',()=>{
 const volumes=roadClearanceVolumes(c.samples);
 const supports=recipe.parts.filter(p=>p.category.startsWith('austria-viaduct'));
 assert.ok(supports.length>30,'Keep substantial authored support construction');
 for(const p of supports)assert.ok(sceneryBoxClearsRoad(p,volumes),'Pier/cap/foot crosses another road elevation');
 // A column below the starting straight but across the finish must fail.
 const end=c.samples.at(-20),m=new Matrix4().makeTranslation(...end.p);
 assert.equal(sceneryBoxClearsRoad({size:[2,60,3],matrix:m.elements},volumes),false);
});
