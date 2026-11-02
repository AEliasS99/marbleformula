import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {analyticsAccess,analyticsError} from './youtube-analytics-auth.mjs';
import {CHANNEL} from './production-remote.mjs';
const DAY=86400000,metrics='views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost';
const iso=d=>new Date(d).toISOString().slice(0,10);
export function reportWindow(now=new Date()){
 const pacific=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const end=Date.parse(pacific+'T00:00:00Z')-DAY;
 return {start:iso(end-27*DAY),end:iso(end),previousStart:iso(end-55*DAY),previousEnd:iso(end-28*DAY),timeZone:'America/Los_Angeles'};
}
export function reportRows(report){
 if(!Array.isArray(report.columnHeaders))throw analyticsError('response','Analytics devolvió un informe sin columnas.');
 return (report.rows||[]).map(row=>Object.fromEntries(report.columnHeaders.map((h,i)=>[h.name,row[i]])));
}
export function analyticsReader({root,fetcher=fetch,access=()=>analyticsAccess(root,fetcher),now=()=>new Date()}={}){
 return async()=>{
  const token=await access(),period=reportWindow(now());
  async function get(base,params){const url=new URL(base);url.search=new URLSearchParams(params);let res;try{res=await fetcher(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(25000)});}catch{throw analyticsError('network','No se pudo contactar con YouTube Analytics.');}
   let data;try{data=await res.json();}catch{throw analyticsError('response','Respuesta de Analytics no válida.');}
   if(!res.ok){const disabled=data.error?.errors?.some(e=>e.reason==='accessNotConfigured')||data.error?.details?.some(d=>d.reason==='SERVICE_DISABLED');throw analyticsError(disabled?'api-disabled':`http-${res.status}`,disabled?'Activa YouTube Analytics API en el proyecto de Google Cloud del cliente OAuth.':res.status===403?'Analytics denegó el acceso. Comprueba los permisos de lectura, la API y la cuota.':res.status===401?'La sesión de Analytics ha caducado. Vuelve a conectar.':`YouTube Analytics respondió HTTP ${res.status}.`);}return data;
  }
  const yt=(r,p)=>get(`https://www.googleapis.com/youtube/v3/${r}`,p);
  const channels=await yt('channels',{part:'id,snippet,contentDetails,statistics,status',mine:'true'}),channel=channels.items?.find(c=>c.id===CHANNEL);if(!channel)throw analyticsError('channel','La autorización no pertenece a @MarbleFormula.');
  let ids=[],pageToken='';const seen=new Set();do{const page=await yt('playlistItems',{part:'contentDetails',playlistId:channel.contentDetails.relatedPlaylists.uploads,maxResults:'50',...(pageToken?{pageToken}:{})});ids.push(...(page.items||[]).map(x=>x.contentDetails?.videoId).filter(x=>/^[\w-]{11}$/.test(x)));pageToken=page.nextPageToken;if(pageToken&&seen.has(pageToken))throw analyticsError('pagination','Paginación repetida; se conserva el informe anterior.');seen.add(pageToken);if(ids.length>10000)throw analyticsError('limit','Demasiados vídeos para esta consulta.');}while(pageToken);
  const videos=[];for(let i=0;i<ids.length;i+=50){const page=await yt('videos',{part:'snippet,status,contentDetails,statistics',id:ids.slice(i,i+50).join(',')});for(const v of page.items||[])if(v.snippet?.channelId===CHANNEL)videos.push({id:v.id,title:v.snippet.title,publishedAt:v.snippet.publishedAt,duration:v.contentDetails?.duration,uploadStatus:v.status?.uploadStatus,privacy:v.status?.privacyStatus,lifetimeViews:Number(v.statistics?.viewCount||0),series:/\bcars?\b|touring|\bTCR\b/i.test(v.snippet.title)?'cars':/marble/i.test(v.snippet.title)?'marbles':'unknown'});}
  const query=async(start,end,extra={})=>reportRows(await get('https://youtubeanalytics.googleapis.com/v2/reports',{ids:`channel==${CHANNEL}`,startDate:start,endDate:end,metrics,...extra}));
  // Fetch independent channel reports together; one failed report does not replace the prior complete snapshot.
  const [summary,previous,daily]=await Promise.all([query(period.start,period.end),query(period.previousStart,period.previousEnd),query(period.start,period.end,{dimensions:'day',sort:'day'})]);
  const perVideo=[];let startIndex=1;for(let i=0;i<100;i++){const rows=await query(period.start,period.end,{dimensions:'video',sort:'-views',maxResults:'200',startIndex:String(startIndex)});perVideo.push(...rows);if(rows.length<200)break;startIndex+=rows.length;if(i===99)throw analyticsError('limit','El informe de vídeos está incompleto.');}
  const dataThrough=daily.length?daily.at(-1).day:null;
  for(const v of videos){v.metrics=perVideo.find(r=>r.video===v.id)||null;v.first7=null;v.first28=null;const publishedDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v.publishedAt));
   for(const days of [7,28]){const end=iso(Date.parse(publishedDay+'T00:00:00Z')+(days-1)*DAY);if(v.uploadStatus==='processed'&&dataThrough&&end<=dataThrough){try{const rows=await query(publishedDay,end,{filters:`video==${v.id}`});v[`first${days}`]={start:publishedDay,end,metrics:rows[0]||null};}catch{v[`first${days}`]={start:publishedDay,end,error:'No se pudo consultar esta ventana.'};}}}
   if(v.uploadStatus==='processed'){try{v.retention={rows:await query(period.start,period.end,{dimensions:'elapsedVideoTimeRatio',metrics:'audienceWatchRatio,relativeRetentionPerformance',filters:`video==${v.id}`})};}catch{v.retention={error:'La retención no está disponible para este vídeo en esta consulta.',rows:[]};}}
  }
  return {period,dataThrough,channel:{id:channel.id,title:channel.snippet.title,subscribers:Number(channel.statistics?.subscriberCount||0),longUploadsStatus:channel.status?.longUploadsStatus},summary:summary[0]||null,previous:previous[0]||null,daily,videos,returningViewers:{supportedByAPI:false,source:'YouTube Studio'},checkedAt:now().toISOString()};
 };
}
function atomic(file,value){mkdirSync(dirname(file),{recursive:true});const tmp=`${file}.${randomUUID()}.tmp`;writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(tmp,file);}
export function analyticsManager({cacheFile,audienceFile,reader,cooldownMs=30000}={}){
 let cache={};try{cache=JSON.parse(readFileSync(cacheFile,'utf8'));}catch{}let audience=[];try{audience=JSON.parse(readFileSync(audienceFile,'utf8'));if(!Array.isArray(audience))audience=[];}catch{}
 let pending=false,job,lastStart=0;
 const status=()=>structuredClone({...cache,pending,audience});
 function start(){if(pending||Date.now()-lastStart<cooldownMs)return status();pending=true;lastStart=Date.now();cache.attemptedAt=new Date().toISOString();job=(async()=>{try{const data=await reader();cache={data,checkedAt:data.checkedAt,attemptedAt:cache.attemptedAt,error:null};}catch(e){cache.error={code:e.publicCode||'error',message:e.publicCode?e.message:'No se pudo completar Analytics. Se conserva el último informe.'};}try{atomic(cacheFile,cache);}catch{cache.cacheError='No se pudo guardar el informe local.';}pending=false;})();return status();}
 function record(input){
  const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&iso(s)===s;
  if(!input||typeof input!=='object'||!validDate(input.start)||!validDate(input.end)||Date.parse(input.end)-Date.parse(input.start)!==27*DAY||Date.parse(input.end)>Date.now()||!Number.isSafeInteger(input.returningViewers)||input.returningViewers<0||input.returningViewers>1e10||typeof input.note!=='string'||input.note.length>500)throw Object.assign(new Error('Indica un periodo válido de 28 días, un recuento entero y una nota de hasta 500 caracteres.'),{status:400});
  const entry={id:randomUUID(),start:input.start,end:input.end,returningViewers:input.returningViewers,note:input.note,source:'YouTube Studio · transcripción manual',recordedAt:new Date().toISOString()};const next=[entry,...audience].slice(0,200);atomic(audienceFile,next);audience=next;return entry;
 }
 return {status,start,record,wait:()=>job};
}
