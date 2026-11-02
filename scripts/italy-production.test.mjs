import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector3} from 'three';
import italy from '../src/gp/circuits/r8-tuscany.js';
import colombia from '../src/gp/circuits/r7-coffeeandes.js';
import {CIRCUITS} from '../src/gp/circuits/index.js';
import {worldRushRound,worldRushAction} from '../src/gp/circuits/world-rush.js';
import {italianScenery,ITALY_MATERIALS} from '../src/gp/italy-scenery.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
import {italianTerrain} from '../src/gp/italy-terrain.js';
import {buildSceneryMeshes} from '../src/gp/scenery-mesh.js';
process.env.GP_CARS='1';
const {buildCourse}=await import('./season.mjs');
const road=worldRushRound(italy),course=buildCourse(road);
test('Italian road is authored separately without changing official championship, with real action sectors',()=>{
 assert.equal(CIRCUITS.length,5);assert.ok(!CIRCUITS.some(c=>c.id===italy.id));assert.notDeepEqual(italy.outline,colombia.outline);
 const round=worldRushAction(road,course);
 assert.equal(round.carChallenges.patches.length,4);assert.ok(round.carChallenges.lanes.length>=4);
 assert.ok(course.samples.every(s=>s.p.every(Number.isFinite)));
});
test('Tuscan opaque scenery is renderable and blocks the identical camera rays',()=>{
 const recipe=italianScenery(course.samples),model=createCameraOcclusion({samples:course.samples,themeId:'italy'});
 assert.ok(recipe.groups.some(g=>g.kind==='tuscan-town'));assert.ok(recipe.groups.some(g=>g.kind==='vineyard-farm'));
 for(const category of ['italy-building','italy-bell-tower','italy-vine','italy-cypress','italy-flag','italy-viaduct-pier','italy-viaduct-cap']){
  const parts=recipe.parts.filter(p=>p.category===category);assert.ok(parts.length>0,category);
  assert.equal(model.counts[category],parts.length,category+' omitted from camera model');
  const p=parts[0],m=new Matrix4().fromArray(p.matrix),ray=[-1,1].map(sign=>new Vector3(0,0,sign*10).applyMatrix4(m).toArray());
  assert.ok(model.blocks(...ray),category+' visible through geometry');
 }
 const meshes=buildSceneryMeshes(recipe.parts,ITALY_MATERIALS);
 assert.ok(meshes.length>=12);for(const m of meshes){assert.ok(m.material);assert.ok(m.geometry.attributes.position.count>0);m.geometry.dispose();}
});

test('continuous Tuscan terrain remains below the entire road, with no pinched village pillars',()=>{
 const terrain=italianTerrain(course.samples),recipe=italianScenery(course.samples);
 for(const s of course.samples)assert.ok(terrain.heightAt(s.p[0],s.p[2])<s.p[1]-.7,'terrain intrudes into road at '+s.u);
 assert.ok(!recipe.parts.some(p=>p.kind==='mountain'));
 for(const g of recipe.groups){
  assert.ok(g.y-terrain.heightAt(g.x,g.z)<5,'settlement suspended above terrain');
  assert.ok(g.x>terrain.bounds.minX+25&&g.x<terrain.bounds.maxX-25&&g.z>terrain.bounds.minZ+25&&g.z<terrain.bounds.maxZ-25,'outer town lies beyond terrain');
 }
});

test('Italian viaduct has grounded stone supports with structural spacing',()=>{
 const terrain=italianTerrain(course.samples),piers=italianScenery(course.samples).parts.filter(p=>p.category==='italy-viaduct-pier');
 assert.ok(piers.length>15&&piers.length<90);
 for(const p of piers){const y=p.matrix[13]-p.size[1]/2;assert.ok(Math.abs(y-(terrain.heightAt(p.matrix[12],p.matrix[14])-.2))<.001);assert.ok(p.size[0]>=1.2);}
});

// Regression: rich Tuscan relief must be rolling hills, not steep walls whose
// height grows with the circuit's vertical drop. Legacy scenery stays unchanged.
test('rich Tuscan hills have shallow slopes and preserve the existing villages',()=>{
 const legacy=italianScenery(course.samples),rich=italianScenery(course.samples,{profile:'tuscany-rich-v2'});
 const hills=rich.parts.filter(p=>p.category==='italy-backdrop-ridge');
 assert.ok(hills.length>=12,'retain the authored skyline');
 for(const p of hills){
  assert.ok(p.size[1]/Math.min(p.size[0],p.size[2])<=.46,'steep backdrop wall');
  assert.ok(p.size[1]>20,'keep visible landscape relief');
  const ground=italianTerrain(course.samples).heightAt(p.matrix[12],p.matrix[14]);
  assert.ok(p.matrix[13]+p.size[1]>ground+5,'backdrop buried below rolling ground');
  assert.ok(p.matrix[13]<ground,'embed the hill skirt');
  for(const foundation of legacy.parts.filter(q=>q.category==='italy-town-foundation'||q.category==='italy-farm-foundation')){
   const radius=Math.hypot(foundation.size[0],foundation.size[2])/2*Math.hypot(...foundation.matrix.slice(0,3));
   assert.ok(Math.hypot(p.matrix[12]-foundation.matrix[12],p.matrix[14]-foundation.matrix[14])>Math.max(p.size[0],p.size[2])+radius+10,'hill buries existing village');
  }
  for(const s of course.samples)assert.ok(Math.hypot(s.p[0]-p.matrix[12],s.p[2]-p.matrix[14])>Math.max(p.size[0],p.size[2])+(s.w??2.1),'hill overlaps road');
 }
 for(const category of ['italy-building','italy-vine','italy-bell-tower','italy-viaduct-pier'])assert.deepEqual(rich.parts.filter(p=>p.category===category),legacy.parts.filter(p=>p.category===category),'preserve '+category);
});
