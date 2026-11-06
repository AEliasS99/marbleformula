import test from 'node:test';import assert from 'node:assert/strict';
import {BoxGeometry}from'three';
import{aiMaterialFiles,physicalBoxUVs,AI_CRAFT_PROFILE,aiStoneGeometry}from'../src/gp/ai-materials.js';
test('historical races do not silently receive AI maps; new profile loads distinct colour/normal/roughness',()=>{
 for(const p of [undefined,'','tuscany-venue-v3'])assert.equal(aiMaterialFiles(p,'travertine'),null);
 const f=aiMaterialFiles(AI_CRAFT_PROFILE,'travertine');assert.equal(new Set(Object.values(f)).size,3);assert.ok(Object.values(f).every(x=>x.startsWith('materials/ai/italian-craft-v1/')));
 assert.throws(()=>aiMaterialFiles(AI_CRAFT_PROFILE,'../invalid'),/Unknown/);
});
test('AI-profile stone edge detail stays inside the original solid bounds',()=>{
 for(const size of [[2.28,.38,.52],[.3,.38,.52],[.9,.48,6.14]]){
  const g=aiStoneGeometry(size);g.computeBoundingBox();
  for(let k=0;k<3;k++){assert.ok(g.boundingBox.min.getComponent(k)>=-size[k]/2-1e-6);assert.ok(g.boundingBox.max.getComponent(k)<=size[k]/2+1e-6);}
  assert.ok(g.attributes.normal.array.every(Number.isFinite));assert.ok(g.attributes.uv.array.every(Number.isFinite));g.dispose();
 }
});
test('surface detail uses actual metres and preserves block collision positions/normals',()=>{
 const g=new BoxGeometry(2.4,.4,.3),positions=[...g.attributes.position.array],normals=[...g.attributes.normal.array];physicalBoxUVs(g,1.2);
 assert.deepEqual([...g.attributes.position.array],positions);assert.deepEqual([...g.attributes.normal.array],normals);
 const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
 for(let i=0;i<p.count;i++)if(n.getZ(i)>.8){assert.ok(Math.abs(uv.getX(i)-p.getX(i)/1.2)<1e-6);assert.ok(Math.abs(uv.getY(i)-p.getY(i)/1.2)<1e-6);}
 assert.throws(()=>physicalBoxUVs(g,0),/physical tile/);g.dispose();
});
