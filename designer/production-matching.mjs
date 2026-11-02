import {basename} from 'node:path';
function durationLabel(value){
 const m=/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value||'');if(!m)return undefined;
 const seconds=Math.round(Number(m[1]||0)*86400+Number(m[2]||0)*3600+Number(m[3]||0)*60+Number(m[4]||0));if(!seconds)return undefined;
 const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds/60)%60;return `${hours?hours+':':''}${hours?String(minutes).padStart(2,'0'):minutes}:${String(seconds%60).padStart(2,'0')}`;
}
export function publicationState(video){
 if(['failed','rejected','deleted'].includes(video.uploadStatus)||['failed','terminated'].includes(video.processingStatus))return 'failed';
 if(video.processingStatus==='processing'||video.uploadStatus==='uploaded')return 'processing';
 if(video.uploadStatus==='processed'||video.processingStatus==='succeeded')return ['public','private','unlisted'].includes(video.privacy)?({public:'published',private:'private',unlisted:'unlisted'}[video.privacy]):'uploaded';
 return 'uploaded';
}
export function matchOriginal(video,assets){
 const bytes=video.fileBytes;
 if(!Number.isSafeInteger(bytes)||bytes<=0)return {state:'none',method:'none',candidates:[],reason:'YouTube no devuelve el tamaño del original; no se adivina una relación por título.'};
 const candidates=assets.flatMap(entry=>entry.locations.filter(l=>l.bytes===bytes).map(location=>({itemId:entry.id,path:location.path,type:location.type,bytes:location.bytes,generation:location.generation,md5:location.md5,crc32c:location.crc32c,observedAt:location.observedAt})));
 const named=video.fileName?candidates.filter(c=>basename(c.path)===basename(video.fileName)):[];
 const pool=named.length?named:candidates;
 // Distinct paths remain distinct candidates even if byte counts coincide.
 if(pool.length===0)return {state:'none',method:'size',candidates:[],reason:'No se encontró un archivo de este tamaño en las ubicaciones catalogadas.'};
 const state=pool.length===1?(named.length?'metadata':'candidate'):'ambiguous';
 return {state,method:named.length?'name-size':'size',candidates:pool,reason:state==='metadata'?'Nombre y número de bytes coinciden con el original informado por YouTube. No es una comparación de hash.':state==='candidate'?`Único archivo con exactamente el mismo número de bytes. ${video.fileName?'El nombre del archivo no coincide; revisar antes de confirmar el vínculo.':'YouTube no devolvió el nombre original. El tamaño no demuestra identidad binaria.'}`:'Varios archivos coinciden; no se ha elegido un original automáticamente.'};
}
export function applyYouTube(items,remote){
 if(!remote?.data)return;
 const assets=items.filter(e=>!e.youtube),seen=new Set();
 for(const video of remote.data.videos){
  let entry=items.find(e=>e.youtube?.id===video.id);
  if(!entry){entry={id:`youtube-${video.id}`,kind:'release',mode:'unknown',locations:[],sources:[],notes:[]};items.push(entry);}
  seen.add(video.id);entry.title=video.title;entry.status=publicationState(video);entry.durationLabel=durationLabel(video.duration);
  entry.youtube={...video,url:`https://youtu.be/${video.id}`,checkedAt:remote.checkedAt,stale:!!remote.error,evidence:`YouTube Data API · comprobado ${remote.checkedAt}`};
  entry.sources=[...new Set([...entry.sources,'YouTube Data API · canal propietario'])];entry.notes=[];
  entry.format=video.width&&video.height?`${video.width}×${video.height}${video.fps?` · ${Number(video.fps.toFixed(2))} fps`:''}`:video.definition&&entry.status!=='processing'?`${video.definition.toUpperCase()} · según YouTube`:undefined;
  entry.match=matchOriginal(video,assets);
  entry.next=entry.status==='processing'?'YouTube sigue informando procesamiento pendiente. Verificar en YouTube Studio antes de decidir otra subida.':entry.status==='failed'?'Revisar el motivo comunicado por YouTube antes de reintentar.':entry.match.state==='none'?'Localizar el original antes de vincular un archivo.':'Revisar la evidencia del vínculo; publicación y aprobación editorial son estados separados.';
  for(const candidate of entry.match.candidates){const asset=items.find(e=>e.id===candidate.itemId);asset.publications??=[];if(!asset.publications.some(p=>p.id===video.id))asset.publications.push({id:video.id,title:video.title,url:entry.youtube.url,status:entry.status,matchState:entry.match.state});}
 }
 for(const entry of items.filter(e=>e.youtube&&!seen.has(e.youtube.id))){
  if(remote.data.requestedIds.includes(entry.youtube.id)){entry.status='unavailable';entry.youtube={id:entry.youtube.id,url:entry.youtube.url,checkedAt:remote.checkedAt,stale:!!remote.error,evidence:'El ID solicitado no fue devuelto por YouTube. No demuestra por sí solo que se haya eliminado.'};entry.notes=['Se conserva el registro histórico. No se considera publicación actual confirmada.'];entry.next='Comprobar este ID en YouTube Studio.';}
 }
}
