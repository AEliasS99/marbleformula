import test from'node:test';import assert from'node:assert/strict';import{Quaternion,Vector3}from'three';
import{createCarContactSolver,CAR_WHEEL_LAYOUT,CAR_BODY_SCALE}from'../src/gp/car-contact.js';
function fixture(bank=0){const q=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),bank),up=new Vector3(0,1,0).applyQuaternion(q),right=new Vector3(0,0,1).applyQuaternion(q);return {q,up,samples:Array.from({length:25},(_,u)=>({u,p:[u,0,0],t:[1,0,0],r:right.toArray(),n:up.toArray(),w:3.2,curv:0}))};}
test('all four actual tyre profiles seat on level and banked roads without changing heading',()=>{
 for(const bank of [0,-.65,.65])for(const style of [0,1,2,3]){
  const {q,up,samples}=fixture(bank),solver=createCarContactSolver(samples),raw={pos:new Vector3(12,0,0).addScaledVector(up,.395).toArray(),quat:q.toArray()};
  const fixed=solver.solve(raw,12,style,{steerYaw:0,spin:0});assert.equal(fixed.contactStatus,'grounded');assert.deepEqual(fixed.quat,raw.quat);assert.ok(fixed.bodyShift<-.07&&fixed.bodyShift>-.12);
  for(let i=0;i<4;i++){
   const radius=style===2?.146:i<2?.132:.144,center=new Vector3(...CAR_WHEEL_LAYOUT[i]);center.y=fixed.wheelY[i];center.multiply(new Vector3(...CAR_BODY_SCALE)).applyQuaternion(q).add(new Vector3(...fixed.pos));
   assert.ok(Math.abs(center.dot(up)-radius*CAR_BODY_SCALE[1])<.0005,'Tyre contact must be within half a millimetre');
  }
 }
});
test('gaps and airborne trajectories retain the saved pose rather than snapping down',()=>{
 const {samples}=fixture(),solver=createCarContactSolver(samples),raw={pos:[12,2,0],quat:[0,0,0,1]},fixed=solver.solve(raw,12,0);
 assert.deepEqual(fixed.pos,raw.pos);assert.equal(fixed.wheelY,undefined);
 const gap=createCarContactSolver(samples.map(s=>({...s,gap:true})));assert.equal(gap.solve(raw,12,0).contactStatus,'gap');
});
test('contact reconstruction is seek-independent and leaves input samples and poses unchanged',()=>{
 const {samples}=fixture(.4),original=JSON.stringify(samples),solver=createCarContactSolver(samples),p={pos:[12,.395,0],quat:[0,0,0,1]},before=JSON.stringify(p),first=solver.solve(p,12,2);
 solver.solve({pos:[6,.35,0],quat:[0,0,0,1]},6,1);assert.deepEqual(solver.solve(p,12,2),first);assert.equal(JSON.stringify(samples),original);assert.equal(JSON.stringify(p),before);
});
