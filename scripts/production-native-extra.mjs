import fs from 'node:fs';import {resolve,dirname}from'node:path';import {spawnSync}from'node:child_process';
import {trackingReviewFrames} from './tracking-review-frames.mjs';
const ready=JSON.parse(fs.readFileSync(resolve(process.argv[2]))),base=dirname(ready.entry),d=JSON.parse(fs.readFileSync(base+'/race.json'));
const finish=Math.min(...d.marbles.map(m=>m.finishFrame).filter(Number.isFinite));
const checks=[...[-15,-2,-1,1,2,3,4,5,15,30].map(delta=>['finish-neighbour-'+(finish+delta),finish+delta])];
const tracking=trackingReviewFrames(d);
fs.writeFileSync(base+'/tracking-review-selection.json',JSON.stringify({scope:'Measured actual camera direction for at least0.75s; legacy image names may use a different authored shot kind',...tracking},null,2));
for(const kind of ['lead','chase'])checks.push(['tracking-'+kind,tracking[kind].frame]);
for(const[name,frame]of checks){const result=spawnSync('npx',['--no-install','remotion','still',base+'/bundle',ready.composition,`${base}/${name}.png`,`--frame=${d.intro.total+frame}`,'--gl=angle','--props={"dpr":1}','--concurrency=1','--timeout=180000','--browser-executable=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','--image-format=png'],{stdio:'inherit'});if(result.status!==0)throw Error('Native '+name+' failed');}
