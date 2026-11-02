import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject,validateProject,validateAsset,brief} from './model.mjs';
test('el modelo conserva geometría, reglas y notas; rechaza diseños peligrosos o inválidos',()=>{
 const p=createProject();assert.equal(p.elements.filter(e=>e.assetId==='checkpoint').length,3);assert.equal(p.participants.length,20);assert.equal(p.mode,'marbles');
 for(const patch of [{points:[]},{width:Infinity},{laps:1.5},{mode:'boats'},{name:''},{participants:[{id:'bad'}]}])assert.throws(()=>validateProject({...p,...patch}));
 assert.throws(()=>validateProject({...p,points:p.points.map((x,i)=>i===1?{...x,id:p.points[0].id}:x)}));
 p.notes.push({id:'test-note',target:'circuit',text:'Hacer la meta más visible',resolved:false});assert.match(brief(p),/Hacer la meta más visible/);assert.match(brief(p),/no valida física/);
 assert.throws(()=>validateAsset({id:'x',shape:'<script>'}));
});
test('persistencia, conflictos, importación y protección del servidor local',{timeout:20000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'racecraft-test-')),port=18081;
 const child=spawn(process.execPath,['designer/server.mjs'],{env:{...process.env,DESIGNER_PORT:String(port),DESIGNER_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 const origin=`http://127.0.0.1:${port}`;
 const call=async(path,method='GET',data,headers={})=>{const r=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...headers},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json()};};
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});
  const list=await call('/projects');assert.equal(list.data.length,2);const p=(await call('/projects/'+list.data[0].id)).data;
  const original=structuredClone(p);p.name='Diseño <sin ejecutar HTML>';p.points[0].y=12;
  const saved=await call('/projects/'+p.id,'PUT',p);assert.equal(saved.status,200);assert.equal(saved.data.revision,2);assert.equal(readFileSync(join(dir,p.id+'.json'),'utf8').includes('sin ejecutar'),true);
  assert.equal((await call('/projects/'+p.id,'PUT',original)).status,409);
  assert.equal(readdirSync(join(dir,'history')).length,1);
  // A direct edit from Codex without a revision bump must also be detected.
  const disk=JSON.parse(readFileSync(join(dir,p.id+'.json'),'utf8'));disk.intent='Cambio de Codex';writeFileSync(join(dir,p.id+'.json'),JSON.stringify(disk));
  assert.equal((await call('/projects/'+p.id,'PUT',saved.data)).status,409);
  const latest=(await call('/projects/'+p.id)).data;
  const simultaneous=await Promise.all([call('/projects/'+p.id,'PUT',{...latest,name:'Ventana A'}),call('/projects/'+p.id,'PUT',{...latest,name:'Ventana B'})]);assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,409]);
  assert.equal((await call('/projects','POST',{mode:'cars',name:'No autorizado'},{Origin:'https://elsewhere.example'})).status,403);
  assert.equal((await call('/productions/verify','POST',{}, {Origin:'https://elsewhere.example'})).status,403);
  assert.equal((await call('/productions/verify')).status,404,'GET never starts remote verification');
  assert.equal((await call('/productions/verification')).data.pending,false);
  assert.equal((await fetch(origin+'/designs/.productions/remotes.json')).status,404);
  assert.equal((await fetch(origin+'/.youtube-token.json')).status,404);assert.equal((await fetch(origin+'/vendor/../server.mjs')).status,404);
  for(const path of ['/analytics/connect','/analytics/refresh','/analytics/audience']){
   assert.equal((await call(path,'POST',{}, {Origin:'https://elsewhere.example'})).status,403);
   assert.equal((await call(path)).status,404);
  }
  const analytics=(await call('/analytics')).data;assert.equal(analytics.pending,false);assert.equal(analytics.data,undefined);assert.doesNotMatch(JSON.stringify(analytics),/refresh_token|client_secret|access_token/);
  assert.equal((await fetch(origin+'/.youtube-analytics/.youtube-token.json')).status,404);
  assert.equal((await call('/analytics/audience','POST',{})).status,400);
  const reading=await call('/analytics/audience','POST',{start:'2026-09-27',end:'2026-10-24',returningViewers:7,note:'fixture'});assert.equal(reading.status,201);assert.equal((await call('/analytics')).data.audience[0].returningViewers,7);
  const lib=(await call('/catalog')).data.library;
  const a={id:'ignored',name:'Martillo azul',description:'Diseño propio',modes:['marbles'],shape:'hammer',category:'obstacle',scale:1.2,color:'#447799'};
  const asset=await call('/library','POST',{revision:lib.revision,asset:a});assert.equal(asset.status,201);
  const importProject=createProject();importProject.elements.push({id:'own-piece',assetId:asset.data.assets[0].id,name:'Mi pieza',at:.5,offset:0,scale:1});
  const imported=await call('/import','POST',{project:importProject,assets:asset.data.assets});assert.equal(imported.status,201);assert.notEqual(imported.data.id,importProject.id);
  const exported=await call('/projects/'+imported.data.id+'/export');assert.equal(exported.data.assets.length,1);assert.equal(exported.data.productionReady,false);
  assert.equal((await call('/import','POST',{project:importProject,assets:{}})).status,400);
 }finally{child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));rmSync(dir,{recursive:true,force:true});}
});
