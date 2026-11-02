import test from 'node:test';import assert from 'node:assert/strict';
import italy from '../src/gp/circuits/r8-tuscany.js';import{worldRushRound}from'../src/gp/circuits/world-rush.js';
import {italianTerrain} from '../src/gp/italy-terrain.js';import {italianScenery,ITALY_MATERIALS}from'../src/gp/italy-scenery.js';
import {buildSceneryMeshes}from'../src/gp/scenery-mesh.js';import{createCameraOcclusion}from'../src/gp/camera-occlusion.js';
import {landscapeSurface,tuscanLandscape} from '../src/gp/tuscany-landscape.js';
import {sceneryPartGeometry} from '../src/gp/scenery-mesh.js';
import {Mesh,MeshBasicMaterial,DoubleSide,Matrix4,Raycaster,Vector3} from 'three';
import{venueLayout}from'../src/gp/venue.js';
import{TUSCAN_VENUE_MATERIALS}from'../src/gp/tuscany-venue.js';
process.env.GP_CARS='0';
const{buildCourse}=await import('./season.mjs');
// Build the authored course geometry only: no ignored race fixture, physics
// simulation, random seed search or production-file writes.
const data=buildCourse(worldRushRound(italy)),profile='tuscany-venue-v3';
test('venue ground and structural additions share actual camera geometry, preserve the road and stay finite',()=>{
 const terrain=italianTerrain(data.samples,{profile,length:data.L}),recipe=italianScenery(data.samples,{profile,length:data.L}),model=createCameraOcclusion({samples:data.samples,themeId:'italy',sceneryProfile:profile,courseLength:data.L});
 for(const s of data.samples)assert.ok(terrain.heightAt(s.p[0],s.p[2])<s.p[1]-.7,'earth intrudes into roadway at '+s.u);
 for(const category of ['italy-venue-coping','italy-venue-spectator','italy-venue-pavilion-column','italy-venue-balcony','italy-venue-lantern','italy-venue-pit-tile','italy-venue-vine-canopy','italy-landscape-trunk','italy-landscape-garden-wall']){
  const parts=recipe.parts.filter(p=>p.category===category);assert.ok(parts.length,category);assert.equal(model.counts[category],parts.length,category+' missing from camera model');
 }
 assert.ok(recipe.groups.filter(g=>g.kind==='spectator-pavilion').length>=3);
 assert.ok(recipe.groups.filter(g=>g.kind==='venue-vineyard').length>=10);
 assert.throws(()=>italianScenery(data.samples,{profile}),/actual course length/);
 const meshes=buildSceneryMeshes(recipe.parts,{...ITALY_MATERIALS,...TUSCAN_VENUE_MATERIALS},{localCoordinates:true});
 for(const m of meshes){assert.ok(m.material);for(const key of ['position','normal','sceneryLocal','scenerySurface']){const a=m.geometry.getAttribute(key);assert.ok(a&&Array.from(a.array).every(Number.isFinite),key);}m.geometry.dispose();}
});
test('settlement plinths meet graded earth; spectator columns reach their own local footings',()=>{
 const terrain=italianTerrain(data.samples,{profile,length:data.L}),recipe=italianScenery(data.samples,{profile,length:data.L});
 for(const g of recipe.groups.filter(g=>['tuscan-town','vineyard-farm'].includes(g.kind)))assert.ok(g.y-terrain.heightAt(g.x,g.z)<.3,'raised catalogue plinth at '+g.x);
 for(const p of recipe.parts.filter(p=>p.category==='italy-venue-pavilion-column')){
  const base=p.matrix[13]-p.size[1]/2;assert.ok(Math.abs(base-terrain.heightAt(p.matrix[12],p.matrix[14]))<.001);
 }
 for(const p of recipe.parts.filter(p=>p.category==='italy-venue-vine-trunk')){
  assert.ok(Math.abs(p.matrix[13]-.52-terrain.heightAt(p.matrix[12],p.matrix[14]))<.001,'vine floating above ground');
  assert.ok(data.samples.every(s=>Math.hypot(s.p[0]-p.matrix[12],s.p[2]-p.matrix[14])>(s.w??2.1)+1),'vine intrudes into road');
 }
 for(const p of recipe.parts.filter(p=>p.category==='italy-venue-coping')){
  const closest=data.samples.reduce((a,b)=>Math.hypot(b.p[0]-p.matrix[12],b.p[2]-p.matrix[14])<Math.hypot(a.p[0]-p.matrix[12],a.p[2]-p.matrix[14])?b:a);
  const rel=[p.matrix[12]-closest.p[0],p.matrix[13]-closest.p[1],p.matrix[14]-closest.p[2]],lat=Math.abs(rel.reduce((n,v,k)=>n+v*closest.r[k],0));
  assert.ok(lat-p.size[2]/2>(closest.w??2.1)-.01,'coping overlaps racing envelope');
 }
});

