// Invoke under scripts/factory.mjs --shared-lock. Stops for actual native review.
import fs from 'node:fs';import {resolve} from 'node:path';import {spawn} from 'node:child_process';
const file=resolve(process.argv[2]);let state=JSON.parse(fs.readFileSync(file));
const base=resolve(state.directory),videoRoot=process.env.VIDEO_OUT??`${process.env.HOME}/GoogleCloud`;
const free=()=>{const s=fs.statfsSync(videoRoot);return s.bavail*s.bsize/2**30;};
const save=()=>{state.checkedAt=new Date().toISOString();state.freeGiB=free();fs.writeFileSync(file+'.tmp',JSON.stringify(state,null,2)+'\n');fs.renameSync(file+'.tmp',file);};
if(state.status!=='queued'||(!state.resumeCamera&&(fs.existsSync(base+'/race.json')||fs.existsSync(base+'/job.json'))))throw Error('Existing job or fixed bake preserved; inspect before resuming');
let child;
const stop=()=>{if(child?.pid)try{process.kill(-child.pid,'SIGTERM');}catch{}};
for(const sig of ['SIGINT','SIGTERM','SIGHUP'])process.on(sig,()=>{stop();state.status='stopped';state.error=sig;save();process.exit(1);});
state.status='running';state.pid=process.pid;state.startedAt=new Date().toISOString();state.deadline=new Date(Date.now()+6*3600000).toISOString();save();
async function run(stage,args){state.stage=stage;save();child=spawn(process.execPath,args,{cwd:process.cwd(),env:process.env,detached:true,stdio:'inherit'});await new Promise((ok,fail)=>{const timer=setInterval(()=>{save();if(free()<40||Date.now()>Date.parse(state.deadline)){stop();clearInterval(timer);fail(Error('Forty GiB reserve or six-hour deadline reached'));}},15000);child.once('error',e=>{clearInterval(timer);fail(e);});child.once('exit',code=>{clearInterval(timer);code===0?ok():fail(Error(stage+' exited '+code));});});child=null;}
try{
 if(free()<(state.resumeCamera?40:50))throw Error('Insufficient preparation disk reserve');
 await run(state.resumeCamera?'finishing-camera-repaired-saved-race':'baking-fixed-marble-race',['scripts/prepare-marble-review.mjs',`--seed=${state.seed}`,`--location=${state.location}`,`--directory=${base}`,...(state.resumeCamera?['--resume-camera']:[]),...(state.take?[`--take=${state.take}`]:[])]);
 await run('validating-marble-replay',[base+'/input/scripts/prepare-replay-camera.mjs',base]);
 await run('rendering-native-4k-stills',['scripts/render-alps-review.mjs',String(state.seed),'--stills',`--location=${state.location}`,`--directory=${base}`]);
 state.status='awaiting-native-visual-review';state.stage='native-images-ready';state.finishedAt=new Date().toISOString();save();
}catch(e){stop();state.status='failed';state.error=e.message;save();console.error(e);process.exitCode=1;}
