import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,statSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {analyticsAuthorization,ANALYTICS_SCOPES,analyticsTokenPath} from './youtube-analytics-auth.mjs';
import {CHANNEL} from './production-remote.mjs';
test('Analytics OAuth verifies state, PKCE, scopes and channel; preserves uploader credentials',async()=>{
 const root=mkdtempSync(join(tmpdir(),'analytics-oauth-'));let url,exchanges=0,channelId=CHANNEL;writeFileSync(join(root,'.youtube-client.json'),JSON.stringify({installed:{client_id:'fake-client',client_secret:'fake-secret'}}));writeFileSync(join(root,'.youtube-token.json'),'original-uploader-file');
 const auth=analyticsAuthorization({root,port:18898,open:async value=>url=new URL(value),fetcher:async(u,options)=>{if(String(u).includes('oauth2.googleapis.com')){exchanges++;assert.ok(options.body.get('code_verifier').length>=43);return {ok:true,json:async()=>({access_token:'fake-access',refresh_token:'fake-refresh',scope:ANALYTICS_SCOPES.join(' ')})};}return {ok:true,json:async()=>({items:[{id:channelId}]})};}});
 try{assert.equal((await auth.start()).state,'awaiting');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('scope'),ANALYTICS_SCOPES.join(' '));assert.equal((await fetch('http://127.0.0.1:18898/oauth2callback?state=bad&code=fake')).status,403);assert.equal(exchanges,0);
 const callback=new URL(url.searchParams.get('redirect_uri'));callback.search=new URLSearchParams({state:url.searchParams.get('state'),code:'fake-code'});assert.equal((await fetch(callback)).status,200);assert.equal(auth.status().state,'connected');assert.equal(statSync(analyticsTokenPath(root)).mode&0o777,0o600);assert.equal(readFileSync(join(root,'.youtube-token.json'),'utf8'),'original-uploader-file');assert.doesNotMatch(JSON.stringify(auth.status()),/fake-access|fake-refresh|fake-secret/);
 const saved=readFileSync(analyticsTokenPath(root),'utf8');channelId='wrong-channel';await auth.start();const wrong=new URL(url.searchParams.get('redirect_uri'));wrong.search=new URLSearchParams({state:url.searchParams.get('state'),code:'fake-code'});assert.equal((await fetch(wrong)).status,400);assert.equal(auth.status().state,'error');assert.equal(readFileSync(analyticsTokenPath(root),'utf8'),saved,'wrong channel must not replace working grant');
 }finally{auth.close();rmSync(root,{recursive:true,force:true});}
});
