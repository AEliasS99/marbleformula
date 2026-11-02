import test from 'node:test';
import assert from 'node:assert/strict';
import {productionLocation,productionReviewIdentity} from '../src/gp/production-locations.js';
import {composeSprint} from '../src/gp/circuits/compose-sprint.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';

test('production locations preserve historical Alps identities and select the authored Tokyo road',()=>{
  assert.deepEqual(productionReviewIdentity('alps','1','evolution',17),{name:'alps-heat1-evolution-seed17',folder:'out/tcr/alps-review',composition:'Alps-Evolution-4k'});
  assert.equal(productionLocation('tokyo').round.circuit,'Shibuya Neon Expressway');
  assert.equal(productionReviewIdentity('tokyo',1,'neon-sprint-v1',35).folder,'out/tcr/track-review');
  for(const args of [['../tokyo',1,'review',35],['tokyo',5,'review',35],['tokyo',1,'../review',35],['tokyo',1,'review',NaN]])assert.throws(()=>productionReviewIdentity(...args));
});

test('sprint composes reproducible real gates and pads on straight sectors without changing the authored circuit',()=>{
  const base=productionLocation('tokyo').round,before=JSON.stringify(base);
  const course={uFinish:610,samples:Array.from({length:1221},(_,i)=>({u:i*.5,curv:i%220<170?0:.1}))};
  const variant=composeSprint(base,course),other=composeSprint(base,course),{gates,lanes}=variant.carChallenges;
  assert.equal(variant.outline,base.outline);assert.equal(variant.scale,base.scale);assert.equal(JSON.stringify(base),before);
  assert.deepEqual(variant,other);assert.ok(gates.length>=5);assert.ok(lanes.length>=5);
  assert.ok(gates.some(g=>g.lat<0)&&gates.some(g=>g.lat>0));
  for(const g of gates){assert.ok(g.u>20&&g.u<course.uFinish-35);assert.equal(course.samples[Math.round(g.u*2)].curv,0);}
  for(const l of lanes)assert.ok(!gates.some(g=>l.u<g.u+g.length/2+2&&l.u+l.length>g.u-g.length/2-2));
  assert.throws(()=>composeSprint(base,{uFinish:100,samples:course.samples.slice(0,100)}));
});

test('Tokyo camera envelopes cover the existing city and its opaque sign footprints',()=>{
  const samples=Array.from({length:401},(_,i)=>({u:i*.5,p:[i*.5,-i*.04,Math.sin(i*.03)*20],t:[1,-.08,0],n:[0,1,0],r:[0,0,1],w:2.1}));
  const model=createCameraOcclusion({samples,themeId:'tokyo'});
  for(const category of ['tokyo-building','tokyo-pagoda','tokyo-tower','tokyo-spire'])assert.ok(model.counts[category]>0);
  const b=model.boxes.find(x=>x.category==='tokyo-building');
  assert.equal(model.clearance(b.center),0);
  const [x,y,z]=b.center;
  assert.equal(model.blocks([x-100,y,z],[x+100,y,z]),true);
});
