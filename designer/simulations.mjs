import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,renameSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {preflight,ENGINE} from './physics.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
export const currentSourceHash=()=>{
 const files=['designer/catalog.mjs','designer/public/course.js','designer/scaled-world.mjs','src/gp/vortex.js','designer/physics.mjs','designer/model.mjs','designer/sim-worker.mjs','package-lock.json','src/gp/trackMesh.js','src/gp/rotor.js',...readdirSync(root+'src/gp/obstacles').filter(f=>f.endsWith('.js')).map(f=>'src/gp/obstacles/'+f)];
 return hash(files.sort().map(f=>f+'\n'+readFileSync(root+f,'utf8')).join('\n'));
};
const atomic=(file,value)=>{writeFileSync(file+'.tmp',JSON.stringify(value));renameSync(file+'.tmp',file);};
const failure=(message,status=400)=>Object.assign(Error(message),{status});
export function simulationManager(directory){
 mkdirSync(directory,{recursive:true});let active=null;
 for(const f of readdirSync(directory).filter(f=>f.endsWith('.job.json'))){const file=`${directory}/${f}`,j=JSON.parse(readFileSync(file));if(['queued','running','cancelling'].includes(j.status)){j.status='interrupted';j.error='El servidor se reinició. Repite la prueba.';atomic(file,j);}}
 function get(id){if(!/^[a-f0-9-]{36}$/.test(id)||!existsSync(`${directory}/${id}.job.json`))throw failure('Ensayo no encontrado.',404);const j=JSON.parse(readFileSync(`${directory}/${id}.job.json`));return {...j,engineCurrent:j.sourceHash===currentSourceHash()};}
 function persist(j){atomic(`${directory}/${j.id}.job.json`,j);}
 function stop(reason){if(!active)return;const a=active;a.reason=reason;a.job.status='cancelling';persist(a.job);try{process.kill(-a.child.pid,'SIGTERM');}catch{}a.killTimer=setTimeout(()=>{try{process.kill(-a.child.pid,'SIGKILL');}catch{}},3000);a.killTimer.unref();}
 return {
  check:preflight,
  start(project,assets,settings){
   if(active)throw failure('Hay otra prueba en curso. Espera o cancélala antes de empezar.',409);
   const check=preflight(project,assets,settings);if(check.errors.length)throw Object.assign(failure('El diseño tiene piezas o geometría pendientes de adaptar.',422),{issues:check.errors,warnings:check.warnings});
   const sourceHash=currentSourceHash();
   const snapshot={project,assets,settings:check.settings,sourceHash,engine:ENGINE};snapshot.hash=hash(JSON.stringify(snapshot));
   const id=randomUUID(),input=`${directory}/${id}.input.json`,output=`${directory}/${id}.result.json`;
   atomic(input,snapshot);const job={id,projectId:project.id,revision:project.revision,etag:project._etag,snapshotHash:snapshot.hash,sourceHash,status:'queued',progress:0,createdAt:new Date().toISOString(),settings:check.settings,warnings:check.warnings};persist(job);
   const child=spawn(process.execPath,['scripts/factory.mjs','--shared-lock','--',process.execPath,'--max-old-space-size=512','designer/sim-worker.mjs',input,output],{cwd:root,detached:true,env:{...process.env},stdio:['ignore','pipe','pipe']});
   const a=active={child,job,reason:null};let buffer='',stderr='';
   const timer=setTimeout(()=>stop('Tiempo máximo de cálculo excedido (3 minutos, incluida espera de la fábrica).'),180000);timer.unref();
   child.stderr.on('data',c=>{stderr=(stderr+c).slice(-2000);});
   child.stdout.on('data',c=>{buffer+=c;let idx;while((idx=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,idx);buffer=buffer.slice(idx+1);try{const m=JSON.parse(line);if(a.reason)continue;if(m.type==='started')job.status='running';if(m.type==='progress')job.progress=m.value;persist(job);}catch{}}});
   child.once('error',e=>{stderr=e.message;});
   child.once('close',code=>{clearTimeout(timer);clearTimeout(a.killTimer);job.status=a.reason?'cancelled':code===0&&existsSync(output)?'complete':'failed';job.error=a.reason||(job.status==='failed'?stderr||'No se pudo calcular la prueba.':undefined);job.finishedAt=new Date().toISOString();if(job.status==='complete')job.progress=1;persist(job);if(active===a)active=null;});
   return job;
  },get,
  list(projectId){return readdirSync(directory).filter(f=>f.endsWith('.job.json')).map(f=>JSON.parse(readFileSync(`${directory}/${f}`))).filter(j=>j.projectId===projectId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20).map(j=>({...j,engineCurrent:j.sourceHash===currentSourceHash()}));},
  result(id){const j=get(id);if(j.status!=='complete')throw failure('La prueba todavía no tiene resultados.',409);return readFileSync(`${directory}/${id}.result.json`);},
  cancel(id){const j=get(id);if(active?.job.id===id)stop('Prueba cancelada por el usuario.');return get(j.id);},
  shutdown(){stop('Servidor detenido.');},
 };
}
