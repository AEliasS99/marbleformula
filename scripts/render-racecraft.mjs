// Run via npm run render:racecraft: factory shared lock spans snapshot, bundle and render.
// This pipeline has no upload, cloud archive, deletion or season-bake operation.
import {readFileSync,writeFileSync,mkdirSync,existsSync,realpathSync,renameSync,statSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {buildCourse} from '../designer/public/course.js';
import {planCameras} from '../src/replay/camera.mjs';
import {currentSourceHash} from '../designer/simulations.mjs';
import {validateRenderSnapshot,digest} from '../designer/render-contract.mjs';
const args=process.argv.slice(2);let id,render=false,take='';
for(let i=0;i<args.length;i++){if(args[i]==='--simulation')id=args[++i];else if(args[i]==='--render')render=true;else if(args[i]==='--take')take=args[++i];else throw Error('Usage: npm run render:racecraft -- --simulation <uuid> [--render]');}
if(take&&!/^[a-z0-9][a-z0-9-]{0,39}$/.test(take))throw Error('Take must be a short lowercase name.');
if(!/^[a-f0-9-]{36}$/.test(id||''))throw Error('Provide a saved simulation UUID.');
const read=f=>JSON.parse(readFileSync(f,'utf8')),root=process.cwd(),sim=join(root,'designs/.simulations',id);
const job=read(sim+'.job.json'),input=read(sim+'.input.json'),result=read(sim+'.result.json');
const projectFile=join(root,'designs',job.projectId+'.json');
// Same canonical etag as the editor API.
const project=read(projectFile);const projectEtag=digest(JSON.stringify(project));
const format=validateRenderSnapshot({job,input,result,currentSourceHash:currentSourceHash(),projectEtag});
const outputDir=resolve(process.env.VIDEO_OUT||join(homedir(),'GoogleCloud'));mkdirSync(outputDir,{recursive:true});
const actual=realpathSync(outputDir);for(const repo of [root,resolve(root,'../marble')]){const rel=relative(repo,actual);if(!rel||(!rel.startsWith('..')&&!rel.startsWith('/')))throw Error('Video output must be outside both repositories.');}
const renderId=id+(take?'-'+take:'');const state=join(root,'out/racecraft',renderId);mkdirSync(state,{recursive:true});
const output=join(actual,`racecraft-cars-${renderId}-4k-preview.mp4`),partial=output.replace('.mp4','.partial.mp4');if(existsSync(output)||existsSync(partial))throw Error('Existing render preserved. Choose a new --take name to render this simulation again.');
writeFileSync(join(state,'snapshot.json'),JSON.stringify(input));writeFileSync(join(state,'replay.json'),JSON.stringify(result));
const audioRel=`replays/${id}.wav`,audioPath=join(root,'public',audioRel);mkdirSync(join(root,'public/replays'),{recursive:true});
// Deterministic review sound: motor harmonics follow baked speed, fade at each terminal event.
const rate=48000,samples=Math.round(format.frames/60*rate),pcm=Buffer.alloc(samples*4),phases=result.participants.map((_,i)=>i*.73);let seed=42,peak=0;
for(let n=0;n<samples;n++){
 const sec=n/rate,t=Math.max(0,Math.min(result.duration,sec-2));const f=result.frames[Math.min(result.frames.length-1,Math.floor(t*result.fps))];let l=0,r=0;
 result.participants.forEach((p,i)=>{const finish=result.standings.find(s=>s.id===p.id).time;const fade=Math.max(0,Math.min(1,(finish+.15-t)/.15))*Math.min(1,sec/.3);const speed=f.telemetry[i].speed;phases[i]+=2*Math.PI*(65+speed*11)/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/4294967296*2-1;const value=(Math.sin(phases[i])*.55+Math.sin(phases[i]*2)*.24+Math.sin(phases[i]*4)*.08+noise*Math.min(.12,speed*.006))*.055*fade;const pan=(i/(result.participants.length-1)-.5)*.7;l+=value*(1-pan);r+=value*(1+pan);});
 peak=Math.max(peak,Math.abs(l),Math.abs(r));pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,l))*32767),n*4);pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,r))*32767),n*4+2);
}
const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(rate,24);header.writeUInt32LE(rate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);writeFileSync(audioPath,Buffer.concat([header,pcm]));
const course=buildCourse(input.project,input.assets,{meshes:false}),sf=course.frameAt(course.length);
const finish={position:sf.p,tangent:sf.t,normal:sf.n,right:sf.r,width:input.project.width};
const shots=planCameras(result);writeFileSync(join(state,'camera-plan.json'),JSON.stringify(shots,null,2));
const props=join(state,'props.json');writeFileSync(props,JSON.stringify({replay:result,finish,title:'Six cars. Three checkpoints.',audio:audioRel}));
const rendererSourceHash=digest(['src/replay/camera.mjs','src/gp/FinishLine.tsx','designer/public/course.js','src/replay/Replay.tsx','src/replay/index.tsx','src/gp/CarModel.tsx','src/gp/flags.ts','designer/public/replay.js','scripts/render-racecraft.mjs','designer/render-contract.mjs','remotion.config.ts','package-lock.json'].map(f=>f+'\n'+readFileSync(f,'utf8')).join('\n'));
const manifest={take,shots:shots.map(s=>({start:s.start,end:s.end,kind:s.kind,reason:s.reason,subjects:s.ids.map(i=>result.participants[i].id)})),rendererSourceHash,simulation:id,projectId:job.projectId,snapshotHash:result.snapshotHash,physicsSourceHash:result.sourceHash,resultHash:digest(readFileSync(sim+'.result.json')),projectName:input.project.name,output,...format,simulationDuration:result.duration,engine:result.engine,audio:'Synthesized review audio driven by baked speed',audioPeak:peak,publication:'not uploaded',cloud:'not archived',userValidation:'pending',status:'prepared'};
const save=()=>writeFileSync(join(state,'manifest.json'),JSON.stringify(manifest,null,2));save();
const run=(cmd,argv,options={})=>{const r=spawnSync(cmd,argv,{stdio:'inherit',...options});if(r.error||r.status!==0)throw Error(`${cmd} failed: ${r.error?.message||r.status}`);return r;};
const bundle=join(state,'bundle');run('npx',['--no-install','remotion','bundle','src/replay/index.tsx','--out-dir',bundle]);
manifest.bundle=bundle;manifest.props=props;save();if(!render){console.log(JSON.stringify(manifest,null,2));process.exit(0);}
manifest.status='rendering';save();
try{
 run('npx',['--no-install','remotion','render',bundle,'Racecraft-Cars-4K',partial,`--props=${props}`,'--concurrency=1','--gl=angle','--crf=16','--jpeg-quality=95','--timeout=180000','--browser-executable=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']);
 const probe=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',partial],{encoding:'utf8'});if(probe.status!==0)throw Error('ffprobe failed.');const info=JSON.parse(probe.stdout),v=info.streams.find(s=>s.codec_type==='video'),a=info.streams.find(s=>s.codec_type==='audio');
 if(!v||v.width!==3840||v.height!==2160||v.r_frame_rate!=='60/1'||Number(v.nb_frames)!==format.frames||!a)throw Error('Rendered format/frame count does not match the replay.');
 run('ffmpeg',['-v','error','-xerror','-i',partial,'-f','null','-']);renameSync(partial,output);manifest.status='rendered';manifest.technicalChecks='4K60, exact frame count, audio, complete decode passed';manifest.videoBytes=statSync(output).size;manifest.videoSha256=digest(readFileSync(output));manifest.finishedAt=new Date().toISOString();save();console.log(`LOCAL REVIEW VIDEO: ${output}`);
}catch(e){manifest.status='failed';manifest.error=e.message;save();throw e;}
