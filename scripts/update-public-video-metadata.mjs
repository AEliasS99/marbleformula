// Owner-authorized editorial edits. No uploads, status writes, privacy changes,
// publication, scheduling, channel branding or storefront provisioning.
import fs from'node:fs';import{resolve}from'node:path';import{isDeepStrictEqual}from'node:util';
import{publicVideoMetadata}from'./public-video-metadata.mjs';
const root=process.cwd(),channel='UC58QJgyNGyZTJ36z3IgPocg',directory=resolve('out/public-metadata-20261031');
const planPath=resolve(process.argv.find(a=>a.startsWith('--plan-file='))?.slice(12)??directory+'/youtube-plan.json');
const read=p=>JSON.parse(fs.readFileSync(p));
const write=(p,d)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(d,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
async function access(){
 const raw=read(root+'/.youtube-client.json'),c=raw.installed??raw.web??raw,t=read(root+'/.youtube-token.json');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:c.client_id,client_secret:c.client_secret,refresh_token:t.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('Existing YouTube authorization needs renewal');
 const d=await r.json();if(!d.access_token)throw Error('Existing YouTube authorization needs renewal');return d.access_token;
}
function snippet(v){const s=v.snippet;return Object.fromEntries(['title','description','categoryId','tags','defaultLanguage','defaultAudioLanguage'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]]));}
try{
 fs.mkdirSync(directory,{recursive:true});const token=await access();
 const request=async(resource,params,body)=>{const u=new URL('https://www.googleapis.com/youtube/v3/'+resource);u.search=new URLSearchParams(params);const r=await fetch(u,{method:body?'PUT':'GET',headers:{Authorization:'Bearer '+token,'Cache-Control':'no-cache',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('YouTube metadata request HTTP '+r.status);return r.json();};
 const owned=await request('channels',{part:'id,contentDetails',mine:'true'}),owner=owned.items?.find(c=>c.id===channel);if(!owner)throw Error('Expected Marble Formula channel was not authorized');
 if(process.argv.includes('--plan')){
  if(fs.existsSync(planPath))throw Error('Existing editorial plan preserved; use its file or inspect before replacing');
  const ids=[];let pageToken;do{const p=await request('playlistItems',{part:'contentDetails',playlistId:owner.contentDetails.relatedPlaylists.uploads,maxResults:'50',...(pageToken?{pageToken}:{})});ids.push(...p.items.map(i=>i.contentDetails.videoId));pageToken=p.nextPageToken;}while(pageToken);
  const entries=[];for(let i=0;i<ids.length;i+=50){const p=await request('videos',{part:'snippet,status',id:ids.slice(i,i+50).join(',')});for(const v of p.items??[]){
   if(v.snippet.channelId!==channel||v.status.uploadStatus!=='processed')continue;
   const before=snippet(v),m=publicVideoMetadata(before),after=Object.fromEntries(Object.keys(before).map(k=>[k,m[k]]));
   if(!isDeepStrictEqual(before,after))entries.push({id:v.id,url:'https://youtu.be/'+v.id,privacy:v.status.privacyStatus,before,after});
  }}
  const plan={createdAt:new Date().toISOString(),channel,scope:'title,description,tags only; preserve languages/category/privacy',entries};write(planPath,plan);
  console.log(JSON.stringify({plan:planPath,videos:entries.length,titlesCleaned:entries.filter(e=>e.before.title!==e.after.title).length,italy:entries.find(e=>e.id==='eUypBhODwuI')?.after},null,2));
 }else if(process.argv.includes('--apply')){
  const plan=read(planPath);if(plan.channel!==channel)throw Error('Editorial plan has the wrong channel');
  const receiptPath=planPath.replace(/\.json$/,'.applied.json');let receipt=fs.existsSync(receiptPath)?read(receiptPath):{startedAt:new Date().toISOString(),channel,items:[]};
  for(const e of plan.entries){
   const live=(await request('videos',{part:'snippet,status',id:e.id})).items?.[0];
   if(!live||live.snippet.channelId!==channel||live.status.privacyStatus!==e.privacy)throw Error('Video ownership or visibility changed; stop before overwriting');
   if(!isDeepStrictEqual(snippet(live),e.after)){
    if(!isDeepStrictEqual(snippet(live),e.before))throw Error('Listing was edited after planning; stop before overwriting');
    const accepted=await request('videos',{part:'snippet'},{id:e.id,snippet:e.after});
    if(!isDeepStrictEqual(snippet(accepted),e.after))throw Error('Updated listing write was not accepted as requested');
   }
   receipt.items=receipt.items.filter(x=>x.id!==e.id);receipt.items.push({id:e.id,title:e.after.title,privacy:e.privacy,acceptedAt:new Date().toISOString(),verification:'pending fresh batch read'});write(receiptPath,receipt);
  }
  // A fresh batch query avoids repeated stale per-video reads immediately
  // after PUT. It verifies all accepted edits and every visibility together.
  let pending=plan.entries;
  for(let attempt=0;attempt<12&&pending.length;attempt++){
   if(attempt)await new Promise(done=>setTimeout(done,2500));
   const checked=await request('videos',{part:'snippet,status',id:pending.map(e=>e.id).join(','),prettyPrint:'false'});
   const remaining=[];
   for(const e of pending){const v=checked.items?.find(v=>v.id===e.id);if(!v||v.status.privacyStatus!==e.privacy)throw Error('Updated listing visibility did not verify');
    if(!isDeepStrictEqual(snippet(v),e.after)){remaining.push(e);continue;}
    const item=receipt.items.find(v=>v.id===e.id);Object.assign(item,{verifiedAt:new Date().toISOString(),verification:'verified',website:v.snippet.description.includes('https://marbleformula.com')});
   }
   pending=remaining;write(receiptPath,receipt);
  }
  if(pending.length)throw Error('Updated listing did not verify');
  receipt.completedAt=new Date().toISOString();write(receiptPath,receipt);console.log(JSON.stringify({updatedAndVerified:receipt.items.length,privacyChanged:false,uploads:0,receipt:receiptPath}));
 }else throw Error('Expected --plan or --apply');
}catch(e){console.error(e.message.startsWith('YouTube metadata')||e.message.startsWith('Existing')||e.message.startsWith('Expected')||e.message.startsWith('Listing')||e.message.startsWith('Video ')||e.message.startsWith('Updated')?e.message:'Public metadata update could not complete; inspect local plan and receipt');process.exitCode=1;}
