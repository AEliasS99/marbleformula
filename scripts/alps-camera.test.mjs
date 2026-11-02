import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sceneryLayout} from '../src/gp/scenery-layout.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
import {directRace} from './race-director.mjs';
import {buildTrackMesh} from '../src/gp/trackMesh.js';
import RAPIER from '@dimforge/rapier3d-compat';
import {PerspectiveCamera,Vector3} from 'three';
const data=JSON.parse(readFileSync(new URL('../out/tcr/alps/heat-1.json',import.meta.url)));
const at=u=>{const s=data.samples,x=Math.max(0,Math.min(s.length-1.001,(u+9.5)/.5)),k=Math.floor(x),a=x-k,A=s[k],B=s[k+1];return {u,...Object.fromEntries(['p','t','r','n'].map(key=>[key,A[key].map((v,j)=>v+(B[key][j]-v)*a)])),w:A.w+(B.w-A.w)*a};};
const scene=createCameraOcclusion({samples:data.samples,themeId:'alps',finishFrame:at(data.info.finish),width:2*at(data.info.finish).w});
test('Alpes heat1 authored scenery placement stays byte-identical after shared extraction',()=>{
 assert.equal(createHash('sha256').update(JSON.stringify(sceneryLayout(data.samples))).digest('hex'),'4cf9998ebe2ace65478364108cf9dcd492bed36222bd9c6dbb5de5f24936b0e5');
 assert.deepEqual(Object.fromEntries(['props','ring','alpsTrackFlags','alpsPastures','alpsGondolas'].map(k=>[k,scene.layout[k].length])),{props:41,ring:49,alpsTrackFlags:119,alpsPastures:93,alpsGondolas:21});
 for(const kind of ['chalet','chalet-roof','pine-canopy','gondola','cable','finish-beam','mountain','meadow'])assert.ok(scene.counts[kind]>0,kind);
});
function coverage(cams){const lens=new PerspectiveCamera(40,16/9,.05,1500);const findings=[];let empty=0,checked=0;const last=Math.max(...data.marbles.map(m=>m.finishFrame).filter(Number.isFinite));for(let f=data.timeline.raceStart+120;f<=last;f++){const racers=data.marbles.map((m,i)=>({m,i})).filter(({m})=>(m.finishFrame===null||m.finishFrame>f)&&(m.dqFrame==null||m.dqFrame>f));if(!racers.length)continue;checked++;const c=cams[f],from=c.slice(0,3);lens.position.set(...from);lens.lookAt(...c.slice(3,6));lens.fov=c[6];lens.updateProjectionMatrix();lens.updateMatrixWorld();const seen=racers.map(({i})=>{const p=data.frames[f][i].slice(0,3),ndc=new Vector3(...p).project(lens);return {i,on:ndc.z>-1&&ndc.z<1&&Math.abs(ndc.x)<.9&&Math.abs(ndc.y)<.9,blocked:scene.blockedBy(from,p)};});if(!seen.some(s=>s.on))empty++;if(!seen.some(s=>s.on&&!s.blocked))findings.push({f,kind:c[7],blocked:seen.filter(s=>s.on).map(s=>s.blocked)});}return {checked,empty,blockedFrames:findings.length,examples:findings.slice(0,20)};}
test('camera-only regeneration respects the full original Alpes heat1 Swiss scenery',async()=>{
 await RAPIER.init();const world=new RAPIER.World({x:0,y:0,z:0}),mesh=buildTrackMesh(data.samples).physics;world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices));world.step();try{
 const args={world,vehicle:data.info.vehicle,themeId:'alps',course:{L:data.info.length,END:data.info.trackEnd,uFinish:data.info.finish,samples:data.samples,frameAt:at,features:data.features},frames:data.frames,finishFrame:data.marbles.map(m=>m.finishFrame??m.dqFrame??null),crossingFrames:data.marbles.map(m=>m.finishFrame),events:data.events,raceStart:data.timeline.raceStart,winnerFrame:Math.min(...data.marbles.map(m=>m.finishFrame).filter(Number.isFinite)),lastFrame:data.frames.length-1,rand:()=>.5,highlights:data.timeline.highlights,elevators:data.elevators};
 const ctx={FPS:data.fps,MARBLES:data.marbles,LAPS:data.info.laps,R:data.marbleRadius,GRID_LENGTH:9.5,QUERY_TRACK_ONLY:undefined,CAM_FEATURES:['vortex','hammer','spinner','bumpers','turntable','pusher','rollers','jump']};
 const result=directRace(args,ctx),before=coverage(data.cams),after=coverage(result.cams);const jumps=[];for(let f=1;f<result.cams.length;f++){if(result.shots.some(s=>s.start===f))continue;const dist=Math.hypot(...result.cams[f].slice(0,3).map((v,i)=>v-result.cams[f-1][i]));if(dist>1)jumps.push({f,dist});}const winner=data.marbles.findIndex(m=>m.finishFrame===args.winnerFrame),replayBlocked=[];for(let f=data.timeline.replay.from;f<=data.timeline.replay.to;f++){const p=data.frames[Math.min(f,data.marbles[winner].finishFrame)][winner].slice(0,3);const block=scene.blockedBy(result.replayCam,p);if(block)replayBlocked.push({f,block});}console.log(JSON.stringify({jumps:jumps.slice(0,15),jumpCount:jumps.length,replayBlocked:replayBlocked.slice(0,10),replayBlockedCount:replayBlocked.length}));mkdirSync('out/camera-audit',{recursive:true});writeFileSync('out/camera-audit/alps-heat1-themed.json',JSON.stringify({before,after,audit:result.framingAudit,shots:result.shots},null,2));writeFileSync('out/camera-audit/alps-heat1-cameras.json',JSON.stringify(result));console.log(JSON.stringify({before,after,audit:result.framingAudit}));assert.equal(after.empty,0);assert.equal(after.blockedFrames,0);assert.equal(jumps.length,0);assert.equal(replayBlocked.length,0);assert.deepEqual(result.framingAudit.unresolvedOcclusionFrames,[]);assert.deepEqual(result.framingAudit.unresolvedFramingFrames,[]);
 }finally{world.free();}
});
