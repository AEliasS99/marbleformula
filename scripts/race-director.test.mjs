import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {PerspectiveCamera,Vector3} from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {buildTrackMesh} from '../src/gp/trackMesh.js';
import {directRace,finishCoverageWindows,liveRaceEndFrame,selectActionWindows} from './race-director.mjs';
test('real loss of control gets a camera slot over nearby routine passes; elimination remains highest priority',()=>{
 const pass={start:100,overtake:true},slide={start:160,feature:'slide'},anotherPass={start:210,overtake:true},dq={start:220,dq:true},later={start:600,overtake:true};
 assert.deepEqual(selectActionWindows([pass,slide,anotherPass,later],228),[slide,later]);
 assert.deepEqual(selectActionWindows([dq,slide,pass,anotherPass,later],228),[dq,later]);
});
export function fixture(data){
 const samples=data.samples;
 const frameAt=u=>{const x=Math.max(0,Math.min(samples.length-1.001,(u+9.5)/.5)),k=Math.floor(x),a=x-k,A=samples[k],B=samples[k+1];return {u,...Object.fromEntries(['p','t','r','n'].map(key=>[key,A[key].map((v,j)=>v+(B[key][j]-v)*a)])),w:A.w+(B.w-A.w)*a};};
 const ctx={FPS:data.fps,MARBLES:data.marbles,LAPS:data.info.laps,R:data.marbleRadius,GRID_LENGTH:9.5,QUERY_TRACK_ONLY:undefined,CAM_FEATURES:['vortex','hammer','spinner','bumpers','turntable','pusher','rollers','jump']};
 const args={course:{L:data.info.length,END:data.info.trackEnd,uFinish:data.info.finish,samples,frameAt,features:data.features},frames:data.frames,finishFrame:data.marbles.map(m=>m.finishFrame??m.dqFrame??null),crossingFrames:data.marbles.map(m=>m.finishFrame),events:data.events,raceStart:data.timeline.raceStart,winnerFrame:Math.min(...data.marbles.map(m=>m.finishFrame).filter(Number.isFinite)),lastFrame:data.frames.length-1,rand:()=>.5,highlights:data.timeline.highlights,elevators:data.elevators};return {args,ctx};
}
export function framing(data,cams){const lens=new PerspectiveCamera(40,16/9,.05,1500);let empty=0,activeFrames=0,leaderMissing=0;const emptyAt=[];const end=Math.max(...data.marbles.map(m=>m.finishFrame).filter(Number.isFinite));for(let f=data.timeline.raceStart+data.fps*2;f<=end;f++){const active=data.marbles.map((m,i)=>({m,i})).filter(({m})=>(m.finishFrame===null||m.finishFrame>f)&&(m.dqFrame===null||m.dqFrame===undefined||m.dqFrame>f)).sort((a,b)=>data.frames[f][b.i][7]-data.frames[f][a.i][7]);if(!active.length)continue;activeFrames++;const c=cams[f];lens.position.set(...c.slice(0,3));lens.lookAt(...c.slice(3,6));lens.fov=c[6];lens.updateProjectionMatrix();lens.updateMatrixWorld();const visible=i=>{const p=new Vector3(...data.frames[f][i].slice(0,3)).project(lens);return p.z>-1&&p.z<1&&Math.abs(p.x)<.9&&Math.abs(p.y)<.9;};if(!active.some(({i})=>visible(i))){empty++;emptyAt.length<12&&emptyAt.push([f,c[7]]); }if(!visible(active[0].i))leaderMissing++;}return {empty,activeFrames,leaderMissing,emptyAt};}
test('saved car telemetry camera audit: deterministic, no transport shots, all live frames covered and real crossings shown',async()=>{
 await RAPIER.init();const data=JSON.parse(readFileSync(new URL('../src/gp/races/r1-monaco.json',import.meta.url)));const {args,ctx}=fixture(data);const mesh=buildTrackMesh(data.samples).physics;const world=new RAPIER.World({x:0,y:0,z:0});world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices));world.step();
 try{const a=directRace({...args,world},ctx),b=directRace({...args,world},ctx);assert.deepEqual(a,b);assert.equal(a.cams.length,data.frames.length);assert.ok(a.cams.every(c=>c.slice(0,7).every(Number.isFinite)));assert.ok(a.shots.every(s=>!['lift','elevator','approach'].includes(s.kind)));assert.ok(a.splits.every(s=>s.kind!=='lift'));assert.equal(a.framingAudit.unresolvedOcclusionFrames.length,0);
 for(const frame of args.crossingFrames.filter(Number.isFinite)){assert.equal(a.cams[frame][7],'finish');}
 const before=framing(data,data.cams),after=framing(data,a.cams);assert.ok(after.empty<before.empty*.2,JSON.stringify({before,after}));
 mkdirSync('out/camera-audit',{recursive:true});writeFileSync('out/camera-audit/legacy-director.json',JSON.stringify({before,after,framingAudit:a.framingAudit,shots:a.shots},null,2));console.log(JSON.stringify({before,after,corrections:a.framingAudit.correctedFrames,unresolvedOcclusions:a.framingAudit.unresolvedOcclusionFrames.length}));
 }finally{world.free();}
});

