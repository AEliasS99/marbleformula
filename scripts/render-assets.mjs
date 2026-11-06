import fs from'node:fs';import{resolve,relative,dirname,isAbsolute}from'node:path';import{createHash}from'node:crypto';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(p,e.name)):e.isFile()?[resolve(p,e.name)]:[]);
const safe=p=>typeof p==='string'&&!isAbsolute(p)&&!p.split(/[\\/]/).some(s=>s==='..'||s==='')&&!p.includes(':');
export function snapshotMaterials(source,output,directory,namespace='materials'){
 if(!['materials','props'].includes(namespace))throw Error('Unsafe render asset namespace');
 if(!fs.existsSync(source))return[];
 const records=[];for(const file of walk(source)){
  const name=relative(source,file),target=resolve(output,name),sha256=hash(file);fs.mkdirSync(dirname(target),{recursive:true});
  if(fs.existsSync(target)){if(hash(target)!==sha256)throw Error('Frozen material asset changed: '+name);}else fs.copyFileSync(file,target);
  records.push({publicPath:namespace+'/'+name,path:relative(directory,target),sha256});
 }return records;
}
export function stageRenderAssets(directory,assets,publicDirectory){
 const seen=new Map();for(const a of assets){
  if(!safe(a.publicPath)||!['materials/','props/'].some(prefix=>a.publicPath.startsWith(prefix))||!safe(a.path))throw Error('Unsafe render asset path');
  if(seen.has(a.publicPath)&&seen.get(a.publicPath)!==a.sha256)throw Error('Conflicting render asset');seen.set(a.publicPath,a.sha256);
  const source=resolve(directory,a.path);if(!fs.existsSync(source)||hash(source)!==a.sha256)throw Error('Missing or changed frozen material: '+a.publicPath);
  const target=resolve(publicDirectory,a.publicPath);fs.mkdirSync(dirname(target),{recursive:true});
  if(!fs.existsSync(target)||hash(target)!==a.sha256)fs.copyFileSync(source,target);
 }
}
export const renderAssetKey=assets=>assets.map(({publicPath,sha256})=>({publicPath,sha256})).sort((a,b)=>a.publicPath.localeCompare(b.publicPath));
export function assertSceneAssetCoverage(data,assets=[]){
 const required=[];
 if(data.info?.aiMaterialProfile==='italian-craft-v1')for(const map of ['basecolor','normal','roughness'])required.push(`materials/ai/italian-craft-v1/travertine/${map}.png`);
 for(const p of data.sceneProps??[])required.push(`props/ai/${p.geometryId}/basecolor.png`);
 for(const path of required)if(!assets.some(a=>a.publicPath===path))throw Error('AI scene asset is not frozen: '+path);
}
