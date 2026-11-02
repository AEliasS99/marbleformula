// Called by physics.test.mjs under the shared factory lock.
import assert from 'node:assert/strict';
import {createProject} from './model.mjs';
import {catalog} from './catalog.mjs';
import {simulate,preflight} from './physics.mjs';
const base=mode=>createProject({mode,template:'physics-lab'});
const settings={duration:30,launchSpeed:12};
const p=base('marbles');
const a=await simulate(p,catalog,settings),b=await simulate(p,catalog,settings);
assert.deepEqual(a.frames,b.frames,'same snapshot must yield identical physics');
assert.deepEqual(a.standings,b.standings);
assert.equal(a.gates.length,3);assert.ok(a.standings.some(r=>r.status==='finished'));assert.ok(a.events.some(e=>e.status==='eliminated'));
assert.equal(a.gates[2].passed.length,3);assert.ok(a.frames.every(f=>f.racers.flat().every(Number.isFinite)));
assert.ok(a.standings.every(r=>r.laps<=1));
const lap=base('cars');lap.laps=2;const two=await simulate(lap,catalog,{duration:45,launchSpeed:12});assert.ok(two.standings.some(r=>r.status==='finished'&&r.laps===2));assert.ok(two.gates[2].u>two.length);assert.ok(two.standings.filter(r=>r.status==='finished').every(r=>r.checkpoints===3));
// Regression: four-abreast cars previously used a neighbour's roof as tyre ground,
// flipping AUT. The car must genuinely reach a checkpoint; never rescue/reset it.
const cars=base('cars'),race=await simulate(cars,catalog,settings);
assert.equal(race.standings.filter(r=>r.status==='finished').length,3);
assert.equal(race.standings.filter(r=>r.status==='eliminated').length,3);
assert.ok(race.standings.every(r=>!['stuck','fell','timeout'].includes(r.status)));
assert.ok(race.frames.every(f=>f.telemetry.every(t=>t.up>.9&&t.contacts.every(c=>!c.dynamic))));
const carRepeat=await simulate(cars,catalog,settings);assert.deepEqual(race.frames,carRepeat.frames);
cars.elements=[];const allFinish=await simulate(cars,catalog,settings);
assert.equal(allFinish.standings.filter(r=>r.status==='finished').length,6,'elimination must not hide a stalled car');
const flat=base('marbles');flat.elements=[];flat.participants.forEach((r,i)=>r.enabled=i===0);
const rest=await simulate(flat,catalog,{duration:15,launchSpeed:0});assert.equal(rest.standings[0].status,'stuck');assert.ok(rest.standings[0].distance<1);
const down=structuredClone(flat);down.points[0].y=12;down.points[1].y=8;down.points[11].y=16;
const gravity=await simulate(down,catalog,{duration:5,launchSpeed:0});assert.ok(gravity.standings[0].distance>rest.standings[0].distance+1,'height must change motion');
const baseline=await simulate(flat,catalog,{duration:5,launchSpeed:12});
const barrier=structuredClone(flat);barrier.elements=[{id:'barrier',assetId:'barrier',name:'Wall',at:.04,offset:0,scale:1}];
const collision=await simulate(barrier,catalog,{duration:5,launchSpeed:12});assert.ok(collision.standings[0].distance<baseline.standings[0].distance-4,'physical obstacle must stop/deflect racer');
barrier.elements[0].offset=15;barrier.elements[0].scale=2;const shifted=await simulate(barrier,catalog,{duration:5,launchSpeed:12});assert.ok(Math.abs(shifted.standings[0].distance-baseline.standings[0].distance)<.001);assert.equal(shifted.fixtures[0].parts[0].size[2],10);
const wall=base('marbles');wall.wallHeight=.2;const low=await simulate(wall,catalog,settings);assert.ok(low.standings.filter(r=>r.status==='fell').length>a.standings.filter(r=>r.status==='fell').length,'wall height must affect escapes');
for(const type of ['pegs','bumpers','splitter','spinner','hammer','turntable','pusher','rollers','switch']){const t=structuredClone(flat);t.elements=[{id:type,assetId:type,name:type,at:.04,offset:.25,scale:1}];const r=await simulate(t,catalog,{duration:5,launchSpeed:12});assert.ok(r.fixtures.length>0,type);assert.ok(r.frames.every(f=>f.fixtures.flat().every(Number.isFinite)),type);if(r.frames[0].fixtures.length)assert.ok(r.frames.some(f=>JSON.stringify(f.fixtures)!==JSON.stringify(r.frames[0].fixtures)),type+' must move');}
const bad=base('marbles');bad.elements.push({id:'v',assetId:'vortex',name:'Vortex',at:.3,offset:0,scale:1});assert.ok(preflight(bad,catalog).errors.some(e=>e.elementId==='v'));
assert.ok(preflight(flat,catalog,{duration:Infinity}).errors.length);
const zero=structuredClone(flat);zero.points.forEach(q=>{q.x=0;q.y=0;q.z=0;});assert.ok(preflight(zero,catalog).errors.length);
const none=structuredClone(flat);none.participants.forEach(r=>r.enabled=false);assert.ok(preflight(none,catalog).errors.length);
const narrow=base('marbles');narrow.width=2;narrow.participants[0].size=2;assert.ok(preflight(narrow,catalog).errors.length);
console.log('Physics checks passed: deterministic replay; gravity; collision, offset, scale and walls; 9 mechanisms; 2-lap cars; elimination gates; stalls; unsupported-piece rejection.');
