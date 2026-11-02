// Full production repairs, sequentially; never upload or archive to Cloud.
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,openSync,closeSync,statfsSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
const folder=resolve('out/tcr/alps-repair');mkdirSync(folder,{recursive:true});
const state={status:'running',startedAt:new Date().toISOString(),pid:process.pid,jobs:[]};
const save=()=>{writeFileSync(`${folder}/status.tmp`,JSON.stringify(state,null,2));renameSync(`${folder}/status.tmp`,`${folder}/status.json`);};
let child;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  if(child)child.kill(signal);state.status='stopped';save();process.exit(1);
});
save();
try {
  for(const seed of [17,18]) {
    const disk=statfsSync(process.env.VIDEO_OUT);if(disk.bavail*disk.bsize<40*1024**3)throw Error('Need 40 GiB free before rendering');
    const path=resolve(`out/tcr/alps-review/alps-heat1-evolution-seed${seed}/ready.json`);
    const ready=JSON.parse(readFileSync(path));
    if(ready.visualReview!=='failed')throw Error(`Seed ${seed} is not a failed export; inspect before rerunning`);
    ready.logPath=`${folder}/seed${seed}.log`;writeFileSync(path,JSON.stringify(ready,null,2));
    const job={seed,status:'rendering',startedAt:new Date().toISOString(),log:ready.logPath};state.jobs.push(job);state.activeSeed=seed;save();
    const fd=openSync(ready.logPath,'a');
    child=spawn(process.execPath,['scripts/factory.mjs','--shared-lock','--',process.execPath,'scripts/render-alps-review.mjs',String(seed),'--render','--repair'],{stdio:['ignore',fd,fd]});closeSync(fd);
    const code=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>child.kill('SIGTERM'),6*3600*1000);
      child.once('error',e=>{clearTimeout(timer);reject(e);});
      child.once('exit',code=>{clearTimeout(timer);resolve(code);});
    });child=null;
    job.status=code===0?'rendered':'failed';job.finishedAt=new Date().toISOString();save();
    if(code!==0)throw Error(`Seed ${seed} failed; see ${job.log}`);
  }
  state.status='awaiting-user-review';state.finishedAt=new Date().toISOString();delete state.activeSeed;save();
} catch(error) {state.status='failed';state.error=error.message;save();process.exitCode=1;}
