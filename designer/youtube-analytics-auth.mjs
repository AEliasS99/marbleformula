import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {CHANNEL} from './production-remote.mjs';
export const ANALYTICS_SCOPES=['https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/yt-analytics.readonly'];
export const analyticsTokenPath=root=>resolve(root,'.youtube-analytics/.youtube-token.json');
export const analyticsError=(code,message)=>Object.assign(new Error(message),{publicCode:code});
function client(root){try{const raw=JSON.parse(readFileSync(resolve(root,'.youtube-client.json'),'utf8'));const c=raw.installed||raw.web||raw;if(!c.client_id||!c.client_secret)throw Error();return c;}catch{throw analyticsError('auth','Falta el cliente OAuth local de YouTube.');}}
export async function analyticsAccess(root,fetcher=fetch){
 const c=client(root);let saved;try{saved=JSON.parse(readFileSync(analyticsTokenPath(root),'utf8'));if(!saved.refresh_token)throw Error();}catch{throw analyticsError('auth','Conecta YouTube Analytics para autorizar acceso de solo lectura.');}
 const res=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,refresh_token:saved.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(25000)}).catch(()=>{throw analyticsError('network','No se pudo contactar con Google.');});
 const token=await res.json();if(!res.ok||!token.access_token)throw analyticsError('auth','La autorización de Analytics ha caducado. Vuelve a conectar.');
 const scopes=(token.scope||saved.scope||'').split(' ');if(!ANALYTICS_SCOPES.every(s=>scopes.includes(s)))throw analyticsError('auth','Falta el permiso de lectura de Analytics. Vuelve a conectar.');return token.access_token;
}
export function analyticsAuthorization({root,port=8898,fetcher=fetch,open=url=>new Promise((r,j)=>execFile('open',['-a','Google Chrome',url],e=>e?j(e):r())),timeoutMs=600000}={}){
 let status={state:existsSync(analyticsTokenPath(root))?'saved':'disconnected'},server,timer;
 const get=()=>{if(status.state==='disconnected'&&existsSync(analyticsTokenPath(root)))status={state:'saved'};return {...status};};
 function close(){clearTimeout(timer);server?.close();server=undefined;}
 async function start(){
  if(server)return get();const c=client(root),state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
  const redirect=`http://127.0.0.1:${port}/oauth2callback`;let consuming=false;
  server=createServer(async(req,res)=>{
   res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   if(req.headers.host!==`127.0.0.1:${port}`||req.method!=='GET'){res.writeHead(403);res.end('Not allowed');return;}
   const url=new URL(req.url,redirect);if(url.pathname!=='/oauth2callback'){res.writeHead(404);res.end('Not found');return;}
   if(url.searchParams.get('state')!==state||consuming){res.writeHead(403);res.end('Invalid authorization state');return;}
   if(url.searchParams.has('error')){status={state:'error',message:'Autorización cancelada en Google.'};res.end('Autorización cancelada. Puedes volver a Racecraft.');close();return;}
   const code=url.searchParams.get('code');if(!code){res.writeHead(400);res.end('Missing code');return;}consuming=true;
   try{
    const exchange=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,code,code_verifier:verifier,redirect_uri:redirect,grant_type:'authorization_code'}),signal:AbortSignal.timeout(25000)});const token=await exchange.json();
    if(!exchange.ok||!token.access_token||!token.refresh_token||!ANALYTICS_SCOPES.every(s=>(token.scope||'').split(' ').includes(s)))throw Error('scope');
    const check=await fetcher('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true',{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(25000)});const channels=await check.json();if(!check.ok||!channels.items?.some(c=>c.id===CHANNEL))throw Error('channel');
    mkdirSync(resolve(root,'.youtube-analytics'),{recursive:true,mode:0o700});const path=analyticsTokenPath(root),tmp=`${path}.${randomUUID()}.tmp`;writeFileSync(tmp,JSON.stringify({...token,obtained_at:Date.now()},null,2),{mode:0o600});renameSync(tmp,path);
    status={state:'connected',connectedAt:new Date().toISOString()};res.end('YouTube Analytics conectado a Marble Formula. Vuelve a Racecraft y pulsa Actualizar Analytics.');
   }catch{status={state:'error',message:'No se completó la autorización. Selecciona @MarbleFormula y acepta ambos permisos de lectura.'};res.writeHead(400);res.end(status.message);}finally{close();}
  });
  try{await new Promise((r,j)=>{server.once('error',j);server.listen(port,'127.0.0.1',r);});status={state:'awaiting',startedAt:new Date().toISOString()};timer=setTimeout(()=>{status={state:'error',message:'La autorización ha caducado. Puedes volver a conectar.'};close();},timeoutMs);const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:c.client_id,redirect_uri:redirect,response_type:'code',scope:ANALYTICS_SCOPES.join(' '),access_type:'offline',prompt:'select_account consent',state,code_challenge:challenge,code_challenge_method:'S256'});await open(url.href);return get();}
  catch{close();status={state:'error',message:'No se pudo abrir la autorización. Comprueba Chrome y que el puerto 8898 esté libre.'};return get();}
 }
 return {start,status:get,close};
}
