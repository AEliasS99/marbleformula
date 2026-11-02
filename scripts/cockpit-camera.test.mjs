import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {Vector3,Quaternion,Euler,Mesh,MeshBasicMaterial,Raycaster} from 'three';
import {cockpitCamera,DRIVER_EYE} from '../src/gp/car-cockpit.js';
import {refreshProductionCameras,nonCameraHash} from './refresh-production-cameras.mjs';

test('driver eye is attached inside the seat and follows the actual chassis heading',()=>{
 const q=new Quaternion().setFromEuler(new Euler(.1,Math.PI/2,.08)),p=[12,7,-4],camera=cockpitCamera(p,q.toArray());
 const expected=new Vector3(...DRIVER_EYE).applyQuaternion(q).add(new Vector3(...p));
 assert.ok(expected.distanceTo(new Vector3(...camera.pos))<1e-9);
 assert.ok(new Vector3(...camera.pos).distanceTo(new Vector3(...p))<.1,'not a chase or roof camera');
 assert.ok(new Vector3(...camera.target).sub(new Vector3(...camera.pos)).normalize().dot(new Vector3(1,0,0).applyQuaternion(q))>.99);
 const tilted=cockpitCamera(p,new Quaternion().setFromAxisAngle(new Vector3(1,0,0),Math.PI/2).toArray());
 assert.ok(new Vector3(...tilted.up).dot(new Vector3(0,1,0))>.95,'roll-stabilized horizon');
});

async function loadSource(entry){
 const path=resolve('out/tcr',`.cockpit-${randomUUID()}.mjs`),result=await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',packages:'external',write:false});
 writeFileSync(path,result.outputFiles[0].text);try{return await import(pathToFileURL(path).href);}finally{unlinkSync(path);}
}

test('the actual four car hulls leave the driver forward view open',async()=>{
 const {createCarGeometries}=await loadSource('src/gp/CarModel.tsx'),geometries=createCarGeometries();
 try{
  for(const options of [{},{presentation:'race-seat-v2'}]){
   const camera=cockpitCamera([0,0,0],[0,0,0,1],options);
  for(const [style,hull]of geometries.hulls.entries()){
   const mesh=new Mesh(hull,new MeshBasicMaterial());mesh.scale.set(1.22,.92,1.05);mesh.updateMatrixWorld();
   const ray=new Raycaster(new Vector3(...camera.pos),new Vector3(...camera.target).sub(new Vector3(...camera.pos)).normalize(),.018,2);
   assert.equal(ray.intersectObject(mesh).length,0,`style${style} hull blocks the eye`);mesh.material.dispose();
  }}
 }finally{for(const value of Object.values(geometries))for(const g of Array.isArray(value)?value:[value])g?.dispose?.();}
});

const fixture='out/tcr/alps-review/alps-heat1-turbo-v24-seed46/race.json';
test('motion-blur subframes keep the camera attached to the interpolated car pose',{skip:!existsSync(fixture)},async()=>{
 const {buildRace}=await loadSource('src/gp/race.ts'),d=JSON.parse(readFileSync(fixture));
 for(let f=1000;f<1120;f++){d.cams[f][7]='cockpit';d.cams[f][8]=1;}
 const race=buildRace(d);
 for(const t of [1000-.0875,1000+.0875,1050.35]){
  const shot=race.shotAt(t),pose=race.marblePose(1,race.mainView.tAt(t)),expected=cockpitCamera(pose.pos,pose.quat);
  assert.equal(shot.kind,'cockpit');assert.equal(shot.marble,1);
  assert.ok(new Vector3(...shot.pos).distanceTo(new Vector3(...expected.pos))<1e-9);
 }
});

test('full saved Swiss production gains short audited cockpit shots without changing physics',{skip:!existsSync(fixture),timeout:600000},async()=>{
 const d=JSON.parse(readFileSync(fixture));d.carConditions.racecraft.cockpitCamera=true;
 const before=nonCameraHash(d),updated=await refreshProductionCameras(d),shots=updated.shots.filter(s=>s.kind==='cockpit');
 assert.equal(nonCameraHash(updated),before);assert.ok(shots.length>0);
 assert.equal(updated.cameraAudit.unresolvedFramingFrames.length,0);assert.equal(updated.cameraAudit.unresolvedOcclusionFrames.length,0);
 for(const sh of shots){
  assert.ok(sh.end-sh.start>=120&&sh.end-sh.start<=156);
  for(let f=sh.start;f<sh.end;f++){
   assert.equal(updated.cams[f][7],'cockpit');assert.equal(updated.cams[f][8],sh.marble);
   const row=d.frames[f][sh.marble],expected=cockpitCamera(row.slice(0,3),row.slice(3,7));
   assert.ok(new Vector3(...updated.cams[f].slice(0,3)).distanceTo(new Vector3(...expected.pos))<.001);
  }
 }
 console.log(JSON.stringify({cockpitShots:shots.length,cockpitFrames:updated.cameraAudit.cockpitFrames,unchangedPhysics:true}));
});
