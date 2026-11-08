import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,statSync,existsSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {request} from 'node:http';
import {privateRunpodConnection} from './runpod-private-connect.mjs';
const host='racecraft-test.example.ts.net',login='owner@example.invalid',dummy='rpa_'+ 'x'.repeat(40);
async function fixture(t,fetcher=async()=>new Response('[]',{status:200})){
 const dir=mkdtempSync(join(tmpdir(),'runpod-private-')),keyPath=join(dir,'key');let receipt;
 const c=privateRunpodConnection({host,login,keyPath,fetcher,onState:s=>receipt=s});
 await new Promise(r=>c.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>c.server.close(r));rmSync(dir,{recursive:true,force:true});});
 const send=(method='GET',headers={},body='')=>new Promise((ok,fail)=>{
  const req=request({host:'127.0.0.1',port:c.server.address().port,path:'/runpod-connect',method,headers:{Host:host,'Tailscale-User-Login':login,...headers}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>ok({code:res.statusCode,headers:res.headers,text}));});req.on('error',fail);req.end(body);
 });
 const form=await send();const csrf=form.text.match(/name="csrf" value="([^"]+)"/)[1],cookie=form.headers['set-cookie'][0].split(';')[0];
 const post=(extra={},key=dummy,token=csrf)=>send('POST',{Origin:'https://'+host,'Content-Type':'application/x-www-form-urlencoded',Cookie:cookie,...extra},new URLSearchParams({csrf:token,key}).toString());
 return {send,post,keyPath,csrf,cookie,get receipt(){return receipt;}};
}
test('only the authenticated tailnet owner receives the secret form',async t=>{
 const f=await fixture(t);assert.equal((await f.send('GET',{'Tailscale-User-Login':'other@example.invalid'})).code,403);
 assert.equal((await f.send('GET',{'Tailscale-User-Login':''})).code,403);
 assert.equal((await f.send('GET',{Host:'attacker.invalid'})).code,403);assert.equal(existsSync(f.keyPath),false);
});
test('cross-site, missing-cookie and invalid-CSRF submissions never save credentials',async t=>{
 const f=await fixture(t);assert.equal((await f.post({Origin:'https://attacker.invalid'})).code,403);
 assert.equal((await f.post({Origin:'null'})).code,403);
 assert.equal((await f.post({Cookie:''})).code,403);assert.equal((await f.post({},dummy,'wrong')).code,403);
 assert.equal(existsSync(f.keyPath),false);
});
test('HTML form retains its same-origin browser Origin without leaking referrers to other sites',async t=>{
 const f=await fixture(t);const page=await f.send();assert.equal(page.headers['referrer-policy'],'same-origin');
 assert.ok(page.text.includes('method="post"'));assert.equal((await f.post()).code,200);
});
test('provider rejection is not reported as connection and no key is stored',async t=>{
 const f=await fixture(t,async()=>new Response('denied',{status:401}));const r=await f.post();
 assert.equal(r.code,400);assert.equal(existsSync(f.keyPath),false);assert.equal(f.receipt,undefined);assert.ok(!r.text.includes(dummy));
});
test('accepted key is private, single use and never returned in response or receipt',async t=>{
 const f=await fixture(t,async(url,options)=>{assert.equal(url,'https://api.runpod.io/v2/pods');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+dummy);return new Response('[]');});
 const r=await f.post();assert.equal(r.code,200);assert.equal(readFileSync(f.keyPath,'utf8').trim(),dummy);
 assert.equal(statSync(f.keyPath).mode&0o777,0o600);assert.equal(f.receipt.podCreated,false);
 assert.ok(!JSON.stringify(f.receipt).includes(dummy));assert.ok(!r.text.includes(dummy));assert.equal((await f.post()).code,410);
});
test('an existing credential cannot be silently overwritten',async t=>{
 const f=await fixture(t);writeFileSync(f.keyPath,'existing\n');assert.equal((await f.post()).code,500);assert.equal(readFileSync(f.keyPath,'utf8'),'existing\n');
});
test('oversized forms and malformed keys are rejected before provider calls',async t=>{
 let calls=0;const f=await fixture(t,async()=>{calls++;return new Response('[]');});
 assert.equal((await f.post({},'bad')).code,400);
 const r=await f.send('POST',{Origin:'https://'+host,'Content-Type':'application/x-www-form-urlencoded',Cookie:f.cookie},'x'.repeat(9000));
 assert.equal(r.code,413);assert.equal(calls,0);assert.equal(existsSync(f.keyPath),false);
});
