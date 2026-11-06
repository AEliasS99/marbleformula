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

test('recorded Italy start hinge rejects a partially hidden marble despite its clear centre',async()=>{
 const {readFileSync}=await import('node:fs');
 const {createCameraOcclusion,marbleBodyVisible}=await import('../src/gp/camera-occlusion.js');
 const d=JSON.parse(readFileSync(new URL('./fixtures/italy-start-hinge-camera.json',import.meta.url)));
 const model=createCameraOcclusion(d);
 assert.equal(model.blockedBy(d.camera,d.subject),null,'recorded centre ray is clear');
 assert.equal(marbleBodyVisible(model,d.camera,d.subject,d.radius),false,'native exported hinge obstruction must fail');
 const noGate=createCameraOcclusion({...d,gate:undefined});
 assert.equal(marbleBodyVisible(noGate,d.camera,d.subject,d.radius),true,'negative control confirms missing static gate caused the false pass');
 const elevated=[d.subject[0],d.subject[1]+3,d.subject[2]];
 assert.equal(marbleBodyVisible(model,elevated,d.subject,d.radius),true,'clear view must remain usable');
 assert.equal(model.counts['start-hinge'],1);
});

test('replay gate also rejects the recorded marble hinge obstruction',async()=>{
 const {readFileSync}=await import('node:fs');
 const {createCameraOcclusion}=await import('../src/gp/camera-occlusion.js');
 const {auditReplay}=await import('./prepare-replay-camera.mjs');
 const d=JSON.parse(readFileSync(new URL('./fixtures/italy-start-hinge-camera.json',import.meta.url)));
 const data={info:{vehicle:'marble'},marbleRadius:d.radius,marbles:[{finishFrame:0}],timeline:{replay:{at:0},results:{at:1}}};
 const race={marblePose:()=>({pos:d.subject,quat:[0,0,0,1]}),mainView:{tAt:f=>f},shotAt:()=>({pos:d.camera,target:d.subject,fov:48})};
 const blocked=auditReplay(data,race,createCameraOcclusion(d));
 assert.equal(blocked.passed,false);assert.equal(blocked.blockedOrOutOfFrame,5);
 assert.equal(auditReplay(data,race,createCameraOcclusion({...d,gate:undefined})).passed,true);
});
