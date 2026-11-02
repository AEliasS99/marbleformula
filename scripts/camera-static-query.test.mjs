import test from'node:test';import assert from'node:assert/strict';import RAPIER from'@dimforge/rapier3d-compat';import{addSavedCameraObstacles}from'./refresh-production-cameras.mjs';
await RAPIER.init();
test('camera-only refresh sees saved fin/bumper geometry but not invisible safety guards',()=>{
 const world=new RAPIER.World({x:0,y:0,z:0});try{
  const count=addSavedCameraObstacles(world,{obstacles:[{kind:'fin',shape:'box',pos:[0,0,0],quat:[0,0,0,1],size:[2,.85,.14]},{kind:'guard',shape:'box',pos:[5,0,0],quat:[0,0,0,1],size:[2,4,.1]},{kind:'bumper',pos:[-5,0,0],quat:[0,0,0,1],radius:.3,height:.8}]});
  assert.equal(count,2);world.step();
  const hit=x=>world.castRay(new RAPIER.Ray({x,y:0,z:2},{x:0,y:0,z:-1}),4,true);
  assert.ok(hit(0),'fin was invisible to camera repair');assert.ok(hit(-5),'bumper was invisible to camera repair');assert.equal(hit(5),null,'invisible safety guard incorrectly blocks shot');
 }finally{world.free();}
});


test('replay occlusion uses the same visible mechanism bounds and excludes invisible guards',async()=>{
 const{createCameraOcclusion}=await import('../src/gp/camera-occlusion.js');
 const{default:italy}=await import('../src/gp/circuits/r8-tuscany.js');const{worldRushRound}=await import('../src/gp/circuits/world-rush.js');
 process.env.GP_CARS='0';const{buildCourse}=await import('./season.mjs');const course=buildCourse(worldRushRound(italy));
 const position=[10000,0,10000],model=createCameraOcclusion({samples:course.samples,themeId:'italy',obstacles:[{kind:'fin',size:[2,.85,.14],pos:position,quat:[0,0,0,1]},{kind:'guard',size:[2,4,.1],pos:[10005,0,10000],quat:[0,0,0,1]}]});
 assert.equal(model.counts['mechanism-fin'],1);assert.equal(model.counts['mechanism-guard'],undefined);
 assert.equal(model.blockedBy([10000,0,10002],[10000,0,9998]),'mechanism-fin');
});
