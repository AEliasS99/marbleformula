// Validate the existing production's replay against the actual saved winner,
// gantry, scenery and complete car bounds. Never rebakes or edits race.json.
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {PerspectiveCamera,Vector3,Quaternion} from 'three';
import {createCameraOcclusion,carBodyVisible,marbleBodyVisible,CAR_CAMERA_BOUNDS} from '../src/gp/camera-occlusion.js';

export function replayOcclusion(data){
 const samples=data.samples;
 const at=u=>{
  let lo=0,hi=samples.length-1;
  while(hi-lo>1){const m=(lo+hi)>>1;if(samples[m].u<=u)lo=m;else hi=m;}
  const a=samples[lo],b=samples[hi],k=Math.max(0,Math.min(1,(u-a.u)/(b.u-a.u)));
  return {u,...Object.fromEntries(['p','t','r','n'].map(key=>[key,a[key].map((v,i)=>v+(b[key][i]-v)*k)])),w:a.w+(b.w-a.w)*k};
 };
 const finish=at(data.info.finish),themeId=({'r7-coffeeandes':'colombia','r8-tuscany':'italy','r9-blackforest':'germany','r10-britain':'britain','r11-provence':'france','r12-wachau':'austria','r13-jaipur':'india','r6-barcelona':'spain','r1-monaco':'alps','r5-monza':'tokyo','r2-silverstone':'cairo','r3-spa':'sydney','r4-suzuka':'newyork'})[data.id];
 return {finish,model:createCameraOcclusion({samples,themeId,finishFrame:finish,width:2*finish.w,checkpoints:data.checkpoints,sceneryProfile:data.info.sceneryProfile,courseLength:data.info.length,obstacles:data.obstacles,sceneProps:data.sceneProps,gate:data.gate})};
}

export function replaySubjectBounds(data,winner){
 if(data.info?.vehicle==='marble'){
  const r=data.marbleRadius;
  if(!(r>0&&Number.isFinite(r)))throw Error('Marble replay needs the actual sphere radius');
  return {min:[-r,-r,-r],max:[r,r,r]};
 }
 const style=({F1:0,GT:1,BGY:2,JET:3})[data.marbles[winner].stats.cls];
 return CAR_CAMERA_BOUNDS[style];
}
export function auditReplay(data,race,model,{stride=1,offsets=[-.175,-.0875,0,.0875,.175]}={}){
 const winner=data.marbles.reduce((best,m,i)=>m.finishFrame!==null&&(best<0||m.finishFrame<data.marbles[best].finishFrame)?i:best,-1);
 if(winner<0)throw Error('Replay needs a completed actual winner');
 const marble=data.info?.vehicle==='marble';
 const style=({F1:0,GT:1,BGY:2,JET:3})[data.marbles[winner].stats?.cls],bounds=replaySubjectBounds(data,winner);
 const lens=new PerspectiveCamera(42,16/9,.05,1500),corners=[];
 for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]])corners.push(new Vector3(x,y,z));
 let samples=0,failed=0,minimumBodyPixels=Infinity;const examples=[];
 for(let f=data.timeline.replay.at;f<data.timeline.results.at;f+=stride)for(const offset of offsets){
  const frame=f+offset,pose=race.marblePose(winner,race.mainView.tAt(frame)),shot=race.shotAt(frame);
  lens.position.set(...shot.pos);lens.up.set(...(shot.up??[0,1,0]));lens.lookAt(...shot.target);lens.fov=shot.fov;lens.updateProjectionMatrix();lens.updateMatrixWorld();
  const q=new Quaternion(...pose.quat),points=corners.map(p=>p.clone().applyQuaternion(q).add(new Vector3(...pose.pos)).project(lens));
  const visible=marble?marbleBodyVisible(model,shot.pos,pose.pos,data.marbleRadius):carBodyVisible(model,shot.pos,pose.pos,pose.quat,style),framed=points.every(p=>p.z>-1&&p.z<1&&Math.abs(p.x)<.88&&Math.abs(p.y)<.86);
  const width=(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)))*1920,height=(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)))*1080;
  const readable=width>=(marble?40:48)&&height>=(marble?40:18);minimumBodyPixels=Math.min(minimumBodyPixels,width,height);samples++;
  if(!visible||!framed||!readable){failed++;if(examples.length<6)examples.push({frame:f,offset,visible,framed,readable,width,height});}
 }
 return {passed:failed===0,replaySamples:samples,blockedOrOutOfFrame:failed,minimumBodyPixels,examples};
}

