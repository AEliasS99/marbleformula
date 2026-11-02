import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {googleReaders,remoteVerification,CHANNEL} from './production-remote.mjs';
import {matchOriginal,publicationState,applyYouTube} from './production-matching.mjs';
const response=x=>({ok:true,json:async()=>x});
function fixture(){const root=mkdtempSync(join(tmpdir(),'racecraft-remote-'));writeFileSync(join(root,'.youtube-client.json'),JSON.stringify({installed:{client_id:'client-secret-marker',client_secret:'never-show-client'}}));writeFileSync(join(root,'.youtube-token.json'),JSON.stringify({refresh_token:'never-show-refresh'}));return root;}

test('authenticated readers paginate, select the correct owner and strip secrets and unrelated objects',async()=>{
 const root=fixture(),calls=[];try{
 const readers=googleReaders({root,exec:async()=>({stdout:'never-show-cloud-token'}),fetcher:async(url,options)=>{
  const u=new URL(url);calls.push({url:u,method:options.method||'GET'});
  if(u.hostname==='oauth2.googleapis.com'){assert.equal(options.method,'POST');return response({access_token:'never-show-youtube-token'});}
  assert.ok(options.headers.Authorization);assert.equal(options.method,undefined);
  if(u.hostname==='storage.googleapis.com')return response(u.searchParams.has('pageToken')?{items:[{name:'b.mp4',size:'20',generation:'2'}]}:{items:[{name:'a.mp4',size:'10',generation:'1',md5Hash:'hash'},{name:'.youtube-token.json',size:'100'}],nextPageToken:'next'});
  if(u.pathname.endsWith('channels'))return response({items:[{id:'other'},{id:CHANNEL,snippet:{title:'Marble Formula',customUrl:'@marbleformula'},contentDetails:{relatedPlaylists:{uploads:'uploads'}}}]});
  if(u.pathname.endsWith('playlistItems'))return response(u.searchParams.has('pageToken')?{items:[{contentDetails:{videoId:'abcdefghij2'}}]}:{items:[{contentDetails:{videoId:'abcdefghij1'}}],nextPageToken:'next'});
  if(u.pathname.endsWith('videos')){assert.equal(u.searchParams.get('id'),'abcdefghij1,abcdefghij2,abcdefghij3');return response({items:[{id:'abcdefghij1',snippet:{channelId:CHANNEL,title:'Real title'},status:{privacyStatus:'public',uploadStatus:'processed'},processingDetails:{processingStatus:'succeeded'},fileDetails:{fileSize:'10',fileName:'a.mp4',videoStreams:[{widthPixels:3840,heightPixels:2160,frameRateFps:60}],extraSecret:'hidden'}},{id:'abcdefghij2',snippet:{channelId:'other',title:'Wrong owner'}}]});}
  throw Error('unexpected');
 }});
 const cloud=await readers.cloud(),youtube=await readers.youtube(['abcdefghij3']);assert.equal(cloud.objects.length,2);assert.equal(cloud.objectCount,3);assert.equal(youtube.videos.length,1);assert.equal(youtube.videos[0].fileBytes,10);assert.equal(youtube.videos[0].width,3840);assert.deepEqual(youtube.requestedIds,['abcdefghij1','abcdefghij2','abcdefghij3']);assert.doesNotMatch(JSON.stringify({cloud,youtube}),/never-show|extraSecret|youtube-token/);assert.equal(calls.filter(c=>c.method==='POST').length,1,'only OAuth token exchange uses POST');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('partial failure retains last success; concurrent checks coalesce; cache survives restart',async()=>{
 const dir=fixture(),cacheFile=join(dir,'cache.json');let fail=false,calls=0,release;
 const readers={cloud:async()=>{calls++;if(fail)throw Error('Bearer never-show-secret');return {objects:[{path:'a.mp4',bytes:10}]};},youtube:async()=>{if(release)await new Promise(r=>release=r);return {videos:[],requestedIds:[],channel:{id:CHANNEL}};}};
 try{const v=remoteVerification({cacheFile,readers,cooldownMs:0});v.start();await v.wait();const first=v.snapshot();assert.ok(first.cloud.checkedAt);fail=true;release=true;v.start();v.start();await new Promise(r=>setImmediate(r));assert.equal(calls,2);release();await v.wait();const next=v.snapshot();assert.deepEqual(next.cloud.data,first.cloud.data);assert.equal(next.cloud.checkedAt,first.cloud.checkedAt);assert.ok(next.cloud.error);assert.equal(next.pending,false);assert.doesNotMatch(JSON.stringify(next),/never-show/);assert.doesNotMatch(readFileSync(cacheFile,'utf8'),/never-show/);assert.deepEqual(remoteVerification({cacheFile,readers}).snapshot().cloud,next.cloud);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('wrong owner and repeated pages fail without leaking provider errors',async()=>{
 const root=fixture();try{
 const readers=googleReaders({root,exec:async()=>({stdout:'token'}),fetcher:async url=>{const u=new URL(url);if(u.hostname==='oauth2.googleapis.com')return response({access_token:'token'});if(u.pathname.endsWith('channels'))return response({items:[{id:'wrong-account',snippet:{},contentDetails:{}}]});return response({items:[],nextPageToken:'same'});}});
 await assert.rejects(readers.youtube(),/canal esperado/);await assert.rejects(readers.cloud(),/repitió una página/);
 const bad=googleReaders({root,exec:async()=>{throw Error('secret');}});await assert.rejects(bad.cloud(),e=>e.publicCode==='cloud-auth'&&!e.message.includes('secret'));
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('matching distinguishes metadata, size candidates, ambiguity and unknown; processing is not published',()=>{
 const asset=(id,path,bytes)=>({id,locations:[{path,type:'cloud',bytes}],notes:[]});const assets=[asset('a','gs://bucket/a.mp4',10),asset('b','gs://bucket/b.mp4',20)];
 assert.equal(matchOriginal({fileName:'a.mp4',fileBytes:10},assets).state,'metadata');assert.equal(matchOriginal({fileBytes:10},assets).state,'candidate');assert.equal(matchOriginal({title:'a.mp4'},assets).state,'none');assert.equal(matchOriginal({fileBytes:10},[...assets,asset('c','gs://bucket/c.mp4',10)]).state,'ambiguous');assert.equal(matchOriginal({fileName:'b.mp4',fileBytes:10},assets).state,'candidate');
 assert.equal(publicationState({privacy:'public',uploadStatus:'uploaded',processingStatus:'processing'}),'processing');assert.equal(publicationState({privacy:'public',uploadStatus:'processed',processingStatus:'succeeded'}),'published');assert.equal(publicationState({privacy:'private',uploadStatus:'processed'}),'private');assert.equal(publicationState({privacy:'public',uploadStatus:'rejected'}),'failed');
 const items=[...assets,{id:'youtube-abcdefghij2',youtube:{id:'abcdefghij2'},sources:[],notes:[],locations:[]}];
 applyYouTube(items,{checkedAt:'2026-10-25',data:{requestedIds:['abcdefghij1','abcdefghij2'],videos:[{id:'abcdefghij1',title:'New',fileBytes:10,privacy:'public',uploadStatus:'uploaded',processingStatus:'processing'}]}});assert.equal(items.find(e=>e.id==='youtube-abcdefghij2').status,'unavailable');assert.equal(items.find(e=>e.id==='youtube-abcdefghij1').status,'processing');assert.equal(assets[0].publications[0].id,'abcdefghij1');assert.equal(items.find(e=>e.id==='youtube-abcdefghij1').locations.length,0,'candidate is not silently promoted to verified original');
});
