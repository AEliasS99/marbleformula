import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import{join}from'node:path';import{snapshotMaterials,stageRenderAssets,renderAssetKey}from'./render-assets.mjs';import{videoSourceKey}from'./segment-cache.mjs';
test('material snapshots survive original edits; changed frozen maps fail before staging and cache reuse',()=>{
 const root=fs.mkdtempSync(join(os.tmpdir(),'racecraft-materials-'));try{
  const source=join(root,'source'),job=join(root,'job'),snapshot=join(job,'input/public/materials'),staged=join(job,'render-public');fs.mkdirSync(source,{recursive:true});fs.writeFileSync(join(source,'oak.jpg'),'original scan');
  const assets=snapshotMaterials(source,snapshot,job);const key=videoSourceKey({renderAssets:renderAssetKey(assets)});fs.writeFileSync(join(source,'oak.jpg'),'new scan');
  stageRenderAssets(job,assets,staged);assert.equal(fs.readFileSync(join(staged,'materials/oak.jpg'),'utf8'),'original scan');
  const next=snapshotMaterials(source,join(job,'next/materials'),job);assert.notEqual(videoSourceKey({renderAssets:renderAssetKey(next)}),key,'changed appearance reused previous pixels');
  fs.writeFileSync(join(snapshot,'oak.jpg'),'corrupt frozen map');assert.throws(()=>stageRenderAssets(job,assets,staged),/changed frozen material/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('material records cannot escape the isolated public directory',()=>{
 assert.throws(()=>stageRenderAssets('/tmp',[{publicPath:'../.youtube-token.json',path:'x',sha256:'x'}],'/tmp/public'),/Unsafe/);
 assert.throws(()=>stageRenderAssets('/tmp',[{publicPath:'materials/oak.jpg',path:'../outside',sha256:'x'}],'/tmp/public'),/Unsafe/);
});
