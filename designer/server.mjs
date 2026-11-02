import {isDeepStrictEqual} from 'node:util';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {simulationManager} from './simulations.mjs';
import {catalog,templates} from './catalog.mjs';
import {validateProject,validateAsset,createProject,brief} from './model.mjs';
import {productionLibrary} from './productions.mjs';
import {googleReaders,remoteVerification} from './production-remote.mjs';
import {analyticsAuthorization} from './youtube-analytics-auth.mjs';
import {analyticsReader,analyticsManager} from './analytics.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const data=resolve(process.env.DESIGNER_DATA_DIR||`${root}/designs`);
const verification=remoteVerification({cacheFile:resolve(data,'.productions/remotes.json'),readers:googleReaders({root})});
const productions=productionLibrary({root,inventory:process.env.DESIGNER_CLOUD_INVENTORY||undefined,remoteState:verification.snapshot});
const analyticsAuth=analyticsAuthorization({root});
const analytics=analyticsManager({cacheFile:resolve(data,'.productions/analytics.json'),audienceFile:resolve(data,'.productions/audience.json'),reader:analyticsReader({root})});
const simulations=simulationManager(`${data}/.simulations`);
const port=Number(process.env.DESIGNER_PORT||8081);
mkdirSync(data,{recursive:true});mkdirSync(`${data}/history`,{recursive:true});
const read=p=>JSON.parse(readFileSync(p,'utf8'));
function atomic(p,value){const tmp=`${p}.${randomUUID()}.tmp`;writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');renameSync(tmp,p);}
const tagged=p=>({...p,_etag:createHash('sha256').update(JSON.stringify(p)).digest('hex')});
function saveNew(p){delete p._etag;p.revision=1;p.updatedAt=new Date().toISOString();atomic(`${data}/${p.id}.json`,p);return tagged(p);}
if(!existsSync(`${data}/library.json`))atomic(`${data}/library.json`,{revision:1,assets:[]});
if(!readdirSync(data).some(n=>n.endsWith('.json')&&n!=='library.json')){saveNew(createProject({mode:'marbles'}));saveNew(createProject({mode:'cars'}));}
const project=id=>{if(!/^[\w-]{1,80}$/.test(id)||id==='library')throw Object.assign(new Error('Proyecto no encontrado.'),{status:404});try{return read(`${data}/${id}.json`);}catch{throw Object.assign(new Error('Proyecto no encontrado.'),{status:404});}};
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function body(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Object.assign(new Error('El proyecto supera 1 MB.'),{status:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw Object.assign(new Error('JSON inválido.'),{status:400});}}
function knownAssets(p){const all=[...catalog,...read(`${data}/library.json`).assets];if(p.elements.some(e=>!all.some(a=>a.id===e.assetId&&a.modes.includes(p.mode))))throw Object.assign(new Error('Hay piezas desconocidas o incompatibles con el modo. Importa primero sus definiciones.'),{status:400});}
const vendors={'three.module.js':'node_modules/three/build/three.module.js','three.core.js':'node_modules/three/build/three.core.js','OrbitControls.js':'node_modules/three/examples/jsm/controls/OrbitControls.js'};
const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
 try{
 const host=req.headers.host;if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))return json(res,403,{error:'Solo disponible en este Mac.'});
 const url=new URL(req.url,`http://${host}`),path=url.pathname;
 if(!['GET','HEAD'].includes(req.method)){
  if(req.headers.origin!==`http://${host}`||!req.headers['content-type']?.startsWith('application/json'))return json(res,403,{error:'Origen de escritura no permitido.'});
 }
 if(path==='/api/analytics'&&req.method==='GET')return json(res,200,{...analytics.status(),authorization:analyticsAuth.status()});
 if(path==='/api/analytics/refresh'&&req.method==='POST'){await body(req);return json(res,202,analytics.start());}
 if(path==='/api/analytics/connect'&&req.method==='POST'){await body(req);return json(res,200,await analyticsAuth.start());}
 if(path==='/api/analytics/audience'&&req.method==='POST')return json(res,201,analytics.record(await body(req)));
 if(path==='/api/catalog'&&req.method==='GET')return json(res,200,{catalog,templates,library:read(`${data}/library.json`)});
 if(path==='/api/productions'&&req.method==='GET')return json(res,200,productions.snapshot());
 if(path==='/api/productions/verification'&&req.method==='GET'){const {connections}=productions.snapshot();return json(res,200,connections);}
 if(path==='/api/productions/verify'&&req.method==='POST'){await body(req);const ids=productions.snapshot().items.filter(e=>e.youtube).map(e=>e.youtube.id);verification.start(ids);return json(res,202,{pending:verification.snapshot().pending});}
 const media=path.match(/^\/api\/productions\/([a-f0-9]{24})\/media$/);
 if(media&&['GET','HEAD'].includes(req.method)){if(productions.stream(req,res,media[1]))return;return json(res,404,{error:'Vídeo local no disponible. Actualiza la biblioteca.'});}
 if(path==='/api/projects'&&req.method==='GET')return json(res,200,readdirSync(data).filter(n=>/^[\w-]+\.json$/.test(n)&&n!=='library.json').map(n=>read(`${data}/${n}`)).map(({id,name,mode,revision,updatedAt,theme})=>({id,name,mode,revision,updatedAt,theme})));
 if(path==='/api/projects'&&req.method==='POST')return json(res,201,saveNew(createProject(await body(req))));
 if(path==='/api/import'&&req.method==='POST'){
  const input=await body(req);const p=input.project||input;validateProject(p);
  const lib=read(`${data}/library.json`);if(input.assets!==undefined&&(!Array.isArray(input.assets)||input.assets.length>100))return json(res,400,{error:'Biblioteca importada inválida.'});const additions=(input.assets||[]).map(validateAsset);
  const all=[...catalog,...lib.assets,...additions];if(p.elements.some(e=>!all.some(a=>a.id===e.assetId&&a.modes.includes(p.mode))))return json(res,400,{error:'El archivo contiene piezas sin definición compatible.'});
  for(const a of additions){const existing=all.slice(0,catalog.length+lib.assets.length).find(x=>x.id===a.id);if(existing&&!isDeepStrictEqual(existing.custom?validateAsset(existing):existing,a))return json(res,409,{error:'Una pieza importada tiene el mismo ID que otra versión local.'});}
  if(additions.some(a=>!lib.assets.some(x=>x.id===a.id))){lib.assets.push(...additions.filter(a=>!lib.assets.some(x=>x.id===a.id)));lib.revision++;atomic(`${data}/library.json`,lib);}
  p.id=randomUUID();p.name=`${p.name.slice(0,85)} · copia`;return json(res,201,saveNew(p));
 }
 if(path==='/api/library'&&req.method==='POST'){
  const b=await body(req),lib=read(`${data}/library.json`);if(b.revision!==lib.revision)return json(res,409,{error:'La biblioteca cambió. Recarga antes de añadir otra pieza.'});
  if(lib.assets.length>=100)return json(res,400,{error:'Límite de 100 piezas personales.'});
  const a=validateAsset({...b.asset,id:randomUUID()});lib.assets.push(a);lib.revision++;atomic(`${data}/library.json`,lib);return json(res,201,lib);
 }
 const simProject=path.match(/^\/api\/projects\/([\w-]+)\/(simulations|preflight)$/);
 if(simProject){
  if(req.method==='GET'&&simProject[2]==='simulations')return json(res,200,simulations.list(project(simProject[1]).id));
  if(req.method==='POST'){
   const input=await body(req),p=tagged(project(simProject[1]));
   if(input.revision!==p.revision||input.etag!==p._etag)return json(res,409,{error:'El diseño cambió. Guarda y vuelve a probar.'});
   const assets=[...catalog,...read(`${data}/library.json`).assets];
   if(simProject[2]==='preflight')return json(res,200,simulations.check(p,assets,input.settings));
   return json(res,202,simulations.start(p,assets,input.settings));
  }
 }
 const sim=path.match(/^\/api\/simulations\/([a-f0-9-]+)(?:\/(result|cancel))?$/);
 if(sim){
  if(req.method==='GET'&&sim[2]==='result'){const result=simulations.result(sim[1]);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(result);}
  if(req.method==='GET'&&!sim[2])return json(res,200,simulations.get(sim[1]));
  if(req.method==='POST'&&sim[2]==='cancel'){await body(req);return json(res,200,simulations.cancel(sim[1]));}
 }
 const match=path.match(/^\/api\/projects\/([\w-]+)(?:\/(brief|export))?$/);
 if(match){
  const p=project(match[1]),lib=read(`${data}/library.json`).assets;
  if(req.method==='GET'){
   if(match[2]==='brief'){res.writeHead(200,{'Content-Type':'text/markdown; charset=utf-8','Cache-Control':'no-store'});return res.end(brief(p,lib));}
   if(match[2]==='export')return json(res,200,{schemaVersion:1,project:p,assets:lib.filter(a=>p.elements.some(e=>e.assetId===a.id)),productionReady:false});
   return json(res,200,tagged(p));
  }
  if(req.method==='PUT'&&!match[2]){
   const b=await body(req);validateProject(b);knownAssets(b);if(b.id!==p.id)return json(res,400,{error:'ID de proyecto incorrecto.'});
   const latest=project(match[1]);if(b.revision!==latest.revision||b._etag!==tagged(latest)._etag)return json(res,409,{error:'Este proyecto cambió en otra ventana o desde Codex. Exporta tus cambios antes de recargar; no se han sobrescrito.'});
   atomic(`${data}/history/${latest.id}-r${latest.revision}.json`,latest);delete b._etag;b.revision=latest.revision+1;b.updatedAt=new Date().toISOString();atomic(`${data}/${p.id}.json`,b);return json(res,200,tagged(b));
  }
 }
 if(path.startsWith('/api/'))return json(res,404,{error:'Ruta no encontrada.'});
 if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Método no permitido.'});
 let file;
 if(path==='/')file=`${root}designer/public/index.html`;
 else if(['/app.js','/scene.js','/simulation-ui.js','/course.js','/replay.js','/style.css','/productions-ui.js','/productions.css','/analytics-ui.js','/analytics.css'].includes(path))file=`${root}designer/public${path}`;
 else if(['/src/gp/trackMesh.js','/src/gp/vortex.js'].includes(path))file=`${root}${path.slice(1)}`;
 else if(path.startsWith('/vendor/')&&vendors[path.slice(8)])file=`${root}${vendors[path.slice(8)]}`;
 else if(/^\/assets\/[\w-]+\.(jpg|png)$/.test(path))file=`${root}site${path}`;
 else return json(res,404,{error:'Archivo no encontrado.'});
 if(!existsSync(file))return json(res,404,{error:'Archivo no encontrado.'});
 res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png'}[extname(file)],'Cache-Control':'no-cache'});
 res.end(req.method==='HEAD'?undefined:readFileSync(file));
 }catch(e){json(res,e.status||500,{error:e.status?e.message:'No se pudo completar la operación. Revisa el servidor local.',issues:e.issues,warnings:e.warnings});if(!e.status)console.error(e);}
});
server.listen(port,'127.0.0.1',()=>console.log(`Racecraft Studio · http://127.0.0.1:${port}\nProyectos: ${data}\nDiseño y pruebas físicas locales. No renderiza ni publica.`));
server.on('error',e=>{console.error(e.message);process.exitCode=1;});

for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{simulations.shutdown();analyticsAuth.close();server.close();setTimeout(()=>process.exit(0),3500).unref();});
