import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {simulate} from './physics.mjs';
// Production GP_* switches must not alter the editor's explicit snapshot.
for(const key of Object.keys(process.env))if(key.startsWith('GP_'))delete process.env[key];
const [input,output]=process.argv.slice(2);
try {
 const snapshot=JSON.parse(readFileSync(input,'utf8'));
 console.log(JSON.stringify({type:'started'}));
 const result=await simulate(snapshot.project,snapshot.assets,snapshot.settings,value=>console.log(JSON.stringify({type:'progress',value})));
 result.snapshotHash=snapshot.hash;result.sourceHash=snapshot.sourceHash;result.createdAt=new Date().toISOString();
 writeFileSync(output+'.tmp',JSON.stringify(result));renameSync(output+'.tmp',output);
 console.log(JSON.stringify({type:'complete'}));
}catch(e){console.error(e.message);process.exitCode=1;}