test('other saved car rounds retain active coverage without transport inserts',async()=>{
 await RAPIER.init();
 for(const file of ['r2-silverstone','r3-spa','r4-suzuka','r5-monza']){
  const data=JSON.parse(readFileSync(new URL('../src/gp/races/'+file+'.json',import.meta.url)));const {args,ctx}=fixture(data);const mesh=buildTrackMesh(data.samples).physics,world=new RAPIER.World({x:0,y:0,z:0});world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices));world.step();
  try{const result=directRace({...args,world},ctx),after=framing(data,result.cams);assert.equal(after.empty,0,JSON.stringify({file,after}));assert.ok(result.shots.every(s=>!['elevator','approach','lift'].includes(s.kind)));assert.equal(result.framingAudit.unresolvedOcclusionFrames.length,0);console.log(JSON.stringify({file,after,occlusions:result.framingAudit.unresolvedOcclusionFrames.length}));}finally{world.free();}
 }
});

test('marble transport audit on preserved sibling bake',async(t)=>{
 let data;try{data=JSON.parse(readFileSync(new URL('../../marble/src/gp/races/r1-monaco.json',import.meta.url)));}catch{t.skip('Sibling marble bake not present');return;}
 await RAPIER.init();const {args,ctx}=fixture(data);const mesh=buildTrackMesh(data.samples).physics,world=new RAPIER.World({x:0,y:0,z:0});world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices));world.step();
 try{const result=directRace({...args,world},ctx);assert.ok(result.shots.every(s=>!['elevator','approach','lift'].includes(s.kind)));assert.ok(result.splits.every(s=>s.kind!=='lift'));assert.equal(result.framingAudit.unresolvedOcclusionFrames.length,0);assert.equal(framing(data,result.cams).empty,0);assert.ok(result.cams.every(c=>c.slice(0,7).every(Number.isFinite)));console.log(JSON.stringify({marbleFraming:framing(data,result.cams),occlusions:result.framingAudit.unresolvedOcclusionFrames}));writeFileSync('out/camera-audit/marble-director.json',JSON.stringify({audit:result.framingAudit,shots:result.shots}));}finally{world.free();}
});

test('finish camera covers close battles but releases the line in long finisher gaps',()=>{
 const windows=finishCoverageWindows([600,620,null,1800],60,120,1900);
 assert.deepEqual(windows,[{start:492,end:674},{start:1692,end:1854}]);
 assert.ok(!windows.some(w=>1000>=w.start&&1000<w.end),'late racers keep coverage while the line is empty');
});

test('live timeline includes every measured finisher, including late arrivals',()=>{
 assert.equal(liveRaceEndFrame(2000,[600,null,620,1800],600,60),1920);
 assert.equal(liveRaceEndFrame(1850,[600,null,1800],600,60),1850);
});