test('landscape planting meets the actual rotated hill triangles, including overlap and terrain',()=>{
 const terrain={heightAt:(x,z)=>.03*x+.02*z};
 const hills=[{kind:'hill',size:[38,19,24],matrix:new Matrix4().makeRotationY(.71).setPosition(4,-4,3).elements},{kind:'hill',size:[24,12,29],matrix:new Matrix4().makeRotationY(-.3).setPosition(17,-2,-8).elements}];
 const surface=landscapeSurface(hills,terrain),material=new MeshBasicMaterial({side:DoubleSide});
 const meshes=hills.map(p=>{const mesh=new Mesh(sceneryPartGeometry(p),material);mesh.matrix.fromArray(p.matrix);mesh.matrixAutoUpdate=false;mesh.updateMatrixWorld(true);return mesh;});
 const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));let aboveTerrain=0;
 for(let x=-42;x<=52;x+=2.7)for(let z=-40;z<=40;z+=3.1){
  ray.ray.origin.set(x,100,z);const hits=ray.intersectObjects(meshes,false);const expected=Math.max(terrain.heightAt(x,z),...hits.map(h=>h.point.y));
  if(expected>terrain.heightAt(x,z)+.1)aboveTerrain++;
  assert.ok(Math.abs(surface(x,z)-expected)<1e-5,'floating/buried hill planting at '+[x,z]);
 }
 assert.ok(aboveTerrain>100);for(const mesh of meshes)mesh.geometry.dispose();material.dispose();
});
test('connected landscape keeps houses and plant crowns outside the real road, without altering samples',()=>{
 const before=JSON.stringify(data.samples),plan=tuscanLandscape(data.samples),recipe=italianScenery(data.samples,{profile,length:data.L});
 assert.ok(plan.neighborhoods.length>0);assert.ok(plan.paths.length>=plan.sites.length-1);
 for(const p of plan.neighborhoods)assert.ok(plan.roadClear(p.x,p.z,Math.hypot(p.halfX,p.halfZ)*p.scale));
 for(const p of recipe.parts.filter(p=>['italy-landscape-vine','italy-landscape-pine','italy-landscape-cypress','italy-landscape-garden-wall'].includes(p.category))){
  const radius=p.kind==='box'?Math.hypot(p.size[0],p.size[2])/2:Math.max(p.size[0],p.size[1]);
  assert.ok(plan.roadClear(p.matrix[12],p.matrix[14],radius),'landscape crosses road: '+p.category);
 }
 assert.equal(JSON.stringify(data.samples),before);
});

test('land-use surface is deterministic and all village extensions have connecting paths',async()=>{
 const {landscapeGroundTexture}=await import('../src/gp/landscape-ground.js');
 const plan=tuscanLandscape(data.samples),a=landscapeGroundTexture(plan,64),b=landscapeGroundTexture(plan,64);
 assert.deepEqual(a.texture.image.data,b.texture.image.data,'surface changes between render seeks');
 const colours=new Set();for(let i=0;i<a.texture.image.data.length;i+=4)colours.add(a.texture.image.data.slice(i,i+3).join(','));
 assert.ok(colours.size>30,'landscape reduced to one plain ground colour');
 for(const house of plan.neighborhoods)assert.ok(plan.paths.some(p=>p.b===house&&p.a===plan.sites[house.parent]),'isolated new house');
 assert.strictEqual(italianTerrain(data.samples),italianTerrain(data.samples,{profile:'tuscany-rich-v2'}),'legacy terrain changed');
 a.texture.dispose();b.texture.dispose();
});


test('new hillside leaves the original pit floor and facade above ground',()=>{
 const terrain=italianTerrain(data.samples,{profile,length:data.L}),pit=venueLayout(data.samples,data.L).pit;
 assert.ok(pit);
 for(let x=-12;x<=12;x+=3)for(let z=-3;z<=3;z+=1.5){
  const wx=pit.base[0]+Math.cos(pit.yaw)*x+Math.sin(pit.yaw)*z,wz=pit.base[2]-Math.sin(pit.yaw)*x+Math.cos(pit.yaw)*z;
  assert.ok(terrain.heightAt(wx,wz)<pit.base[1]+.2,'pit buried by new terrain');
 }
});
