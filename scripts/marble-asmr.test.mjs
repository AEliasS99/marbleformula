import {audioCredit} from '../src/gp/audio-credit.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {soundtrack} from './season.mjs';import {copyRetimedAudio} from './marble-audio.mjs';
function fixture(moving=false){const frames=Array.from({length:180},(_,f)=>[[moving?f*.04:0,0,0,0,0,0,1,moving?f*.04:0]]);return{data:{fps:60,frames,cams:frames.map(()=>[0,5,10,0,0,0,55,'lead',0]),timeline:{total:180,lights:[],raceStart:0,segments:[{kind:'live',at:0,from:0,to:180}],replay:{at:180,from:0,frames:0,speed:.35},results:{at:600},standings:{at:900}},marbles:[{finishFrame:null}],order:[0],events:[]},impacts:[]};}
function samples(wav){return new Int16Array(wav.buffer,wav.byteOffset+44,(wav.length-44)/2);}
function random(){let s=67;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
test('ASMR does not fill physical silence with a music/crowd/drone bed',()=>{
 const silent=samples(soundtrack(fixture(),random(),{mixProfile:'asmr-v1'}));assert.ok(silent.every(x=>x===0));
 const music=samples(soundtrack(fixture(),random(),{broadcast:true}));assert.ok(music.some(x=>x!==0),'control fixture actually exercises the old musical mix');
});
test('ASMR keeps the existing physical rolling and joint contacts audible',()=>{
 const s=samples(soundtrack(fixture(true),random(),{mixProfile:'asmr-v1'}));const rms=Math.sqrt(s.reduce((n,x)=>n+(x/32768)**2,0)/s.length);assert.ok(rms>.001,'moving marbles must produce tactile sound');assert.ok([...s].every(x=>Math.abs(x)<=27854),'linked peak headroom');
});
test('distant mechanisms do not become a continuous all-track motor bed',()=>{
 const far=fixture();far.data.boosters=[{pos:[10000,0,0]}];const quiet=samples(soundtrack(far,random(),{mixProfile:'asmr-v1'}));assert.ok(quiet.every(x=>x===0));
 const near=fixture();near.data.boosters=[{pos:[0,0,0]}];assert.ok(samples(soundtrack(near,random(),{mixProfile:'asmr-v1'})).some(x=>x!==0),'nearby visible mechanisms retain their sound');
});
test('replay retimes the physical stereo contact bus, preserving its sample clock and side',()=>{
 const l=Float32Array.from([0,1,2,3,4,5]),r=Float32Array.from([0,-1,-2,-3,-4,-5]),a=new Float32Array(8),b=new Float32Array(8);
 copyRetimedAudio(l,r,a,b,{sourceStart:1,outputStart:2,length:4,speed:.5});assert.deepEqual([...a],[0,0,1,1.5,2,2.5,0,0]);assert.deepEqual([...b],[0,0,-1,-1.5,-2,-2.5,0,0]);
});

test('declared ASMR soundtrack never receives the legacy song credit',()=>{
 const credit=audioCredit({round:1,info:{vehicle:'marble'},audioProfile:'asmr-v1'});
 assert.equal(credit.label,'Sound:');assert.equal(credit.title,'Marble & track sounds');assert.notEqual(credit.icon,'🎵');
});
test('historical music credits remain unchanged and unknown mixes never invent a song',()=>{
 for(const [round,title]of [[1,'Neon Strip Velocity'],[2,'Interlagos Samba'],[5,'Yas Marina Finale']])assert.deepEqual(audioCredit({round}),{label:'Song:',title,icon:'🎵'});
 assert.equal(audioCredit({info:{vehicle:'car'}}).title,'Marble Formula · Original Synthwave');
 assert.equal(audioCredit({audioProfile:'future-mix'}).title,'Race audio');
 // Intro/scenery alone is not evidence of the soundtrack used in old masters.
 assert.equal(audioCredit({intro:{profile:'marble-race-first-v1'},info:{sceneryProfile:'tuscany-venue-v3'}}).label,'Song:');
});
