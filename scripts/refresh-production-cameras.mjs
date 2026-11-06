// Camera-only repair of an isolated review snapshot. No car/marble simulation.
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import RAPIER from '@dimforge/rapier3d-compat';
import {buildTrackMesh} from '../src/gp/trackMesh.js';
import {directRace,cameraRandom} from './race-director.mjs';

const CAMERA_FIELDS=['cams','shots','cameraAudit','replayCam','highlightCams','splits','heli'];
export const nonCameraHash=data=>createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(data).filter(([key])=>!CAMERA_FIELDS.includes(key))))).digest('hex');

// Reconstruct opaque saved mechanisms for visibility queries only. Invisible
// safety guards are deliberately omitted; no racer bodies or simulation run.
export function addSavedCameraObstacles(world,data){
 let count=0;
 for(const o of data.obstacles??[]){
  if(o.kind==='guard')continue;
  let shape;
  if(o.shape==='convex'&&o.vertices?.length>=12)shape=RAPIER.ColliderDesc.convexHull(new Float32Array(o.vertices));
  else if(o.size?.length===3&&o.size.every(n=>Number.isFinite(n)&&n>0))shape=RAPIER.ColliderDesc.cuboid(...o.size.map(n=>n/2));
  else if(o.radius>0&&o.height>0)shape=RAPIER.ColliderDesc.cylinder(o.height/2,o.radius);
  else throw Error('Cannot approve camera without saved visible obstacle bounds: '+o.kind);
  if(!o.pos?.every(Number.isFinite)||!o.quat?.every(Number.isFinite))throw Error('Invalid saved camera obstacle pose');
  shape.setTranslation(...o.pos).setRotation({x:o.quat[0],y:o.quat[1],z:o.quat[2],w:o.quat[3]});world.createCollider(shape);count++;
 }return count;
}

export async function refreshProductionCameras(data){
  const samples=data.samples;
  const at=u=>{
    // Saved samples carry their real longitudinal coordinates; do not assume
    // another circuit's origin or sample spacing.
    let low=0,high=samples.length-1;
    while(low+1<high){const mid=(low+high)>>1;if(samples[mid].u<=u)low=mid;else high=mid;}
    const A=samples[low],B=samples[high],a=Math.max(0,Math.min(1,(u-A.u)/(B.u-A.u)));
    return {u,...Object.fromEntries(['p','t','r','n'].map(key=>[key,A[key].map((v,j)=>v+(B[key][j]-v)*a)])),w:A.w+(B.w-A.w)*a};
  };
  const rand=cameraRandom(data.seed,data.id);
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:0,z:0});
  try{
    const mesh=buildTrackMesh(samples).physics;
    world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices));
    const visibleStaticObstacles=addSavedCameraObstacles(world,data);
    world.step(); // Initializes the static query tree only; there are no actors.
    const result=directRace({sceneProps:data.sceneProps,sceneryProfile:data.info.sceneryProfile,cockpitEnabled:data.carConditions?.racecraft?.cockpitCamera===true,cockpitPresentation:data.carConditions?.racecraft?.cockpitPresentation,world,vehicle:data.info.vehicle,themeId:({'r1-monaco':'alps','r2-silverstone':'cairo','r3-spa':'sydney','r4-suzuka':'newyork','r5-monza':'tokyo','r6-barcelona':'spain','r7-coffeeandes':'colombia','r8-tuscany':'italy','r9-blackforest':'germany','r10-britain':'britain','r11-provence':'france','r12-wachau':'austria','r13-jaipur':'india'})[data.id],course:{L:data.info.length,END:data.info.trackEnd,uFinish:data.info.finish,samples,frameAt:at,features:data.features},frames:data.frames,finishFrame:data.marbles.map(m=>m.finishFrame??m.dqFrame??null),crossingFrames:data.marbles.map(m=>m.finishFrame),events:data.events,actionMoments:data.carIncidents||[],raceStart:data.timeline.raceStart,winnerFrame:Math.min(...data.marbles.map(m=>m.finishFrame).filter(Number.isFinite)),lastFrame:data.frames.length-1,rand,highlights:data.timeline.highlights,elevators:data.elevators,checkpoints:data.checkpoints,gate:data.gate},{FPS:data.fps,MARBLES:data.marbles,LAPS:data.info.laps,R:data.marbleRadius,GRID_LENGTH:9.5,QUERY_TRACK_ONLY:undefined,CAM_FEATURES:['vortex','hammer','spinner','bumpers','turntable','pusher','rollers','jump','car-chicane']});
    const updated={...data,...Object.fromEntries(CAMERA_FIELDS.filter(k=>k!=='cameraAudit').map(k=>[k,result[k]])),cameraAudit:{...result.framingAudit,visibleStaticObstacles}};
    if(nonCameraHash(data)!==nonCameraHash(updated))throw Error('Camera refresh altered non-camera data');
    return updated;
  }finally{world.free();}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const path=resolve(process.argv[2]??'');
  if(!['out/tcr/alps-review','out/tcr/track-review'].some(root=>path.startsWith(resolve(root)+'/'))||!path.endsWith('/race.json'))throw Error('Only isolated out/tcr/alps-review/*/race.json snapshots can be refreshed');
  const original=JSON.parse(readFileSync(path,'utf8')),updated=await refreshProductionCameras(original);
  const report={nonCameraHash:nonCameraHash(updated),before:original.cameraAudit,after:updated.cameraAudit};
  if(updated.cameraAudit.unresolvedFramingFrames.length||updated.cameraAudit.unresolvedOcclusionFrames.length){
    // Preserve diagnostic evidence without promoting a failed camera candidate.
    if(process.argv.includes('--write')){
      writeFileSync(resolve(dirname(path),'camera-refresh-failed.json'),JSON.stringify(report,null,2));
      writeFileSync(resolve(dirname(path),'camera-candidate-failed.json'),JSON.stringify(updated));
    }
    throw Error(`Camera repair still requires review: ${JSON.stringify(report.after)}`);
  }
  if(process.argv.includes('--write')){
    writeFileSync(path+'.camera-tmp',JSON.stringify(updated));renameSync(path+'.camera-tmp',path);
    const checksPath=resolve(dirname(path),'checks.json');
    if(existsSync(checksPath)){const checks=JSON.parse(readFileSync(checksPath,'utf8'));checks.camera=updated.cameraAudit;writeFileSync(checksPath,JSON.stringify(checks,null,2));}
    writeFileSync(resolve(dirname(path),'camera-refresh.json'),JSON.stringify(report,null,2));
  }
  console.log(JSON.stringify({...report,written:process.argv.includes('--write')},null,2));
}