async function loadBuilder(entry){
 const file=resolve('out/tcr',`.replay-builder-${randomUUID()}.mjs`),compiled=await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',packages:'external',write:false});
 fs.writeFileSync(file,compiled.outputFiles[0].text);
 try{return (await import(pathToFileURL(file).href)).buildRace;}finally{fs.unlinkSync(file);}
}
export async function prepareReplayCamera(directory){
 const base=resolve(directory),read=p=>JSON.parse(fs.readFileSync(p)),digest=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const readyPath=base+'/ready.json',r=read(readyPath),data=read(base+'/race.json'),raceSha256=digest(base+'/race.json');
 if(r.status!=='prepared'||r.raceSha256!==raceSha256||fs.existsSync(r.output))throw Error('Preserve existing production; replay gate requires a prepared immutable race');
 const entry=r.entry,source=base+'/'+(r.sourceSnapshot??'source')+'/gp/race.ts',builder=await loadBuilder(source),before=builder(data),{finish,model}=replayOcclusion(data);
 const original=auditReplay(data,before,model),candidates=[];
 if(original.passed)candidates.push({pos:data.replayCam,fov:30});
 if(data.info.vehicle==='marble')for(const height of [1.5,2.4,3.5,5])for(const side of [2.5,-2.5,4,-4,6,-6])for(const along of [-4,4,-7,7])candidates.push({pos:finish.p.map((v,i)=>v+finish.r[i]*side+finish.t[i]*along+(i===1?height:0)),fov:42});
 for(const height of [6,9,12,16])for(const side of [8,-8,12,-12,18,-18])for(const along of [-10,10,-18,18])candidates.push({pos:finish.p.map((v,i)=>v+finish.r[i]*side+finish.t[i]*along+(i===1?height:0)),fov:42});
 // Wider finish approaches support faster saved races whose replay begins farther upstream.
 for(const height of [6,9,12,16])for(const side of [8,-8,12,-12,18,-18])for(const along of [-25,25,-35,35])candidates.push({pos:finish.p.map((v,i)=>v+finish.r[i]*side+finish.t[i]*along+(i===1?height:0)),fov:42});
 let chosen,checked,after;
 // buildRace caches the full race. Only this replay override is varied; avoid
 // rebuilding all live poses and standings for every candidate.
 const candidateData={...data},next=builder(candidateData);
 for(const candidate of candidates){
  candidateData.replayCamera=candidate;
  if(!auditReplay(data,next,model,{stride:3,offsets:[0]}).passed)continue;
  const full=auditReplay(data,next,model);if(!full.passed)continue;
  chosen=candidate;checked=full;after=next;break;
 }
 if(!chosen)throw Error('No replay rig clears the entire actual race replay; preserve seed and repair camera');
 let unchangedNonReplayFrames=0;
 for(let f=0;f<data.timeline.total;f++){
  if(f>=data.timeline.replay.at&&f<data.timeline.results.at)continue;
  if(JSON.stringify(before.shotAt(f))!==JSON.stringify(after.shotAt(f)))throw Error('Replay override changed live coverage');
  unchangedNonReplayFrames++;
 }
 const text=fs.readFileSync(entry,'utf8');
 if(!text.includes("import data from './race.json';")||!text.includes('data:data as unknown as RoundData'))throw Error('Unexpected entry; preserve it for investigation');
 if(fs.existsSync(base+'/entry-before-replay-gate.tsx'))throw Error('Replay gate already applied; verify its evidence instead of overwriting');
 fs.copyFileSync(entry,base+'/entry-before-replay-gate.tsx');
 fs.writeFileSync(base+'/replay-camera.json',JSON.stringify(chosen,null,2)+'\n');
 fs.writeFileSync(entry,text.replace("import data from './race.json';","import originalData from './race.json';\nimport replayCamera from './replay-camera.json';\nconst data = {...originalData,replayCamera};"));
 const report={...checked,replayGateScriptSha256:digest(new URL(import.meta.url)),vehicle:data.info.vehicle,originalBlockedSamples:original.blockedOrOutOfFrame,unchangedNonReplayFrames,chosen,raceSha256,sourceSha256:digest(source),rigSha256:digest(base+'/replay-camera.json'),entrySha256:digest(entry),rule:'Actual subject bounds, finish/scenery occlusion and framing at five times per replay frame; no changes to physics or live cameras'};
 if(digest(base+'/race.json')!==raceSha256)throw Error('Physical race changed');
 fs.writeFileSync(base+'/replay-camera-check.json',JSON.stringify(report,null,2)+'\n');
 const checks=read(base+'/checks.json');checks.replay=report;fs.writeFileSync(base+'/checks.json',JSON.stringify(checks,null,2)+'\n');
 r.replayCameraGate={result:'passed',report:'replay-camera-check.json',raceSha256,rigSha256:report.rigSha256,entrySha256:report.entrySha256};
 fs.writeFileSync(readyPath,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(!process.argv[2])throw Error('Expected an existing prepared snapshot directory');
 await prepareReplayCamera(process.argv[2]);
}
