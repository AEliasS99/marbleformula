// Run under scripts/factory.mjs --shared-lock.
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {createProject,validateAsset} from './model.mjs';
import {catalog} from './catalog.mjs';
import {simulate,preflight} from './physics.mjs';
import {buildCourse,typeOf} from './public/course.js';
const scene=(type,at=.15)=>{const p=createProject({template:'physics-lab'});p.elements=type?[{id:'piece',assetId:type,name:type,at,offset:0,scale:1}]:[];p.participants.forEach((r,i)=>r.enabled=i===0);p.points.forEach(q=>{q.x*=2;q.z*=2;q.y=12;});return p;};
// The canonical editor and physics builders have actual openings, not painted ramps.
await RAPIER.init();
for(const type of ['jump','drop','vortex']){
 const p=scene(type),g=buildCourse(p,catalog),f=g.features[0],w=new RAPIER.World({x:0,y:-9.81,z:0});
 try{const b=w.createRigidBody(RAPIER.RigidBodyDesc.fixed());w.createCollider(RAPIER.ColliderDesc.trimesh(g.mesh.physics.vertices,g.mesh.physics.indices),b);for(const e of g.extra)w.createCollider(RAPIER.ColliderDesc.trimesh(e.vertices,e.indices),b);w.step();
  assert.equal(g.mesh.parts.caps.index.length,0,'authored gaps must not have full-width stop plates');
  const pos=type==='vortex'?f.bowl.center:g.frameAt((f.gap[0]+f.gap[1])/2).p;
  const hit=w.castRay(new RAPIER.Ray({x:pos[0],y:50,z:pos[2]},{x:0,y:-1,z:0}),100,true);
  if(type==='vortex'){assert.ok(hit);assert.ok(50-hit.timeOfImpact<f.bowl.center[1]-f.bowl.depth-f.bowl.throat,'throat must be open onto lower track');}
  else assert.equal(hit,null,type+' must have an empty flight gap');
 }finally{w.free();}
}
// A marble genuinely falls through the throat and lands below it.
const vp=scene('vortex');const vg=buildCourse(vp,catalog),vf=vg.features[0];vp.elements.push({id:'exit',assetId:'booster',name:'Exit booster',at:(vf.resume+.1)/vg.length,offset:0,scale:1});
const vr=await simulate(vp,catalog,{duration:60,launchSpeed:18});assert.ok(vr.events.some(e=>e.status==='vortex-enter'));assert.ok(vr.events.some(e=>e.status==='vortex-exit'));assert.ok(vr.frames.some(f=>{const p=f.racers[0];return Math.hypot(p[0]-vf.bowl.center[0],p[2]-vf.bowl.center[2])<vf.bowl.hole&&p[1]<vf.bowl.center[1]-vf.bowl.depth;}));
// Flight and landing, with a visible booster before the ramp; no prescribed poses.
const jp=scene('jump',.05);jp.points.forEach(q=>{q.x*=1.5;q.z*=1.5;});jp.participants[0].size=.7;jp.wallHeight=3;jp.elements.push({id:'ramp-power',assetId:'booster',name:'Ramp power',at:.038,offset:0,scale:1});const jr=await simulate(jp,catalog,{duration:10,launchSpeed:16});assert.ok(jr.frames.some(f=>f.racers[0][1]>14.5));assert.ok(jr.frames.at(-1).racers[0][1]<13);assert.ok(jr.standings[0].distance>buildCourse(jp,catalog).features[0].end+5);
// Fans change motion; their rotors and regroup bars move in the recorded replay.
const empty=scene(null),fan=scene('fan',.02);const baseline=await simulate(empty,catalog,{duration:5,launchSpeed:12}),gust=await simulate(fan,catalog,{duration:5,launchSpeed:12});assert.notDeepEqual(gust.frames.at(-1).racers,baseline.frames.at(-1).racers);assert.ok(gust.frames.some(f=>JSON.stringify(f.fixtures)!==JSON.stringify(gust.frames[0].fixtures)));
const gate=scene('regroup',.03),held=await simulate(gate,catalog,{duration:15,launchSpeed:12});assert.ok(held.events.some(e=>e.status==='regroup-open'));assert.ok(held.frames.some(f=>JSON.stringify(f.fixtures)!==JSON.stringify(held.frames[0].fixtures)));
const carGate={...catalog.find(a=>a.id==='regroup'),id:'car-gate',physicsType:'regroup',custom:true,modes:['cars']},cg=createProject({mode:'cars',template:'physics-lab'});cg.laps=2;cg.participants.forEach((r,i)=>r.enabled=i===0);cg.elements=[{id:'gate',assetId:'car-gate',name:'Gate',at:.2,offset:0,scale:1}];const twoLaps=await simulate(cg,[...catalog,carGate],{duration:45,launchSpeed:12});assert.equal(twoLaps.standings[0].status,'finished');assert.deepEqual([...new Set(twoLaps.events.filter(e=>e.status==='regroup-open').map(e=>e.lap))],[1,2]);
for(const type of ['jump','drop','bumps','crest','tube']){const p=scene(type,.05);const r=await simulate(p,catalog,{duration:10,launchSpeed:18});assert.ok(r.frames.every(f=>f.racers.flat().every(Number.isFinite)),type);assert.ok(r.features.some(f=>f.type===type));if(type==='tube')assert.ok(r.fixtures.some(f=>f.kind==='tube'&&f.parts.some(p=>p.type==='trimesh')));}
// All inherited physical shapes (including arch vs checkpoint) have explicit identity.
for(const original of catalog){const a=validateAsset({id:'custom-'+original.id,name:'Variant',description:'Text is not code',modes:original.modes,category:original.category,shape:original.shape,physicsType:original.id,color:'#447799',scale:1});assert.equal(typeOf(a),original.id);}
const original=scene('spinner',.04),custom={...catalog.find(a=>a.id==='spinner'),id:'variant',physicsType:'spinner',custom:true,scale:1,color:'#447799'};
const cp=structuredClone(original);cp.elements[0].assetId='variant';const normal=await simulate(original,catalog,{duration:5,launchSpeed:12}),variant=await simulate(cp,[...catalog,custom],{duration:5,launchSpeed:12});assert.deepEqual(normal.frames,variant.frames,'a variant with the same scale must preserve physics');
cp.elements[0].scale=1.5;cp.elements[0].offset=1;const scaled=await simulate(cp,[...catalog,custom],{duration:5,launchSpeed:12});assert.equal(scaled.fixtures[0].parts[0].size[0]/normal.fixtures[0].parts[0].size[0],1.5);assert.notDeepEqual(scaled.fixtures[0].pose,normal.fixtures[0].pose);assert.ok(scaled.frames.some(f=>JSON.stringify(f.fixtures)!==JSON.stringify(scaled.frames[0].fixtures)));
assert.equal(preflight(createProject(),catalog).errors.length,0,'original valley is now supported');
const overlap=scene('vortex');overlap.elements.push({id:'bad',assetId:'jump',name:'Overlapping jump',at:.15,offset:0,scale:1});assert.ok(preflight(overlap,catalog).errors.some(e=>e.message.includes('solapa')));
const small=scene('vortex');small.elements[0].scale=.3;assert.ok(preflight(small,catalog).errors.some(e=>e.message.includes('garganta')));
const complete=createProject({template:'physics-complete'});assert.equal(preflight(complete,catalog).errors.length,0);const full=await simulate(complete,catalog,{duration:120,launchSpeed:12});assert.equal(full.participants.length,6);assert.ok(full.events.some(e=>e.status==='vortex-exit'));assert.ok(full.frames.every(f=>f.racers.flat().every(Number.isFinite)));console.log('Full laboratory:',full.standings.map(s=>[s.id,s.status,Math.round(s.distance)]));
console.log('Adapter checks passed: real gaps, draining vortex, wind, moving gate, surface features, inherited identities, scaled kinematics, placement validation, full race.');
