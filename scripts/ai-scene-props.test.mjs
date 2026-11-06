import test from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3,Vector2,Texture,SRGBColorSpace} from 'three';
import {AI_COLUMN,aiPropGeometry,aiPropMatrix,aiColumnRecord,assertAiPropRoadClearance,configureAiPropTexture} from '../src/gp/ai-scene-props.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
import {replayOcclusion} from './prepare-replay-camera.mjs';
const samples=[{u:0,p:[0,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1},{u:10,p:[10,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1}];
test('actual GLB atlas coordinates retain their image rows rather than the rejected flipped native appearance',()=>{
 const g=aiPropGeometry(AI_COLUMN),texture=configureAiPropTexture(new Texture()),flipped=new Texture(),uv=g.attributes.uv;
 assert.equal(texture.colorSpace,SRGBColorSpace);
 let controls=0;
 for(let i=0;i<uv.count;i+=71){
  const raw=new Vector2(uv.getX(i),uv.getY(i)),mapped=texture.transformUv(raw.clone());
  assert.ok(mapped.distanceTo(raw)<1e-6,'GLB image coordinate row was changed');
  if(Math.abs(raw.y-.5)>.1){assert.ok(flipped.transformUv(raw.clone()).distanceTo(raw)>.1);controls++;}
 }
 assert.ok(controls>10);g.dispose();texture.dispose();flipped.dispose();
});
test('returned carved-column geometry is finite, floor-normalized and preserves the actual mesh',()=>{
 const g=aiPropGeometry(AI_COLUMN);
 assert.equal(g.attributes.position.count,26382);assert.equal(g.index.count/3,38938);
 assert.ok(g.attributes.position.array.every(Number.isFinite));assert.ok(g.attributes.normal.array.every(Number.isFinite));assert.ok(g.attributes.uv.array.every(Number.isFinite));
 assert.ok(g.index.array.every(i=>i<g.attributes.position.count));assert.equal(g.boundingBox.min.y,0);assert.equal(g.boundingBox.max.y,1);
 assert.throws(()=>aiPropGeometry('invented'),/Unknown/);assert.throws(()=>aiColumnRecord([0,0,0],-1),/Invalid/);g.dispose();
});
test('decorative column cannot intrude into any racing level or the unsampled middle of a road segment',()=>{
 assert.doesNotThrow(()=>assertAiPropRoadClearance([aiColumnRecord([5,0,9])],samples));
 for(const y of [0,10,-10])assert.throws(()=>assertAiPropRoadClearance([aiColumnRecord([5,y,0])],samples),/road exclusion/);
});
test('camera and replay use actual column triangles, including air within its broad bounds',()=>{
 const prop=aiColumnRecord([100,10,100],3,.4),model=createCameraOcclusion({samples,themeId:'none',sceneProps:[prop]});
 const geometry=aiPropGeometry(AI_COLUMN),material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(geometry,material);
 mesh.applyMatrix4(aiPropMatrix(prop));mesh.updateMatrixWorld();
 let solid=0,air=0;
 for(const x of [-.6,-.3,0,.3,.6])for(const y of [.2,.6,1.2,1.8,2.4,2.8]){
  const from=[100+x,10+y,104],to=[100+x,10+y,96],ray=new Raycaster(new Vector3(...from),new Vector3(0,0,-1),0,8);
  const hit=ray.intersectObject(mesh).length>0;
  assert.equal(model.blockedBy(from,to),hit?'ai-'+AI_COLUMN:null);
  if(hit)solid++;else air++;
 }
 assert.ok(solid>0&&air>0,'actual carved profile must have solids and visible air');
 const replay=replayOcclusion({samples,id:'none',info:{finish:1,length:10},sceneProps:[prop]});
 assert.equal(replay.model.counts['ai-'+AI_COLUMN],1);
 assert.equal(createCameraOcclusion({samples,themeId:'none'}).counts['ai-'+AI_COLUMN],undefined,'historical races stay unchanged');
 geometry.dispose();material.dispose();
});
