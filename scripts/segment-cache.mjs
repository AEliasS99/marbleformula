import fs from'node:fs';import {resolve}from'node:path';import {createHash}from'node:crypto';
export const digest=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function videoSourceKey(inputs){
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
 return createHash('sha256').update(JSON.stringify(canonical({schema:1,...inputs}))).digest('hex');
}
export function unchangedShowcaseRange(data,start,end){
 const scene=data.intro?.vehicle==='car'&&data.intro.scenes.find(s=>s.id==='cars');
 return !!scene&&Number.isInteger(start)&&Number.isInteger(end)&&start<=end&&start>=scene.at&&end<scene.at+scene.frames;
}
export function findCachedSegment(root,key,start,end){
 const file=resolve(root,key,`${start}-${end}.json`);if(!fs.existsSync(file))return null;
 const record=JSON.parse(fs.readFileSync(file));if(record.key!==key||record.start!==start||record.end!==end)throw Error('Segment cache identity mismatch');
 if(!fs.existsSync(record.path))return null;
 if(digest(record.path)!==record.sha256)throw Error('Cached segment changed; preserve and inspect it');
 if(record.sceneReport&&(!fs.existsSync(record.sceneReport)||digest(record.sceneReport)!==record.sceneReportSha256))throw Error('Cached segment scene evidence changed');
 return record;
}
export function rememberSegment(root,key,start,end,path,scope='same-render-inputs'){
 const directory=resolve(root,key);fs.mkdirSync(directory,{recursive:true});const sceneReport=fs.existsSync(path+'.scene.json')?path+'.scene.json':null;
 const record={key,start,end,path:resolve(path),sha256:digest(path),sceneReport,sceneReportSha256:sceneReport?digest(sceneReport):null,scope,verifiedAt:new Date().toISOString()};
 const file=resolve(directory,`${start}-${end}.json`);fs.writeFileSync(file+'.tmp',JSON.stringify(record,null,2)+'\n');fs.renameSync(file+'.tmp',file);return record;
}
