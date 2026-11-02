import test from'node:test';import assert from'node:assert/strict';
import{craftedFinGeometry,craftedBumperGeometry}from'../src/gp/crafted-machine.js';
const finite=g=>{for(const n of ['position','normal','uv'])assert.ok(Array.from(g.attributes[n].array).every(Number.isFinite),n);};
test('bevels, frame and face screws stay inside existing fin collision/occlusion envelopes',()=>{
 for(const size of [[2.19,.85,.14],[7.2,.95,.22],[1.36,.85,.14]]){
  const pieces=craftedFinGeometry(size);assert.deepEqual(pieces.map(p=>p.role),['wood','brass','iron']);
  for(const p of pieces){finite(p.geometry);const box=p.geometry.boundingBox;
   for(let k=0;k<3;k++){assert.ok(box.min.getComponent(k)>=-size[k]/2-1e-6,p.role+' protrudes');assert.ok(box.max.getComponent(k)<=size[k]/2+1e-6,p.role+' protrudes');}p.geometry.dispose();
  }
 }
});
test('rounded bumper stays inside the original tapered collision body',()=>{
 for(const [r,h]of[[.28,.56],[.4,.7],[.52,.82]]){
  const g=craftedBumperGeometry(r,h);finite(g);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
   const y=p.getY(i),radius=Math.hypot(p.getX(i),p.getZ(i)),limit=r*(1-.04*(y/h+.5));
   assert.ok(Math.abs(y)<=h/2+1e-6);assert.ok(radius<=limit+1e-6,'rounding extends beyond old tapered body');
  }g.dispose();
 }
});
