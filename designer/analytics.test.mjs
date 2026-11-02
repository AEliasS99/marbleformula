import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reportWindow,reportRows,analyticsReader,analyticsManager} from './analytics.mjs';
import {CHANNEL} from './production-remote.mjs';
const result=x=>({ok:true,json:async()=>x});
const table=(headers,rows)=>({columnHeaders:headers.map(name=>({name})),rows});
test('28-day windows use Pacific calendar days, distinguish zero from absent data, and validate manual audience readings',async()=>{
 assert.deepEqual(reportWindow(new Date('2026-10-25T01:00:00Z')),{start:'2026-09-26',end:'2026-10-23',previousStart:'2026-08-29',previousEnd:'2026-09-25',timeZone:'America/Los_Angeles'});
 assert.deepEqual(reportRows(table(['views'],[[0]])),[{views:0}]);assert.deepEqual(reportRows(table(['views'],undefined)),[]);
 const dir=mkdtempSync(join(tmpdir(),'analytics-test-'));try{let fail=false;const manager=analyticsManager({cacheFile:join(dir,'analytics.json'),audienceFile:join(dir,'audience.json'),cooldownMs:0,reader:async()=>{if(fail)throw Error('secret access_token');return {checkedAt:'2026-10-25',summary:{views:0}};}});manager.start();await manager.wait();assert.equal(manager.status().data.summary.views,0);fail=true;manager.start();await manager.wait();assert.equal(manager.status().data.summary.views,0);assert.doesNotMatch(JSON.stringify(manager.status()),/secret|access_token/);
 const input={start:'2026-09-27',end:'2026-10-24',returningViewers:0,note:'Studio'};manager.record(input);assert.equal(manager.status().audience[0].source,'YouTube Studio · transcripción manual');for(const patch of [{returningViewers:-1},{returningViewers:1.5},{end:'2026-10-23'},{start:'2026-02-30'},{end:'2999-10-24'}])assert.throws(()=>manager.record({...input,...patch}));assert.equal(JSON.parse(readFileSync(join(dir,'audience.json'))).length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('Analytics read models use owned videos, supported queries, calendar windows and retention without invented returning counts',async()=>{
 const calls=[];const reader=analyticsReader({now:()=>new Date('2026-10-25T20:00:00Z'),access:async()=>'never-expose-token',fetcher:async(url,options)=>{
  const u=new URL(url);calls.push(u);assert.equal(options.method,undefined);assert.equal(options.headers.Authorization,'Bearer never-expose-token');
  if(u.pathname.endsWith('/channels'))return result({items:[{id:CHANNEL,snippet:{title:'Marble Formula'},statistics:{subscriberCount:'2'},status:{longUploadsStatus:'eligible'},contentDetails:{relatedPlaylists:{uploads:'list'}}}]});
  if(u.pathname.endsWith('/playlistItems'))return result({items:[{contentDetails:{videoId:'abcdefghij1'}},{contentDetails:{videoId:'abcdefghij2'}}]});
  if(u.pathname.endsWith('/videos'))return result({items:[{id:'abcdefghij1',snippet:{channelId:CHANNEL,title:'Marble race',publishedAt:'2026-10-01T12:00:00Z'},status:{uploadStatus:'processed',privacyStatus:'public'},statistics:{viewCount:'10'},contentDetails:{duration:'PT1M'}},{id:'abcdefghij2',snippet:{channelId:'wrong',title:'Other'}}]});
  const d=u.searchParams.get('dimensions');if(d==='day')return result(table(['day','views'],[['2026-10-23',10]]));if(d==='video')return result(table(['video','views','averageViewPercentage'],[['abcdefghij1',10,80]]));if(d==='elapsedVideoTimeRatio')return result(table(['elapsedVideoTimeRatio','audienceWatchRatio','relativeRetentionPerformance'],[[.01,1.1,.6],[1,.2,.4]]));
  return result(table(['views','estimatedMinutesWatched','averageViewDuration','averageViewPercentage','subscribersGained','subscribersLost'],[[10,8,48,80,1,0]]));
 }});const data=await reader();assert.equal(data.videos.length,1);assert.equal(data.videos[0].first7.end,'2026-10-07');assert.equal(data.videos[0].first28,null);assert.equal(data.videos[0].retention.rows[0].audienceWatchRatio,1.1);assert.equal(data.returningViewers.supportedByAPI,false);assert.doesNotMatch(JSON.stringify(data),/never-expose/);assert.ok(calls.some(u=>u.searchParams.get('filters')==='video==abcdefghij1'));
});
