// Local TCR preparation/rendering only: never calls YouTube or cloud APIs.
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
const args=process.argv.slice(2);
let location='alps', render=false;
for(let i=0;i<args.length;i++) {
  if(args[i]==='--location') location=args[++i];
  else if(args[i]==='--render') render=true;
  else if(args[i]==='--prepare') render=false;
  else if(args[i]==='--help') {console.log('Usage: zsh scripts/render-tcr-overnight.sh [--location alps|tokyo] [--prepare|--render]\nDefault: prepare the next missing heat. --render completes local videos and lossless concatenation; never uploads.');process.exit(0);}
  else throw Error(`Unknown argument ${args[i]}`);
}
const circuit={alps:'r1-monaco',tokyo:'r5-monza'}[location];
if(!circuit)throw Error('Location must be alps or tokyo');
const output=resolve(process.env.VIDEO_OUT||`${homedir()}/GoogleCloud`);
const state=resolve(`out/tcr/${location}`);
const qFile='src/gp/races/tcr-qualifiers.json';
mkdirSync(state,{recursive:true});mkdirSync(output,{recursive:true});mkdirSync('out/gp',{recursive:true});
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const save=(p,value)=>{writeFileSync(`${p}.tmp`,JSON.stringify(value,null,2)+'\n');renameSync(`${p}.tmp`,p);};
const run=(cmd,argv,env={})=>{
  const r=spawnSync(cmd,argv,{stdio:'inherit',env:{...process.env,...env}});
  if(r.error)throw r.error;
  if(r.status!==0)throw Error(`${cmd} failed (${r.status ?? r.signal})`);
};
const filename=h=>`${output}/tcr-${location}-${h==='final'?'grand-final':`heat${h}`}-4k.mp4`;
function probe(file,expectedFrames) {
  const r=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'});
  if(r.status!==0)throw Error(`Unreadable video: ${file}`);
  const info=JSON.parse(r.stdout),v=info.streams.find(x=>x.codec_type==='video');
  const a=info.streams.find(x=>x.codec_type==='audio');
  if(!v||v.width!==3840||v.height!==2160||v.r_frame_rate!=='60/1'||!a)throw Error(`Expected 4K60 with audio: ${file}`);
  if(expectedFrames && Math.abs(Number(v.nb_frames)-expectedFrames)>1)throw Error(`Incomplete or different-length video: ${file}`);
  return info;
}
let qualifiers={};
for(const heat of ['1','2','3','4','final']) {
  const file=filename(heat),snapshot=`${state}/heat-${heat}.json`;
  if(existsSync(file)) {
    if(!existsSync(snapshot))throw Error(`Existing video needs verified telemetry before it can be skipped: ${file}. Recover ${snapshot} first.`);
    const d=read(snapshot);
    const report=read(`${state}/heat-${heat}-verified.json`);
    if(report.technicalChecks!=='passed')throw Error(`Technical verification is not complete for ${file}`);
    const current=spawnSync('shasum',['-a','256',file],{encoding:'utf8'});
    if(current.status!==0||current.stdout.split(/\s/)[0]!==report.sha256)throw Error(`Video changed since verification: ${file}`);
    probe(file,d.timeline.total+(d.intro?.total||0));
    if(heat!=='final') {
      const m=d.order[2],fe=d.marbles[m].finishExact??d.marbles[m].finishFrame;
      qualifiers[heat]={top2:d.order.slice(0,2).map(i=>d.marbles[i].abbr),third:{abbr:d.marbles[m].abbr,time:fe===null?9999:Math.round((fe-d.timeline.raceStart)/d.fps*1000)/1000}};
    }
    console.log(`Verified existing heat ${heat}; keeping it and restoring its qualifiers.`);
    continue;
  }
  if(heat==='final') {
    if(!['1','2','3','4'].every(h=>qualifiers[h]?.top2?.length===2&&qualifiers[h].third))throw Error('All four qualifying heats are required before the final.');
    const unique=new Set(Object.values(qualifiers).flatMap(q=>[...q.top2,q.third.abbr]));
    if(unique.size<10)throw Error('Fewer than 10 distinct qualifiers: review heat rosters before the final; no arbitrary replacements allowed.');
  }
  save(qFile,qualifiers);
  run(process.execPath,['scripts/season.mjs'],{GP_CARS:'1',GP_LAPS:'1',GP_HEAT:heat,GP_ONLY:circuit});
  const d=read(`src/gp/races/${circuit}.json`);
  copyFileSync(`src/gp/races/${circuit}.json`,snapshot);
  copyFileSync(`public/gp/${circuit}.wav`,`${state}/heat-${heat}.wav`);
  qualifiers=read(qFile);save(`${state}/qualifiers.json`,qualifiers);
  const bundle=`${state}/bundle-heat-${heat}`;
  run('npx',['--no-install','remotion','bundle','src/index.ts','--out-dir',bundle]);
  const partial=file.replace(/\.mp4$/,'.partial.mp4');
  const renderArgs=['--no-install','remotion','render',bundle,`GP-${circuit}-4k`,partial,'--props={"dpr":1}','--concurrency=1','--timeout=180000','--browser-executable=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  save(`${state}/ready.json`,{location,heat,composition:`GP-${circuit}-4k`,bundle,output:file,frames:d.timeline.total+(d.intro?.total||0),status:'prepared',publication:'requires user validation',resume:`zsh scripts/render-tcr-overnight.sh --location ${location} --render`});
  if(!render){console.log(`READY: heat ${heat} bundled. No video rendered or uploaded. Run with --render to continue locally.`);process.exit(0);}
  run('npx',renderArgs);
  probe(partial,d.timeline.total+(d.intro?.total||0));
  run('ffmpeg',['-v','error','-xerror','-i',partial,'-f','null','-']);
  run('python3',['scripts/check-frames.py',partial]);
  renameSync(partial,file);
  const hash=spawnSync('shasum',['-a','256',file],{encoding:'utf8'});
  if(hash.status!==0)throw Error('Could not hash completed video');
  save(`${state}/heat-${heat}-verified.json`,{sha256:hash.stdout.split(/\s/)[0],technicalChecks:'passed',userValidation:'pending'});
}
if(!render){console.log('All heats already verified. Use --render to assemble locally; publication remains separate.');process.exit(0);}
// Preserve every frame and both streams; no master re-encoding or trimming.
const list=`${state}/concat.txt`;
writeFileSync(list,['1','2','3','4','final'].map(h=>`file '${filename(h).replaceAll("'","'\\''")}'`).join('\n')+'\n');
const tournament=`${output}/tcr-${location}-tournament-4k.mp4`;
if(existsSync(tournament))throw Error(`Keeping existing tournament: ${tournament}; review it before replacing.`);
const partial=tournament.replace(/\.mp4$/,'.partial.mp4');
run('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',partial]);
probe(partial);run('ffmpeg',['-v','error','-xerror','-i',partial,'-f','null','-']);renameSync(partial,tournament);
const name=location==='alps'?'Swiss Alps':'Tokyo Shibuya';
save(`out/gp/tcr-${location}-tournament-4k-youtube.json`,{title:`DON'T BE LAST! | 4K60 ${name} Car Elimination Tournament`,description:`${name} car elimination tournament: four qualifying heats and the grand final. Three elimination checkpoints per race.\nhttps://marbleformula.com`,tags:['car race','elimination race','4k60','Marble Formula',name]});
save(`${state}/ready.json`,{location,output:tournament,status:'rendered',userValidation:'pending',youtube:'not uploaded',cloud:'not archived'});
console.log(`LOCAL TOURNAMENT READY FOR REVIEW: ${tournament}\nAfter user validation, upload separately with npm run upload -- --file "${tournament}" --round tcr-${location}-tournament-4k. Cloud archiving remains a later separate step.`);
