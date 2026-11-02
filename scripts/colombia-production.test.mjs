import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync}from'node:fs';import {Vector3}from'three';
import {CIRCUITS}from'../src/gp/circuits/index.js';
import {productionLocation,productionReviewIdentity}from'../src/gp/production-locations.js';
import {EXHIBITION_CARS,selectCarCountries}from'../src/gp/car-roster.js';
import {colombianScenery,COLOMBIA_MATERIALS}from'../src/gp/colombia-scenery.js';
import {buildSceneryMeshes}from'../src/gp/scenery-mesh.js';
import {createCameraOcclusion}from'../src/gp/camera-occlusion.js';
import {colombiaAction}from'../src/gp/circuits/colombia-action.js';
import {refineCarCircuit}from'../src/gp/car-circuit-refinement.js';
const fixture=JSON.parse(readFileSync('out/tcr/colombia-course-geometry.json'));
test('Colombia extends the exhibition registry, preserving official championship and existing Spain identity',()=>{
 assert.equal(CIRCUITS.length,5);assert.ok(!CIRCUITS.some(c=>c.id==='r7-coffeeandes'));
 assert.equal(productionLocation('colombia').roundNumber,7);assert.equal(productionLocation('spain').roundNumber,6);
 assert.equal(productionReviewIdentity('colombia',1,'andes-v1',47).composition,'Colombia-Race-4k');
 assert.notDeepEqual(productionLocation('colombia').round.outline,productionLocation('spain').round.outline);
});
test('Colombian host uses an opt-in existing GT model with the same ten-point budget',()=>{
 const col=EXHIBITION_CARS.find(c=>c.abbr==='COL');assert.equal(col.stats.cls,'GT');
 assert.equal(col.stats.vel+col.stats.est+col.stats.int,10);assert.equal(col.flag,'COL');
 const all=['BRA','ARG','MEX','ESP','BEL'].map(abbr=>({abbr}));
 const picked=selectCarCountries(all,'COL,BRA,ARG,MEX,ESP,BEL');assert.equal(picked[0],col);assert.equal(picked[1],all[0]);assert.equal(all.length,5);
});
test('authored Coffee Andes action is deterministic, softened, clear of finish and includes extra acceleration lanes',()=>{
 const base=productionLocation('colombia').round,round=refineCarCircuit(colombiaAction(base,fixture),fixture),a=round.carChallenges;
 assert.deepEqual(round,fixture.round);assert.ok(fixture.L>500&&fixture.L<1300);assert.equal(round.carDescentDegrees,2);
 assert.ok(a.gates.length>=6);assert.ok(a.lanes.length>=12);assert.ok(a.lanes.some(l=>l.u>fixture.uFinish*.85));assert.ok(new Set(a.lanes.map(l=>l.u)).size>=8);assert.equal(a.patches.length,2);
 assert.equal(a.racecraft.drivingModel,'lookahead-driver-v1');assert.equal(a.racecraft.cockpitCamera,true);
 for(const g of a.gates){assert.equal(g.profile,'soft-island');assert.equal(g.height,.28);assert.ok(g.u<fixture.uFinish-40);}
 for(const p of a.patches)assert.ok(Math.abs(p.lat)>p.halfWidth);
 for(const l of a.lanes){assert.ok(l.u+l.length<fixture.uFinish-45);assert.ok(!a.gates.some(g=>l.u<g.u+g.length/2+4&&l.u+l.length>g.u-g.length/2-4));}
});
test('Colombian coffee towns and palms share every opaque primitive with camera QA and keep the full roadway clear',()=>{
 const scene=colombianScenery(fixture.samples),model=createCameraOcclusion({samples:fixture.samples,themeId:'colombia'});
 assert.ok(scene.parts.length>2000);assert.equal(model.boxes.length,scene.parts.length);
 for(const category of ['colombia-building','colombia-roof','colombia-palm','colombia-coffee','colombia-flag'])assert.ok(model.counts[category]>0);
 for(const p of scene.parts){assert.ok(COLOMBIA_MATERIALS[p.material]);assert.ok(p.matrix.every(Number.isFinite));}
 for(const s of fixture.samples)for(const lat of [-2.2,0,2.2]){const p=new Vector3(...s.p).addScaledVector(new Vector3(...s.n),.35).addScaledVector(new Vector3(...s.r),lat);assert.ok(model.clearance(p)>.35,`Road obstructed at ${s.u}, lateral ${lat}`);}
});
test('merged Colombia scene has finite complete attributes and a bounded material draw-call count',()=>{
 const scene=colombianScenery(fixture.samples),meshes=buildSceneryMeshes(scene.parts,COLOMBIA_MATERIALS);
 assert.ok(meshes.length>=12&&meshes.length<=20);
 for(const m of meshes){assert.ok(m.geometry.boundingSphere.radius>0);for(const key of ['position','normal','uv'])assert.ok(m.geometry.getAttribute(key).array.every(Number.isFinite));m.geometry.dispose();}
});
