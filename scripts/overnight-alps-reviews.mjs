// Bounded, local-only night queue. Observe the existing render, then use the
// shared factory lock for each subsequent step. No uploads or qualifier edits.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,mkdirSync,openSync,closeSync,readFileSync,writeFileSync,renameSync,unlinkSync,statfsSync} from 'node:fs';
import {resolve} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const root=resolve('.'),dir=resolve('out/tcr/overnight-review');
const snapshot=seed=>resolve(`out/tcr/alps-review/alps-heat1-evolution-seed${seed}`);
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const ready=seed=>read(`${snapshot(seed)}/ready.json`);
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
const sources=['scripts/season.mjs','scripts/car-engine.mjs','scripts/race-director.mjs','scripts/refresh-production-cameras.mjs','scripts/render-alps-review.mjs','src/gp/circuits/r1-monaco.js','src/gp/car-challenges.js','src/gp/CarConditions.tsx','src/gp/GrandPrix.tsx','src/gp/Stage.tsx','src/gp/Scene.tsx','src/gp/Overlay.tsx','src/gp/race.ts','src/gp/CarModel.tsx','src/gp/FinishLine.tsx','src/gp/Themes.tsx','src/gp/scenery-layout.js','src/gp/alpine-mountain.js','src/gp/camera-occlusion.js'];
const sourceHash=()=>{const h=createHash('sha256');for(const p of sources)h.update(p).update(readFileSync(p));return h.digest('hex');};
const hashFile=async path=>{const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex');};
const plan={primary:ready(17).output,comparison:ready(18).output,format:'3840x2160 60fps',publication:'manual review required; no upload or cloud archive',maximumHours:12};
if(process.argv.includes('--check')) {
  for(const seed of [17,18])for(const file of ['race.json','checks.json','entry.tsx','ready.json'])if(!existsSync(`${snapshot(seed)}/${file}`))throw Error(`Missing ${seed}/${file}`);
  console.log(JSON.stringify({...plan,sourceHash:sourceHash()},null,2));
  process.exit(0);
}
mkdirSync(dir,{recursive:true});
const lock=`${dir}/queue.lock`;
if(existsSync(lock)){const old=read(lock);if(alive(old.pid))throw Error(`Night queue already running: ${old.pid}`);renameSync(lock,`${lock}.stale-${Date.now()}`);}
const fd=openSync(lock,'wx');writeFileSync(fd,JSON.stringify({pid:process.pid}));closeSync(fd);
const state={...plan,pid:process.pid,startedAt:new Date().toISOString(),deadline:new Date(Date.now()+12*3600000).toISOString(),status:'running',stage:'waiting-for-current-render',sourceHash:sourceHash(),jobs:[]};
const save=()=>{writeFileSync(`${dir}/status.tmp`,JSON.stringify(state,null,2));renameSync(`${dir}/status.tmp`,`${dir}/status.json`);};
let child=null;
const checkDeadline=()=>{if(Date.now()>Date.parse(state.deadline))throw Error('12-hour queue limit reached; review status before continuing');};
const assertSources=()=>{if(sourceHash()!==state.sourceHash)throw Error('Production source changed during the night queue; stopped before using mixed versions');};
async function lockedStep(name,args) {
  checkDeadline();assertSources();
  const disk=statfsSync(resolve(process.env.VIDEO_OUT||'/Users/user/GoogleCloud'));
  if(disk.bavail*disk.bsize<40*1024**3)throw Error('Less than 40 GiB free; preserving all files and stopping');
  state.stage=name;state.jobs.push({name,status:'running',startedAt:new Date().toISOString()});save();
  const log=openSync(`${dir}/${name}.log`,'a');
  child=spawn(process.execPath,['scripts/factory.mjs','--shared-lock','--',process.execPath,...args],{cwd:root,env:process.env,stdio:['ignore',log,log],detached:true});
  closeSync(log);state.childPid=child.pid;save();
  const code=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{try{process.kill(-child.pid,'SIGTERM');}catch{}},Math.max(1,Date.parse(state.deadline)-Date.now()));
    child.once('error',e=>{clearTimeout(timeout);reject(e);});
    child.once('exit',(code,signal)=>{clearTimeout(timeout);resolve(code??signal);});
  });
  child=null;delete state.childPid;
  Object.assign(state.jobs.at(-1),{status:code===0?'passed':'failed',finishedAt:new Date().toISOString(),exit:code});save();
  if(code!==0)throw Error(`${name} failed (${code}); see ${dir}/${name}.log`);
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  if(child?.pid)try{process.kill(-child.pid,signal);}catch{}
  state.status='stopped';state.error=`Stopped by ${signal}`;save();
  try{unlinkSync(lock);}catch{}process.exit(1);
});
save();
try {
  while(ready(17).status!=='rendered') {
    checkDeadline();
    const current=ready(17);
    if(current.status==='failed')throw Error(`Existing review failed: ${current.error}`);
    if(current.status!=='rendering')throw Error(`Existing review is ${current.status}; will not start a duplicate`);
    const holder=existsSync('out/factory/shared.lock')?read('out/factory/shared.lock'):null;
    if(!holder||!alive(holder.pid))throw Error('Existing render no longer holds a live factory lock; inspect it before retrying');
    state.checkedAt=new Date().toISOString();save();await sleep(30000);
  }
  state.jobs.push({name:'existing-seed17',status:'passed',output:ready(17).output,sha256:ready(17).sha256});save();
  if(ready(18).status==='rendered') {
    state.jobs.push({name:'comparison-seed18',status:'already-rendered',output:ready(18).output});
  } else {
    assertSources();
    const meta=ready(18);
    meta.reviewTitle='Alpes · Manga 1 · Condiciones B · Revisión 4K';
    meta.logPath=`${dir}/seed18-render.log`;
    writeFileSync(`${snapshot(18)}/ready.json`,JSON.stringify(meta,null,2));
    await lockedStep('seed18-cameras',['scripts/refresh-production-cameras.mjs',`${snapshot(18)}/race.json`,'--write']);
    await lockedStep('seed18-stills',['scripts/render-alps-review.mjs','18','--stills']);
    await lockedStep('seed18-render',['scripts/render-alps-review.mjs','18','--render']);
  }
  const original='/Users/user/GoogleCloud/tcr-alps-heat1-4k.mp4';
  state.originalSha256=await hashFile(original);
  if(state.originalSha256!=='297d6e9df764e372f1c70f4c3dd4c0b8cdd743657f9150fab1be71d43f9107bc')throw Error('Original master checksum differs; manual review required');
  state.status='complete';state.stage='awaiting-user-review';state.finishedAt=new Date().toISOString();save();
} catch(e) {
  state.status='failed';state.error=e.message;state.finishedAt=new Date().toISOString();save();process.exitCode=1;
} finally {
  try{unlinkSync(lock);}catch{}
  console.log(JSON.stringify(state,null,2));
}
