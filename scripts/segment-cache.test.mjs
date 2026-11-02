import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';
import{videoSourceKey,findCachedSegment,rememberSegment,unchangedShowcaseRange}from'./segment-cache.mjs';
test('cache keys are stable for identical inputs and invalidate for any picture/quality change',()=>{
 const key=videoSourceKey({race:'a',sources:{b:'2',a:'1'},flags:['4k','60fps']});assert.equal(key,videoSourceKey({flags:['4k','60fps'],sources:{a:'1',b:'2'},race:'a'}));assert.notEqual(key,videoSourceKey({race:'b',sources:{b:'2',a:'1'},flags:['4k','60fps']}));assert.notEqual(key,videoSourceKey({race:'a',sources:{b:'3',a:'1'},flags:['4k','60fps']}));
});
test('reusing showroom segments cannot include the title, track overview or racing',()=>{
 const d={intro:{vehicle:'car',scenes:[{id:'cars',at:60,frames:1080}]}};assert.ok(unchangedShowcaseRange(d,180,359));assert.ok(!unchangedShowcaseRange(d,0,179));assert.ok(!unchangedShowcaseRange(d,1080,1259));assert.ok(!unchangedShowcaseRange(d,1200,1379));
});
test('verified cache handles deleted rebuildable files and refuses modified bytes/evidence',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'race-segment-cache-'));try{
 const part=path.join(root,'clip.mp4');fs.writeFileSync(part,'test segment');fs.writeFileSync(part+'.scene.json','{"passed":true}');rememberSegment(root,'key',180,359,part);assert.equal(findCachedSegment(root,'key',180,359).path,part);
 fs.writeFileSync(part+'.scene.json','modified');assert.throws(()=>findCachedSegment(root,'key',180,359),/evidence changed/);fs.writeFileSync(part+'.scene.json','{"passed":true}');fs.writeFileSync(part,'modified');assert.throws(()=>findCachedSegment(root,'key',180,359),/segment changed/);fs.unlinkSync(part);assert.equal(findCachedSegment(root,'key',180,359),null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
