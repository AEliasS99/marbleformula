// Read-only catalogue. Files, publication evidence and user approval are separate facts.
import {readdirSync,readFileSync,statSync,realpathSync,createReadStream} from 'node:fs';
import {resolve,relative,extname,basename,sep} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {applyYouTube} from './production-matching.mjs';
const video = /\.(mp4|mov|webm|m4v)$/i;
const id = value => createHash('sha256').update(value).digest('hex').slice(0,24);
const within = (root,path) => {const rel=relative(root,path);return rel!== '..'&&!rel.startsWith(`..${sep}`)&&!rel.startsWith(sep);};
function files(root,filter,depth=0){
 if(depth>12)return [];
 try{return readdirSync(root,{withFileTypes:true}).flatMap(e=>e.name.startsWith('.')||e.isSymbolicLink()?[]:e.isDirectory()?files(resolve(root,e.name),filter,depth+1):e.isFile()&&filter(e.name)?[resolve(root,e.name)]:[]);}catch{return [];}
}
function read(path){return JSON.parse(readFileSync(path,'utf8'));}
function releasePlan(root){
 try{
  const plan=read(resolve(root,'out/production-schedule.json'));
  if(plan.mode!=='alternating'||!Array.isArray(plan.entries))return null;
  return {mode:'alternating',automaticPublication:false,entries:plan.entries.map(e=>{
   let status=e.state;
   if(e.job&&within(resolve(root,'out'),resolve(e.job)))try{status=read(e.job).status;}catch{}
   return {slot:e.slot,series:e.series,location:e.location??null,status};
  })};
 }catch{return null;}
}
function kind(path){return /(^|\/)(bench|look|preview)\/|(^|\/)setup-|sample|-preview\.|\.partial\./i.test(path)?'test':'video';}
function mode(path){return /(^|\/)(tcr-|car-engine-|racecraft-cars-)/.test(path)?'cars':'unknown';}
export function productionLibrary({root,videoRoot=process.env.VIDEO_OUT||resolve(homedir(),'GoogleCloud'),inventory=resolve(root,'../.tools/gcloud-bucket-inventory.json'),repositories=[root,resolve(root,'../marble')],remoteState=()=>({})}={}){
 const media=new Map();
 function snapshot(){
  media.clear();const remote=remoteState();const items=[],warnings=[],now=new Date().toISOString();let cloudAt=null,cloudCount=0,cloudBytes=0;
  try{
   const objects=remote.cloud?.data?.objects||read(inventory);if(!Array.isArray(objects))throw Error('shape');cloudAt=remote.cloud?.data?remote.cloud.checkedAt:statSync(inventory).mtime.toISOString();
   for(const object of objects){
    if(typeof object.path!=='string'||!video.test(object.path)||!Number.isSafeInteger(object.bytes)||object.bytes<0)continue;
    const path=object.path,entry={id:id(`cloud:${path}`),title:basename(path),kind:kind(path),mode:mode(path),status:kind(path)==='test'?'test':'unknown',locations:[{type:'cloud',path:`gs://elias-marmot-races/${path}`,bytes:object.bytes,updatedAt:object.updated,observedAt:cloudAt,generation:object.generation,md5:object.md5,crc32c:object.crc32c,verified:!!remote.cloud?.data}],sources:[remote.cloud?.data?'Google Cloud Storage JSON API':inventory],notes:[]};
    items.push(entry);cloudCount++;cloudBytes+=object.bytes;
   }
  }catch{warnings.push('No se pudo leer el inventario de Cloud. Los archivos remotos no se han consultado.');}
  let canonicalRoot;
  try{canonicalRoot=realpathSync(videoRoot);}catch{warnings.push('La carpeta de vídeos locales no está disponible.');}
  for(const file of canonicalRoot?files(canonicalRoot,n=>video.test(n)):[]){
   let stats;try{stats=statSync(file);}catch{continue;}
   const rel=relative(canonicalRoot,file).split(sep).join('/');
   // Only combine the same relative path and byte count. This is not a checksum claim.
   let entry=items.find(e=>e.locations.some(l=>l.path===`gs://elias-marmot-races/${rel}`&&l.bytes===stats.size));
   if(!entry){entry={id:id(`local:${rel}`),title:basename(file),kind:kind(rel),mode:mode(rel),status:kind(rel)==='test'?'test':'unknown',locations:[],sources:[],notes:[]};items.push(entry);}
   entry.locations.push({type:'local',path:file,bytes:stats.size,updatedAt:stats.mtime.toISOString(),observedAt:now});entry.sources.push('Exploración local de VIDEO_OUT');
   if(!/\.partial\./i.test(file)){media.set(entry.id,{file,root:canonicalRoot});entry.playback=`/api/productions/${entry.id}/media`;}
   if(entry.locations.length>1)entry.notes.push('Copias con la misma ruta relativa y tamaño; la biblioteca no recalcula sus hashes.');
  }
  // Known review evidence applies only to the recovered master with the recorded size.
  const reviewPath=resolve(root,'out/tcr/alps/heat-1-verified.json');
  try{const review=read(reviewPath),entry=items.find(e=>e.locations.some(l=>[resolve(canonicalRoot||videoRoot,'tcr-alps-heat1-4k.mp4'),'gs://elias-marmot-races/tcr-alps-heat1-4k.mp4'].includes(l.path)&&l.bytes===review.bytes));
   if(entry){entry.title='Alpes · Manga 1 · Máster 4K';entry.status='review';entry.mode='cars';entry.format=review.format;entry.duration=review.durationSeconds;entry.sources.push(reviewPath,resolve(root,'out/tcr/alps/REVIEW.md'));entry.notes.push(review.technicalChecks==='passed'?'Controles técnicos registrados como superados. Validación del usuario pendiente.':'Revisar el informe técnico y validar con el usuario.',...(review.editorialIssues||[]));entry.next='Corregir los rótulos de reglas y campeonato; revisar juntos antes de publicar.';}
  }catch{/* No review evidence: status stays unknown. */}
  // Imported handoff publications are not live YouTube checks or guessed file matches.
  try{const handoff=readFileSync(resolve(root,'HANDOFF.md'),'utf8');
   for(const m of handoff.matchAll(/^\d+\. \*\*(.+?)\*\* — `https:\/\/youtu\.be\/([\w-]{11})` \(`([\d:]+)`/gm)){
    items.push({id:`youtube-${m[2]}`,title:m[1],kind:'release',mode:'marbles',status:'published',youtube:{id:m[2],url:`https://youtu.be/${m[2]}`,evidence:'Handoff histórico · sin consulta en directo'},durationLabel:m[3],format:'1080p60 · según handoff',locations:[],sources:[resolve(root,'HANDOFF.md')],notes:['Publicación y procesamiento registrados en el handoff. El archivo máster exacto aún no está vinculado.'],next:'Vincular el máster exacto y verificar el estado actual en YouTube.'});
   }
  }catch{warnings.push('No se pudo leer el historial de publicaciones de HANDOFF.md.');}
  for(const repo of repositories){
   // Completed render manifests are technical evidence, never user approval.
   let renders=[];try{renders=readdirSync(resolve(repo,'out/racecraft'),{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink());}catch{}
   for(const dir of renders){
    const path=resolve(repo,'out/racecraft',dir.name,'manifest.json');
    try{const render=read(path);if(render.status!=='rendered'||!Number.isSafeInteger(render.videoBytes)||typeof render.output!=='string')continue;
     const entry=items.find(e=>e.locations.some(l=>l.type==='local'&&l.path===resolve(render.output)&&l.bytes===render.videoBytes));if(!entry)continue;
     entry.title=render.take==='camera-review-final'?'Coches · Cámaras y meta · Revisión final 4K':render.take==='camera-review'?'Coches · Cámaras y meta · Borrador 4K':'Coches · Racecraft · Preview 4K';entry.kind='test';entry.mode='cars';entry.status='review';entry.format='3840 × 2160 · 60 fps';entry.duration=render.frames/60;entry.sources.push(path);
     entry.notes.push(`Motor: ${render.engine}. Snapshot: ${render.snapshotHash}.`,render.technicalChecks||'Consultar el manifiesto técnico.','Validación del usuario pendiente. Audio sintetizado de revisión.');entry.next='Revisar la conducción, cámaras y presentación antes de preparar una carrera completa.';if(render.reviewIssues?.length){entry.status='test';entry.notes.push(...render.reviewIssues);entry.next=render.nextReviewAction||'Usar la revisión final de cámaras; este borrador conserva incidencias documentadas.';if(render.reviewLabel)entry.title=render.reviewLabel;}
    }catch{/* Missing or incomplete manifests do not upgrade review status. */}
   }
   for(const path of files(resolve(repo,'out'),name=>name==='uploaded.json'||name.endsWith('-uploaded.json'))){
    try{const record=read(path);for(const key of ['video','short']){const v=record[key];if(!v||!/^[-\w]{11}$/.test(v.id))continue;
     const existing=items.find(e=>e.youtube?.id===v.id);if(existing){existing.sources.push(path);continue;}
     items.push({id:`youtube-${v.id}`,title:typeof v.title==='string'?v.title:basename(path),kind:'release',mode:'unknown',status:'uploaded',youtube:{id:v.id,url:`https://youtu.be/${v.id}`,evidence:'Registro del uploader · procesamiento y visibilidad sin verificar'},locations:[],sources:[path],notes:['Subida completada según el registro local. No equivale a publicación pública ni a procesamiento confirmado.'],updatedAt:v.at});
    }}catch{warnings.push(`No se pudo leer un registro de subida: ${relative(repo,path)}.`);}
   }
   for(const path of files(resolve(repo,'out/tcr'),name=>name==='ready.json')){
    try{const ready=read(path);const reviewMode=ready.variant==='marble-production'?'marbles':'cars';
     if(['alps-evolution','alps-turbo','production-review','marble-production'].includes(ready.variant)) {
      const entry=items.find(e=>e.locations.some(l=>l.type==='local'&&l.path===resolve(ready.output)&&l.bytes===ready.videoBytes));
      if(!entry && ['rendering','failed'].includes(ready.status)) {
       let progress=Number.isInteger(ready.renderedFrames)?{frames:ready.renderedFrames,total:ready.frames}:null;
       try {const custom=ready.logPath&&resolve(ready.logPath);const logPath=custom&&within(resolve(repo,'out/tcr'),custom)&&custom.endsWith('.log')?custom:resolve(repo,'out/tcr/alps-review-render.log');const log=readFileSync(logPath,'utf8');const matches=[...log.matchAll(/Rendered (\d+)\/(\d+)(?:, time remaining: ([^\r\n]+))?/g)];const last=matches.at(-1);if(last)progress={frames:Number(last[1]),total:Number(last[2]),remaining:last[3]};}catch{}
       if(Number.isInteger(ready.renderedFrames))progress={frames:ready.renderedFrames,total:ready.frames};
       items.push({id:id(`local:${relative(canonicalRoot||videoRoot,ready.output)}`),title:ready.reviewTitle||'Alpes · Manga 1 · Evolución · Revisión 4K',kind:'planned',mode:reviewMode,status:ready.status==='failed'?'renderfailed':'rendering',locations:[],expectedOutput:ready.output,format:'3840 × 2160 · 60 fps',duration:ready.frames/60,sources:[path],notes:[progress?`Render: ${progress.frames} / ${progress.total} fotogramas (${Math.floor(progress.frames/progress.total*100)}%).${progress.remaining?` Tiempo restante estimado: ${progress.remaining}.`:''}`:'Exportación iniciada.',ready.status==='failed'?ready.error:'Al terminar se comprueban todos los fotogramas, la resolución y el audio. Después pasa a revisión; no se publica automáticamente.'],next:ready.status==='failed'?'Revisar el error de exportación antes de continuar.':'La exportación sigue en esta máquina. Pulsa Actualizar vista para consultar el progreso o reproducir el resultado cuando esté validado técnicamente.'});
      }
      if(entry&&ready.status==='rendered') {
       entry.title=ready.reviewTitle||'Alpes · Manga 1 · Evolución · Revisión 4K';entry.kind='video';entry.mode=reviewMode;entry.status='review';entry.format='3840 × 2160 · 60 fps';entry.duration=ready.frames/60;entry.sources.push(path);
       entry.notes.push(ready.variant==='marble-production'?'Canicas · 20 países. Circuito, obstáculos, materiales y producción GrandPrix existentes; nueva presentación breve y reglas de la carrera real.':ready.location==='france'?'Francia · Provence Plateau Tour. Nueva ruta por pueblos de piedra, campos de lavanda y olivares, con carriles de aceleración y alternativas de trazada. Producción GrandPrix existente.':ready.location==='germany'?'Alemania · Black Forest Grand Tour. Trazado largo con curvas enlazadas, horquillas, rectas de adelantamiento, pueblos y bosques. Producción GrandPrix existente.':ready.location==='italy'?'Italia · Tuscan Hills Rush. Trazado nuevo de colinas, pueblos de piedra, tejados de terracota, cipreses y viñedos. Motor, coches, cámaras y producción GrandPrix existentes.':ready.location==='colombia'?'Colombia · Coffee Andes Rush. Circuito original inspirado en el Eje Cafetero, pueblos de colores, palmas y cafetales. Ocho islas redondeadas, doce carriles de aceleración, conducción anticipada y cámara desde el asiento.':ready.location==='spain'?'España · Barcelona Coast Rush. Nuevo circuito costero, pueblos mediterráneos, palmeras, islas físicas, ocho carriles de aceleración y alternativas de agarre. Producción GrandPrix y coches existentes.':ready.location==='tokyo'?'Circuito y producción originales de Tokyo/Shibuya. Obstáculos físicos, carriles de aceleración y presentación de los coches.':ready.location==='cairo'?'Circuito y producción originales de Cairo. Escenario egipcio, zonas de agarre variable, carriles de aceleración y presentación de los coches.':ready.location==='sydney'?'Circuito y producción originales de Sydney. Ópera, arcos del Harbour Bridge, zonas de agarre variable y carriles de aceleración.':ready.location==='newyork'?'Circuito y producción originales de New York. Torres de Times Square, carteles luminosos, zonas de agarre variable y carriles de aceleración.':'Circuito y producción originales de Matterhorn. Deshielo, trazadas alternativas, franjas de ataque y cámaras con comprobación del decorado.',`Semilla ${ready.seed}. Máster original conservado.`,ready.technicalChecks||'Consultar informe técnico.',ready.userValidation==='approved'?'Validado por el usuario para publicación.':'Validación del usuario pendiente; no aprobado para publicación pública ni archivo en Cloud.');
       if(ready.archive?.verified)entry.notes.push(`Archivo Cloud verificado: ${ready.archive.path}. Máster local conservado.`);
       entry.next=ready.userValidation==='approved'?'Consultar el estado de publicación y el archivo en Cloud.':'Revisar la emoción de la carrera, los obstáculos y las cámaras antes de publicar.';
       entry.notes.push(...(ready.editorialIssues||[]));
       if(ready.nextReviewAction)entry.next=ready.nextReviewAction;
       if(ready.visualReview==='failed') {
        entry.status='renderfailed';entry.publicationBlocked=true;
        entry.notes.push('Revisión visual fallida: no está aprobado para publicación.',...(ready.visualReviewIssues||[]));
        entry.next=ready.nextReviewAction||'Corregir las incidencias visuales registradas y volver a verificar el vídeo completo. Este archivo se conserva para diagnóstico.';
       }
      }
      if(ready.status!=='prepared')continue;
     }
     if(ready.status!=='prepared'||typeof ready.output!=='string')continue;
     if(items.some(e=>e.locations.some(l=>l.type==='local'&&l.path===resolve(ready.output))))continue;
     items.push({id:id(path),title:ready.reviewTitle||`${ready.location==='alps'?'Alpes':ready.location} · Manga ${ready.heat} · Preparada`,kind:'planned',mode:reviewMode,status:'prepared',locations:[],expectedOutput:ready.output,sources:[path],notes:['Bundle preparado; todavía no hay vídeo local. Revisar vigencia del motor y reglamento antes de renderizar.'],next:'Resolver la auditoría de producción y regenerar la preparación si cambia el motor.'});
    }catch{warnings.push(`No se pudo leer una preparación: ${relative(repo,path)}.`);}
   }
  }
  applyYouTube(items,remote.youtube);
  const priority={review:0,rendering:0,renderfailed:0,prepared:1,processing:2,failed:2,unavailable:2,published:3,private:3,unlisted:3,uploaded:3,unknown:4,test:5};items.sort((a,b)=>priority[a.status]-priority[b.status]||a.title.localeCompare(b.title));
  const connections={pending:!!remote.pending,cacheError:remote.cacheError,...Object.fromEntries(['cloud','youtube'].map(k=>[k,{checkedAt:remote[k]?.checkedAt,attemptedAt:remote[k]?.attemptedAt,error:remote[k]?.error,connected:!!remote[k]?.data,...(k==='youtube'?{channel:remote[k]?.data?.channel}:{})}]))};
  return {items,releasePlan:releasePlan(root),connections,refreshedAt:now,cloudSnapshotAt:cloudAt,videoRoot,cloudCount,cloudBytes,warnings,localCount:items.filter(e=>e.locations.some(l=>l.type==='local')).length};
 }
 function stream(req,res,mediaId){
  const item=media.get(mediaId);if(!item)return false;
  let path,stats;try{path=realpathSync(item.file);stats=statSync(path);}catch{return false;}
  if(!within(item.root,path)||!stats.isFile()||!video.test(path))return false;
  let start=0,end=stats.size-1,status=200;const range=req.headers.range;
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);let valid=!!match&&(match[1]!==''||match[2]!=='');
   if(valid){if(match[1]===''){const suffix=Number(match[2]);valid=Number.isSafeInteger(suffix)&&suffix>0;start=Math.max(0,stats.size-suffix);}else{start=Number(match[1]);if(match[2]!=='')end=Math.min(Number(match[2]),end);}valid=valid&&Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start<=end&&start<stats.size;}
   if(!valid){res.writeHead(416,{'Content-Range':`bytes */${stats.size}`});res.end();return true;}status=206;
  }
  const headers={'Content-Type':{'.mov':'video/quicktime','.webm':'video/webm'}[extname(path).toLowerCase()]||'video/mp4','Content-Length':Math.max(0,end-start+1),'Accept-Ranges':'bytes','Cache-Control':'no-store'};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${stats.size}`;
  res.writeHead(status,headers);if(req.method==='HEAD'||stats.size===0){res.end();return true;}
  const source=createReadStream(path,{start,end});source.on('error',()=>res.destroy());res.on('close',()=>source.destroy());source.pipe(res);return true;
 }
 return {snapshot,stream};
}
