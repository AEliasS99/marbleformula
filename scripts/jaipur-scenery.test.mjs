import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Matrix4,Vector3} from 'three';
import {jaipurScenery,JAIPUR_TERRAIN,JAIPUR_MATERIALS} from '../src/gp/jaipur-scenery.js';
import {italianTerrain} from '../src/gp/italy-terrain.js';
import {buildSceneryMeshes} from '../src/gp/scenery-mesh.js';
import {roadClearanceVolumes,sceneryBoxClearsRoad} from '../src/gp/scenery-road-clearance.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
import {replayOcclusion} from './prepare-replay-camera.mjs';
import {jaipurLayout} from '../src/gp/jaipur-layout.js';
import {buildCourse} from './season.mjs';
import round from '../src/gp/circuits/r13-jaipur.js';
process.env.GP_CARS='0';process.env.GP_LAPS='1';process.env.GP_MARBLE_PHYSICS='contact-flow-v3';
const c=process.env.JAIPUR_GEOMETRY_EVIDENCE?JSON.parse(fs.readFileSync(process.env.JAIPUR_GEOMETRY_EVIDENCE)):buildCourse(round);
const terrain=italianTerrain(c.samples,{profile:JAIPUR_TERRAIN,length:c.L}),recipe=jaipurScenery(c.samples,{length:c.L});

test('Jaipur dressing uses its own graded sites and leaves the racing surface clear',()=>{
 assert.equal(JAIPUR_TERRAIN,'jaipur-venue-v1');assert.equal(recipe.waterPlanes,0);
 for(const s of c.samples)assert.ok(terrain.heightAt(s.p[0],s.p[2])<s.p[1]-.7,'Terrain crosses road at '+s.u);
 for(const s of recipe.groups){
  const heights=[[-s.halfX,-s.halfZ],[-s.halfX,s.halfZ],[s.halfX,-s.halfZ],[s.halfX,s.halfZ]].map(([x,z])=>terrain.heightAt(s.x+Math.cos(s.rotY)*x+Math.sin(s.rotY)*z,s.z-Math.sin(s.rotY)*x+Math.cos(s.rotY)*z));
  assert.ok(Math.max(...heights)-Math.min(...heights)<.3,'Unmatched terrain grading creates a tall blank foundation: '+s.kind);
 }
 const road=roadClearanceVolumes(c.samples),supports=recipe.parts.filter(p=>p.category.startsWith('india-viaduct')||p.category==='india-pier-band');
 assert.ok(supports.length>20);
 for(const p of supports)assert.ok(sceneryBoxClearsRoad(p,road),'Support intersects another road elevation');
 const end=c.samples.at(-20);assert.equal(sceneryBoxClearsRoad({size:[2,60,3],matrix:new Matrix4().makeTranslation(...end.p).elements},road),false);
 for(const p of recipe.parts.filter(p=>['india-viaduct-foot','india-verge-lamp-base'].includes(p.category))){
  const h=p.kind==='cylinder'?p.size[2]:p.size[1],foot=new Vector3(0,-h/2,0).applyMatrix4(new Matrix4().fromArray(p.matrix));
  assert.ok(foot.y<=terrain.heightAt(foot.x,foot.z)+.03,'Floating foot '+p.category);
 }
});
test('Jaipur fronts face the actual course instead of showing blank backs to the race',()=>{
 for(const site of jaipurLayout(c.samples).sites){
  const nearest=c.samples.reduce((a,b)=>Math.hypot(a.p[0]-site.x,a.p[2]-site.z)<Math.hypot(b.p[0]-site.x,b.p[2]-site.z)?a:b),dx=nearest.p[0]-site.x,dz=nearest.p[2]-site.z;
  assert.ok((Math.sin(site.rotY)*dx+Math.cos(site.rotY)*dz)/Math.hypot(dx,dz)>.999,'Facade turned away');
 }
 assert.ok(recipe.parts.some(p=>p.category==='india-side-window-arch'));
});
test('rendered regional detail has real depth and finite merged physical coordinates',()=>{
 for(const category of ['jali-diagonal','turned-baluster','chajja-bracket','shutter-hinge','awning-stripe','awning-scallop','spice-mound','pottery-rim','folded-textile','rug-motif','lantern-frame','gateway-inner-order'])assert.ok(recipe.parts.some(p=>p.category==='india-'+category),'Missing '+category);
 const meshes=buildSceneryMeshes(recipe.parts,JAIPUR_MATERIALS,{localCoordinates:true});
 for(const m of meshes){assert.ok(m.material,m.key);for(const key of ['position','normal','sceneryLocal','scenerySurface'])assert.ok(m.geometry.getAttribute(key).array.every(Number.isFinite),m.key+' '+key);m.geometry.dispose();}
});
test('live/replay cameras share every opaque Jaipur detail and its real gateway opening',()=>{
 const live=createCameraOcclusion({samples:c.samples,themeId:'india',sceneryProfile:JAIPUR_TERRAIN,courseLength:c.L});
 const saved=replayOcclusion({id:round.id,samples:c.samples,info:{gp:'India',length:c.L,finish:c.uFinish,sceneryProfile:JAIPUR_TERRAIN},checkpoints:[]}).model;
 for(const category of new Set(recipe.parts.map(p=>p.category))){const n=recipe.parts.filter(p=>p.category===category).length;assert.equal(live.counts[category],n,category);assert.equal(saved.counts[category],n,'saved '+category);}
 const gateway=recipe.parts.find(p=>p.category==='india-gateway-inner-order'),m=new Matrix4().fromArray(gateway.matrix);
 const ray=(x,y)=>[new Vector3(x,y,-.5).applyMatrix4(m).toArray(),new Vector3(x,y,.5).applyMatrix4(m).toArray()];
 assert.equal(live.blocks(...ray(0,2)),false,'Open gateway painted over by box occlusion');
 assert.ok(live.blocks(...ray(2.42,2)),'Actual stone jamb omitted');
});
