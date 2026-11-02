// Owner-authorized reads only. Tokens never leave this server or enter its cache.
import {readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
const run=promisify(execFile);
export const BUCKET='elias-marmot-races';
export const CHANNEL='UC58QJgyNGyZTJ36z3IgPocg';
const isVideo=name=>/\.(mp4|mov|webm|m4v)$/i.test(name);
const safeId=id=>/^[\w-]{11}$/.test(id);
const safeError=(code,message)=>Object.assign(new Error(message),{publicCode:code});
async function request(fetcher,url,token,options={}){
 let response;try{response=await fetcher(url,{...options,headers:{...options.headers,...(token?{Authorization:`Bearer ${token}`}:{})},signal:AbortSignal.timeout(25000)});}catch{throw safeError('network','No se pudo contactar con Google. Comprueba la conexión y reintenta.');}
 let data;try{data=await response.json();}catch{throw safeError('response','Google devolvió una respuesta no válida.');}
 if(!response.ok){
  const messages={401:'La sesión de Google ha caducado. Vuelve a autorizar esta cuenta.',403:'Google denegó el acceso: revisa permisos, API habilitada o cuota.',429:'Se ha alcanzado un límite de Google. Reintenta más tarde.'};
  throw safeError(`http-${response.status}`,messages[response.status]||`Google devolvió HTTP ${response.status}. Reintenta o revisa la autorización.`);
 }
 return data;
}
async function pages(get,maxPages=200){const all=[],seen=new Set();let pageToken='';
 for(let page=0;page<maxPages;page++){
  const data=await get(pageToken);if(!Array.isArray(data.items)&&data.items!==undefined)throw safeError('response','La lista de Google no es válida.');all.push(...(data.items||[]));
  if(!data.nextPageToken)return all;
  if(seen.has(data.nextPageToken))throw safeError('pagination','Google repitió una página; no se ha sustituido el inventario anterior.');seen.add(data.nextPageToken);pageToken=data.nextPageToken;
 }
 throw safeError('limit','La consulta supera el límite de páginas; se conserva el inventario anterior.');
}
function apiURL(base,params){const url=new URL(base);url.search=new URLSearchParams(params);return url;}
export function googleReaders({root,fetcher=fetch,exec=run}={}){
 async function cloud(){
  let token;try{const result=await exec(resolve(homedir(),'.local/opt/google-cloud-sdk/bin/gcloud'),['auth','print-access-token','--quiet'],{timeout:20000,maxBuffer:1024*1024});token=result.stdout.trim();if(!token)throw Error();}catch{throw safeError('cloud-auth','Google Cloud no tiene una sesión disponible. Ejecuta gcloud auth login en este Mac.');}
  const objects=await pages(pageToken=>request(fetcher,apiURL(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o`,{maxResults:'1000',fields:'nextPageToken,items(name,size,md5Hash,crc32c,generation,updated)',...(pageToken?{pageToken}:{})}),token));
  return {bucket:BUCKET,objects:objects.filter(o=>typeof o.name==='string'&&isVideo(o.name)&&Number.isSafeInteger(Number(o.size))&&Number(o.size)>=0).map(o=>({path:o.name,bytes:Number(o.size),updated:o.updated,generation:o.generation,md5:o.md5Hash,crc32c:o.crc32c})),objectCount:objects.length};
 }
 async function youtube(knownIds=[]){
  let client,saved;try{const raw=JSON.parse(readFileSync(resolve(root,'.youtube-client.json'),'utf8'));client=raw.installed||raw.web||raw;saved=JSON.parse(readFileSync(resolve(root,'.youtube-token.json'),'utf8'));if(!client.client_id||!client.client_secret||!saved.refresh_token)throw Error();}catch{throw safeError('youtube-auth','Falta la autorización local de YouTube. Autoriza @MarbleFormula con npm run upload:auth.');}
  let auth;try{auth=await request(fetcher,'https://oauth2.googleapis.com/token',null,{method:'POST',body:new URLSearchParams({client_id:client.client_id,client_secret:client.client_secret,refresh_token:saved.refresh_token,grant_type:'refresh_token'})});if(!auth.access_token)throw Error();}catch{throw safeError('youtube-auth','No se pudo renovar YouTube. Reautoriza @MarbleFormula con npm run upload:auth.');}
  const get=(resource,params)=>request(fetcher,apiURL(`https://www.googleapis.com/youtube/v3/${resource}`,params),auth.access_token);
  const channels=await pages(pageToken=>get('channels',{part:'snippet,contentDetails',mine:'true',maxResults:'50',...(pageToken?{pageToken}:{})}));
  const channel=channels.find(c=>c.id===CHANNEL);if(!channel?.contentDetails?.relatedPlaylists?.uploads)throw safeError('channel','La cuenta autorizada no es el canal esperado @MarbleFormula. Cambia la autorización.');
  const playlist=await pages(pageToken=>get('playlistItems',{part:'contentDetails',playlistId:channel.contentDetails.relatedPlaylists.uploads,maxResults:'50',...(pageToken?{pageToken}:{})}));
  const ids=[...new Set([...playlist.map(x=>x.contentDetails?.videoId),...knownIds].filter(safeId))];const videos=[];
  for(let i=0;i<ids.length;i+=50){const response=await get('videos',{part:'snippet,status,contentDetails,fileDetails,processingDetails',id:ids.slice(i,i+50).join(',')});
   for(const v of response.items||[]){if(v.snippet?.channelId!==CHANNEL)continue;const file=v.fileDetails||{},stream=file.videoStreams?.[0]||{};
    videos.push({id:v.id,title:v.snippet.title,publishedAt:v.snippet.publishedAt,privacy:v.status?.privacyStatus,uploadStatus:v.status?.uploadStatus,processingStatus:v.processingDetails?.processingStatus,failureReason:v.status?.failureReason||v.status?.rejectionReason||v.processingDetails?.processingFailureReason,duration:v.contentDetails?.duration,definition:v.contentDetails?.definition,fileName:file.fileName,fileBytes:file.fileSize===undefined?undefined:Number(file.fileSize),fileDurationMs:file.durationMs===undefined?undefined:Number(file.durationMs),width:stream.widthPixels,height:stream.heightPixels,fps:stream.frameRateFps});
   }
  }
  return {channel:{id:channel.id,title:channel.snippet.title,handle:channel.snippet.customUrl},videos,requestedIds:ids};
 }
 return {cloud,youtube};
}
export function remoteVerification({cacheFile,readers,now=()=>new Date().toISOString(),cooldownMs=15000}={}){
 let state={schemaVersion:1,cloud:{},youtube:{}};try{const loaded=JSON.parse(readFileSync(cacheFile,'utf8'));if(loaded.schemaVersion===1)state={...state,...loaded};}catch{/* First run or invalid cache. */}
 let pending=false,job,lastStart=0;
 const snapshot=()=>structuredClone({...state,pending});
 function persist(){mkdirSync(dirname(cacheFile),{recursive:true});const temporary=`${cacheFile}.${randomUUID()}.tmp`;writeFileSync(temporary,JSON.stringify(state,null,2)+'\n',{mode:0o600});renameSync(temporary,cacheFile);}
 function start(knownIds=[]){
  if(pending)return snapshot();
  if(Date.now()-lastStart<cooldownMs)return snapshot();
  pending=true;lastStart=Date.now();const attemptedAt=now();
  job=Promise.all(['cloud','youtube'].map(async service=>{
   state[service]={...state[service],attemptedAt};
   try{const data=await readers[service](knownIds);state[service]={data,checkedAt:now(),attemptedAt,error:null};}
   catch(e){state[service]={...state[service],attemptedAt,error:{code:e.publicCode||'verification',message:e.publicCode?e.message:'No se pudo completar la verificación. Se conserva el último resultado.'}};}
  })).then(()=>{try{persist();delete state.cacheError;}catch{state.cacheError='No se pudo guardar la comprobación en este Mac.';}}).finally(()=>{pending=false;});
  return snapshot();
 }
 return {snapshot,start,wait:()=>job};
}
