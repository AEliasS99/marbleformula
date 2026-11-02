import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {Vector3}from'three';
import {regionalRelief}from'../src/gp/regional-relief.js';
import {colombianScenery}from'../src/gp/colombia-scenery.js';import {spanishScenery}from'../src/gp/spain-scenery.js';
import {createCameraOcclusion}from'../src/gp/camera-occlusion.js';
const fixtures=[['colombia','out/tcr/track-review/colombia-heat2-andes-v16-seed60/race.json',colombianScenery],['spain','out/tcr/spain-course-geometry.json',spanishScenery]];
for(const[name,file,recipe]of fixtures)test(name+' has visible mountain relief, closer settlements and full-width road clearance',()=>{
 const d=JSON.parse(fs.readFileSync(file)),relief=regionalRelief(d.samples),scene=recipe(d.samples),model=createCameraOcclusion({samples:d.samples,themeId:name});
 assert.equal(relief.peaks.length,22);assert.ok(relief.plots.length>=24);assert.ok(relief.peaks.every(p=>p.y+p.height>Math.max(...d.samples.map(s=>s.p[1]))+30));
 assert.equal(scene.parts.filter(p=>p.category===name+'-mountain').length,22);assert.ok(scene.groups.filter(p=>p.kind.endsWith('hamlet')).length>=24);assert.equal(model.boxes.length,scene.parts.length);
 for(const s of d.samples.filter((_,i)=>i%3===0))for(const lat of [-(s.w-.3),0,s.w-.3]){
  const p=new Vector3(...s.p).addScaledVector(new Vector3(...s.n),.4).addScaledVector(new Vector3(...s.r),lat);
  assert.ok(model.clearance(p)>.35,`${name}: decorative geometry blocks road at ${s.u}, ${lat}`);
 }
 assert.ok(!scene.parts.some(p=>p.category.endsWith('-sea')));
});
