import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
const origin='http://127.0.0.1:18083';
const call=async(path,method='GET',body)=>{const r=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
const until=async fn=>{for(let i=0;i<200;i++){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out');};
test('physical design engine: deterministic real-world behavior',{timeout:60000},async()=>{
 const child=spawn(process.execPath,['scripts/factory.mjs','--shared-lock','--',process.execPath,'designer/physics-checks.mjs'],{stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);const [code]=await once(child,'close');assert.equal(code,0,output);
});
test('simulation API snapshots, conflicts, persistence, cancellation and failure',{timeout:60000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'racecraft-physics-'));
 let child;const start=async()=>{child=spawn(process.execPath,['designer/server.mjs'],{env:{...process.env,DESIGNER_DATA_DIR:dir,DESIGNER_PORT:'18083'},stdio:['ignore','pipe','pipe']});await once(child.stdout,'data');};
 try{
  await start();let p=(await call('/projects','POST',{mode:'cars',template:'physics-lab',name:'Physics API'})).data;
  const request=()=>({revision:p.revision,etag:p._etag,settings:{duration:30,launchSpeed:12}});
  const wrong=await call('/projects/'+p.id+'/simulations','POST',{...request(),etag:'stale'});assert.equal(wrong.status,409);
  let bad=(await call('/projects','POST',{mode:'marbles'})).data;bad.elements.push({id:'overlap',assetId:'jump',name:'Salto solapado',at:.39,offset:0,scale:1});bad=(await call('/projects/'+bad.id,'PUT',bad)).data;
  const unsupported=await call('/projects/'+bad.id+'/simulations','POST',{revision:bad.revision,etag:bad._etag});assert.equal(unsupported.status,422);assert.ok(unsupported.data.issues.some(i=>i.elementId));
  const j=(await call('/projects/'+p.id+'/simulations','POST',request())).data;
  assert.equal((await call('/projects/'+p.id+'/simulations','POST',request())).status,409);
  assert.equal((await call('/simulations/'+j.id+'/result')).status,409);
  const done=await until(async()=>{const j2=(await call('/simulations/'+j.id)).data;return ['complete','failed'].includes(j2.status)&&j2;});assert.equal(done.status,'complete',JSON.stringify(done));
  const result=(await call('/simulations/'+j.id+'/result')).data;assert.equal(result.projectId,p.id);assert.equal(result.revision,p.revision);assert.ok(result.standings.some(s=>s.status==='finished'));assert.equal(result.snapshotHash,j.snapshotHash);assert.ok(result.sourceHash);
  const snapshot=JSON.parse(readFileSync(join(dir,'.simulations',j.id+'.input.json')));const expected=snapshot.hash;delete snapshot.hash;assert.equal(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),expected);
  p.name='Newer design';p=(await call('/projects/'+p.id,'PUT',p)).data;assert.notEqual(p._etag,done.etag);assert.equal((await call('/simulations/'+j.id+'/result')).data.revision,1);
  const cancelled=(await call('/projects/'+p.id+'/simulations','POST',request())).data;await call('/simulations/'+cancelled.id+'/cancel','POST',{});const end=await until(async()=>{const r=(await call('/simulations/'+cancelled.id)).data;return r.status==='cancelled'&&r;});assert.equal(end.status,'cancelled');
  assert.equal((await call('/simulations/'+cancelled.id+'/result')).status,409);
  assert.equal((await fetch(origin+'/api/projects/'+p.id+'/simulations',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.example'},body:JSON.stringify(request())})).status,403);
  const tiny=(await call('/projects','POST',{mode:'cars',template:'physics-lab',name:'Overfull grid'})).data;
  tiny.participants.forEach(r=>r.enabled=true);tiny.width=3;tiny.points.forEach(q=>{q.x*=.25;q.z*=.25;});
  const overfull=(await call('/projects/'+tiny.id,'PUT',tiny)).data;
  const failedJob=(await call('/projects/'+overfull.id+'/simulations','POST',{revision:overfull.revision,etag:overfull._etag,settings:{duration:5,launchSpeed:12}})).data;
  const failed=await until(async()=>{const r=(await call('/simulations/'+failedJob.id)).data;return r.status==='failed'&&r;});assert.match(failed.error,/parrilla/);assert.equal((await call('/simulations/'+failed.id+'/result')).status,409);
  child.kill('SIGTERM');await once(child,'close');await start();const list=(await call('/projects/'+p.id+'/simulations')).data;assert.ok(list.some(s=>s.id===j.id&&s.status==='complete'));
  const again=(await call('/projects/'+p.id+'/simulations','POST',request())).data;const completed=await until(async()=>{const r=(await call('/simulations/'+again.id)).data;return ['complete','failed'].includes(r.status)&&r;});assert.equal(completed.status,'complete','cancel must release factory lock');
 }finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'close');}rmSync(dir,{recursive:true,force:true});}
});
