import test from 'node:test';import assert from 'node:assert/strict';
import {rollingContact,renderContactRoll} from './marble-contact-audio.mjs';
import {soundtrack} from './season.mjs';
import fs from 'node:fs';
const data=(height=.35)=>({fps:60,info:{length:100,trackSurface:'timber-craft'},marbleRadius:.35,
 samples:[0,100].map(u=>({u,p:[u,0,0],n:[0,1,0],r:[0,0,1],t:[1,0,0],w:2.1})),
 frames:Array.from({length:180},(_,f)=>[[f*.04,height,0,0,0,0,1,f*.04]]),cams:Array.from({length:180},()=>[0,4,8,5,0,0,55]),
 marbles:[{finishFrame:null,dqFrame:null}],events:[],order:[0],timeline:{total:180,raceStart:0,lights:[],segments:[{kind:'live',at:0,from:0,to:180}],replay:{at:180,frames:0,from:0,speed:.35},results:{at:600},standings:{at:900}}});
const sum=a=>a.reduce((s,x)=>s+x*x,0);
test('recorded second-lap grid contact uses the actual negative track origin',()=>{
 const saved=JSON.parse(fs.readFileSync(new URL('./fixtures/italy-audio-lap-seam.json',import.meta.url)));
 for(const c of saved.cases){
  const d={...saved,frames:[[c.previous],[c.pose]],marbles:[{finishFrame:null,dqFrame:null}],timeline:{raceStart:0}};
  assert.equal(rollingContact(d,0,1).supported,true,'real rolling contact lost at '+c.frame);
  const firstLap={...d,frames:d.frames.map(row=>row.map(p=>p.map((v,i)=>i===7?v-d.info.length:v)))};
  assert.deepEqual(rollingContact(d,0,1),rollingContact(firstLap,0,1),'same surface must sound the same on either lap');
  const airborne={...d,frames:d.frames.map(row=>row.map(p=>p.map((v,i)=>i===1?v+2:v)))};
  assert.equal(rollingContact(airborne,0,1).supported,false,'wrap fix must not invent airborne support');
 }
});
test('contact audio refuses flight, gaps, finishers and eliminated racers',()=>{
 const d=data();assert.ok(rollingContact(d,0,60).supported);
 assert.equal(rollingContact(data(2),0,60).supported,false);
 d.samples[0].gap=true;assert.equal(rollingContact(d,0,60).supported,false);delete d.samples[0].gap;
 d.marbles[0].finishFrame=60;assert.equal(rollingContact(d,0,60).supported,false);d.marbles[0].finishFrame=null;d.marbles[0].dqFrame=60;assert.equal(rollingContact(d,0,60).supported,false);
});
test('supported surface travel excites discrete resonances; airborne travel produces zero rolling samples',()=>{
 const d=data(),l=new Float32Array(132300),r=new Float32Array(l.length),report=renderContactRoll(d,l,r);
 assert.ok(sum(l)+sum(r)>.1);assert.ok(report.textureContacts>40);assert.equal(report.whiteNoiseBed,false);
 const al=new Float32Array(l.length),ar=new Float32Array(l.length);renderContactRoll(data(2),al,ar);assert.equal(sum(al)+sum(ar),0);
 const silent=data();silent.frames.forEach(f=>f[0][0]=f[0][7]=0);const sl=new Float32Array(l.length),sr=new Float32Array(l.length);renderContactRoll(silent,sl,sr);assert.equal(sum(sl)+sum(sr),0);
});
test('full ASMR-v2 soundtrack renders rolling even without an optional diagnostics callback',()=>{
 let state=1;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
 const wav=soundtrack({data:data(),impacts:[]},rand,{mixProfile:'asmr-v2'}),samples=new Int16Array(wav.buffer,wav.byteOffset+44,(wav.length-44)/2);
 assert.ok(sum(samples)>1e8,'contact stem was accidentally skipped');
 const air=soundtrack({data:data(2),impacts:[]},rand,{mixProfile:'asmr-v2'}),a=new Int16Array(air.buffer,air.byteOffset+44,(air.length-44)/2);assert.ok(a.every(x=>x===0),'flying marbles cannot produce a steady rolling/joint hiss');
});
