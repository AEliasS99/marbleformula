import {snapshotMaterials}from'./render-assets.mjs';
// One isolated race using the existing production prepare/segmented renderer.
// Launch through factory.mjs --shared-lock and caffeinate. Never uploads.
import {carMotionReport} from './car-motion-report.mjs';
import fs from 'node:fs';import {resolve,relative} from 'node:path';
import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const statePath=resolve(process.argv[2]??'');
if(!statePath.endsWith('-job.json'))throw Error('Expected an explicit production job file');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const atomic=(p,d)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(d,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const state=read(statePath),input=resolve(state.inputRoot),base=resolve(state.ready,'..'),manifest=read(input+'/frozen-inputs.json');
const free=()=>{const s=fs.statfsSync(process.env.VIDEO_OUT);return s.bavail*s.bsize/2**30;};
const verifyFrozen=()=>{
 if(hash(input+'/frozen-inputs.json')!==state.frozenManifestSHA256)throw Error('Input manifest changed');
 for(const [p,h]of Object.entries(manifest.files))if(hash(input+'/'+p)!==h)throw Error('Frozen input changed: '+p);
};
function physicalGates(r){
 const a=read(base+'/checks.json'),d=read(base+'/race.json');
 if(r.seed!==state.seed||r.location!==state.location||r.countries.join(',')!==state.countries.join(',')||r.countries[0]!==state.host||d.marbles[0].abbr!==state.host||r.output!==state.output)throw Error('Host, roster or fixed race identity changed');
 if(r.presentationFrames>20*d.fps||d.intro.carFrames!==Math.round(1.5*d.fps))throw Error('New introduction exceeds twenty-second budget');
 if(!a.allAccountedFor||a.recoveries||a.stalls.length||!carMotionReport(d).passed||!a.pace?.passed||!a.driving?.passed||!a.cockpit?.passed||!a.islands?.passed||a.checkpoints.map(c=>c.survive).join(',')!=='10,8,6'||a.camera.unresolvedFramingFrames.length||a.camera.unresolvedOcclusionFrames.length)throw Error('Physics, driving or live camera gates failed');
}
function verifyPrepared(native=false){
 verifyFrozen();const r=read(state.ready);physicalGates(r);
 if(r.status!=='prepared'||hash(base+'/race.json')!==r.raceSha256)throw Error('Saved race must remain prepared and immutable');
 for(const[p,h]of Object.entries({...r.sourceHashes,...r.physicsSourceHashes}))if(hash(base+'/'+p)!==h)throw Error('Snapshot changed: '+p);
 for(const[p,h]of Object.entries(r.audioHashes??{}))if(hash(resolve(p))!==h)throw Error('Soundtrack changed');
 const a=read(base+'/checks.json'),gate=r.replayCameraGate;
 if(!a.replay?.passed||!gate||hash(base+'/replay-camera.json')!==gate.rigSha256||hash(r.entry)!==gate.entrySha256)throw Error('Whole replay camera gate missing or changed');
 if(!native&&['stillReview','cockpitReview','replayReview'].some(k=>r[k]?.result!=='passed'))throw Error('Actual native image inspection is required before full rendering');
 if(fs.existsSync(state.output)||fs.existsSync(state.output.replace('.mp4','.partial.mp4')))throw Error('Existing output preserved');
 if(free()<40)throw Error('Less than forty GiB free');
 return r;
}
function freeze(){
 verifyFrozen();const r=read(state.ready);physicalGates(r);
 if(fs.existsSync(base+'/source')||fs.existsSync(base+'/physics-source'))throw Error('Existing snapshot preserved; never freeze twice');
 fs.cpSync(input+'/src',base+'/source',{recursive:true});fs.cpSync(input+'/scripts',base+'/physics-source',{recursive:true});
 fs.writeFileSync(r.entry,fs.readFileSync(r.entry,'utf8').replaceAll('../../../../src/gp/GrandPrix','./source/gp/GrandPrix').replaceAll('../../../../src/gp/race','./source/gp/race'));
 r.sourceHashes=Object.fromEntries(Object.entries(manifest.files).filter(([p])=>p.startsWith('src/')).map(([p,h])=>['source/'+p.slice(4),h]));
 r.physicsSourceHashes=Object.fromEntries(Object.entries(manifest.files).filter(([p])=>p.startsWith('scripts/')).map(([p,h])=>['physics-source/'+p.slice(8),h]));
 r.renderAssets=snapshotMaterials(resolve('public/materials'),base+'/render-assets/materials',base);
 Object.assign(r,{raceSha256:hash(base+'/race.json'),frozenInputs:relative(process.cwd(),input),sourceSnapshot:'source',requireReplayGate:true,publicationBlocked:true,hostCountry:state.host,logPath:state.renderLog});
 const name=state.output.split('/').at(-1).replace('-4k.mp4','');r.audioHashes=Object.fromEntries([`public/gp/${name}.wav`,`public/gp/${name}-intro.wav`].map(p=>[p,hash(p)]));atomic(state.ready,r);
}
const native=process.argv.includes('--native');
if(process.argv.includes('--check')){const r=verifyPrepared(native);console.log(JSON.stringify({passed:true,seed:r.seed,host:state.host,introSeconds:r.presentationFrames/60,output:r.output,freeGiB:free(),privacy:'render only'}));process.exit(0);}
if(!process.argv.some(a=>['--prepare','--resume-preparation','--replay-check','--native','--run'].includes(a)))throw Error('Expected --prepare --native, --native, --run or --check');
if(process.argv.includes('--prepare')&&free()<50)throw Error('New production needs at least fifty GiB free');
const save=()=>{state.checkedAt=new Date().toISOString();state.freeGiB=free();atomic(statePath,state);};
Object.assign(state,{controllerPid:process.pid,status:'running',deadline:new Date(Date.now()+6*3600000).toISOString(),startedAt:new Date().toISOString(),steps:[]});delete state.error;
let child;
const stop=()=>{if(child?.pid)try{process.kill(-child.pid,'SIGTERM');}catch{}};
for(const sig of ['SIGINT','SIGTERM','SIGHUP'])process.on(sig,()=>{stop();state.status='stopped';state.error=sig;save();process.exit(1);});
async function run(stage,args,command=process.execPath){
 if(free()<40)throw Error('Disk reserve below forty GiB');state.stage=stage;state.steps.push({stage,startedAt:new Date().toISOString()});save();
 child=spawn(command,args,{cwd:process.cwd(),env:process.env,detached:true,stdio:'inherit'});
 await new Promise((ok,fail)=>{
  const watch=setInterval(()=>{save();if(free()<40||Date.now()>Date.parse(state.deadline)){stop();clearInterval(watch);fail(Error('Disk reserve or six-hour deadline reached'));}},30000);
  child.once('error',e=>{clearInterval(watch);fail(e);});child.once('exit',code=>{clearInterval(watch);code===0?ok():fail(Error(stage+' exited '+code));});
 });child=null;state.steps.at(-1).completedAt=new Date().toISOString();save();
}
const args=[String(state.seed),`--location=${state.location}`,`--heat=${state.heat}`,`--take=${state.take}`,`--variant=${state.variant}`,`--countries=${state.countries.join(',')}`];
if(state.visualStyle)args.push(`--visual-style=${state.visualStyle}`);
try{
 verifyFrozen();
 if(process.argv.includes('--prepare')){
  if(fs.existsSync(base+'/race.json'))throw Error('Existing fixed-seed race preserved; never rebake');
  await run('preparing-fixed-seed',[input+'/scripts/prepare-alps-review.mjs',...args]);freeze();
  await run('validating-full-replay',[input+'/scripts/prepare-replay-camera.mjs',base]);
 }
 if(process.argv.includes('--resume-preparation')){
  await run('finalizing-saved-race',[input+'/scripts/resume-car-review.mjs',statePath]);freeze();
  await run('validating-full-replay',[input+'/scripts/prepare-replay-camera.mjs',base]);
 }
 if(process.argv.includes('--replay-check'))await run('validating-full-replay',[input+'/scripts/prepare-replay-camera.mjs',base]);
 verifyPrepared(native);
 if(native){
  await run('rendering-native-stills',[input+'/scripts/render-alps-review.mjs',String(state.seed),'--stills',...args.slice(1)]);
  await run('rendering-native-finish-neighbours',[input+'/scripts/production-native-extra.mjs',state.ready]);
  await run('checking-native-images',[input+'/scripts/inspect-production-native.py',base],'python3');
  state.status='awaiting-visual-review';state.stage='native-stills-complete-awaiting-actual-inspection';save();
 }else{
  await run('rendering-full-4k60',[input+'/scripts/render-alps-review.mjs',String(state.seed),'--render',...args.slice(1)]);
  const r=read(state.ready),s=read(base+'/scene-check.json');if(r.status!=='rendered'||!r.technicalChecks||!s.passed||s.missingSceneFrames||s.decodedFrames!==r.frames)throw Error('Full export gates failed');
  state.status='complete';state.stage='awaiting-export-visual-and-user-review';state.sha256=r.sha256;save();
 }
 state.finishedAt=new Date().toISOString();save();
}catch(e){stop();state.status='failed';state.error=e.message;save();console.error(e);process.exitCode=1;}
