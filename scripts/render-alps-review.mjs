import {stageRenderAssets,renderAssetKey} from './render-assets.mjs';
// Render the existing GrandPrix scene from an isolated themed review snapshot.
// Usage: node scripts/factory.mjs --shared-lock -- node scripts/render-alps-review.mjs 17 --stills|--render
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,renameSync,statSync,createReadStream,realpathSync,mkdirSync,copyFileSync,statfsSync} from 'node:fs';
import {resolve,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {productionReviewIdentity} from '../src/gp/production-locations.js';
import {fileURLToPath} from 'node:url';
import {videoSourceKey,findCachedSegment,rememberSegment,unchangedShowcaseRange,digest} from './segment-cache.mjs';
const sceneChecker=fileURLToPath(new URL('./check-scene.py',import.meta.url));
const frameChecker=fileURLToPath(new URL('./check-frames.py',import.meta.url));
const minimapChecker=fileURLToPath(new URL('./check-minimap.py',import.meta.url));
// --repair preserves the failed export and writes a separate repaired master.
const seed=Number(process.argv[2]??17),mode=process.argv[3];
if(!Number.isInteger(seed)||!['--stills','--render'].includes(mode))throw Error('Expected seed and --stills or --render');
const take=process.argv.find(a=>a.startsWith('--take='))?.slice(7)||'evolution';
if(!/^[a-z][a-z0-9-]{0,32}$/.test(take))throw Error('Invalid take');
const heat=process.argv.find(a=>a.startsWith('--heat='))?.slice(7)||'1';
if(!/^[1-4]$/.test(heat))throw Error('Expected --heat=1..4');
const location=process.argv.find(a=>a.startsWith('--location='))?.slice(11)||'alps';
const identity=productionReviewIdentity(location,heat,take,seed),name=identity.name;
const requestedDirectory=process.argv.find(a=>a.startsWith('--directory='))?.slice(12);
const directory=requestedDirectory?resolve(requestedDirectory):resolve(identity.folder,name),path=`${directory}/ready.json`;
if(requestedDirectory){const rel=relative(resolve('out/tcr'),directory);if(!rel||rel.startsWith('..')||rel.startsWith('/'))throw Error('Review snapshot must be isolated under out/tcr');}
const ready=JSON.parse(readFileSync(path)),data=JSON.parse(readFileSync(`${directory}/race.json`));
if(requestedDirectory&&(ready.variant!=='marble-production'||data.info.vehicle!=='marble'||ready.seed!==seed))throw Error('Explicit review directory requires the matching marble production');
for(const[p,h]of Object.entries(ready.sourceHashes??{}))if(digest(resolve(directory,p))!==h)throw Error('Frozen picture source changed: '+p);
const audit=JSON.parse(readFileSync(`${directory}/checks.json`));
if(data.info.vehicle==='marble'){
 const {marbleMotionReport}=await import('./marble-motion-report.mjs');
 const actualPhysics=marbleMotionReport(data);
 if(!actualPhysics.passed||(actualPhysics.delayReviewRequired&&audit.obstacleFlowReview?.result!=='passed'))throw Error('Saved marble physics has recoveries/discontinuities/faults or unreviewed obstacle delays; inspect actual telemetry before picture work');
}
if(ready.requireMarbleReplayGate&&(!audit.replay?.passed||audit.replay.vehicle!=='marble'))throw Error('Resolve full marble replay coverage before rendering');
if(ready.requireMarbleReplayGate&&mode==='--render'&&ready.nativeVisualReview?.result!=='passed')throw Error('Actual marble native visual review is required before full rendering');
if(ready.requireReplayGate&&!audit.replay?.passed)throw Error('Resolve the full-body replay camera gate before rendering');
if(mode==='--render'&&ready.requireAsmrReview&&(ready.audioMixReview?.result!=='passed'||Object.entries(ready.audioHashes??{}).some(([p,h])=>ready.audioMixReview?.audioHashes?.[p]!==h)))throw Error('Actual ASMR listening approval of these exact audio hashes is required before full rendering');
if(data.carConditions?.gates?.length&&!audit.islands?.passed)throw Error('Resolve full-body island clearance before rendering');
if(!audit.allAccountedFor||audit.recoveries||audit.stalls?.length||audit.camera?.unresolvedOcclusionFrames?.length||audit.camera?.unresolvedFramingFrames?.length)throw Error('Resolve the physics/camera audit before rendering this snapshot');
if(data.carConditions?.racecraft?.paceModel==='race-pace-v2'&&!audit.pace?.passed)throw Error('Resolve the measured race-pace audit before rendering');
const run=(command,args)=>{const r=spawnSync(command,args,{stdio:'inherit'});if(r.error||r.status!==0)throw Error(`${command} failed: ${r.error?.message??r.status}`);};
const capture=(command,args)=>{const r=spawnSync(command,args,{encoding:'utf8'});if(r.error||r.status!==0)throw Error(`${command} failed: ${r.stderr}`);return r.stdout;};
const save=()=>{writeFileSync(path+'.tmp',JSON.stringify(ready,null,2));renameSync(path+'.tmp',path);};
const introFrames=data.intro?.total??0;
if(ready.frames!==data.timeline.total+introFrames)throw Error('Composition duration must include the complete presentation and race');
// Check the soundtrack before any expensive picture work. Render-only repairs
// retain their original audioId even when their output take has a new name.
if(mode==='--render'){
  const audioId=ready.audioId??name;
  for(const suffix of introFrames?['','-intro']:['']){
    const relativeAudio=`public/gp/${audioId}${suffix}.wav`,audioPath=resolve(relativeAudio);
    if(!existsSync(audioPath))throw Error(`Missing soundtrack ${relativeAudio}; set ready.audioId to the preserved audio before rendering`);
    if(ready.audioHashes?.[relativeAudio]&&digest(audioPath)!==ready.audioHashes[relativeAudio])throw Error('Preserved soundtrack changed: '+relativeAudio);
  }
}
const bundle=`${directory}/bundle`;
// Frozen GrandPrix reviews reference only their two preserved soundtrack files.
// Avoid copying the entire historical audio library into every isolated bundle.
let publicDir=resolve('public');
if(ready.sourceHashes&&ready.audioHashes&&ready.audioId){
  publicDir=`${directory}/render-public`;mkdirSync(`${publicDir}/gp`,{recursive:true});
  for(const suffix of introFrames?['','-intro']:['']){
    const key=`public/gp/${ready.audioId}${suffix}.wav`,source=resolve(key);
    if(!ready.audioHashes[key]||!existsSync(source)||digest(source)!==ready.audioHashes[key])throw Error('Missing or changed frozen audio asset: '+key);
    const target=`${publicDir}/gp/${ready.audioId}${suffix}.wav`;
    if(!existsSync(target)||digest(target)!==ready.audioHashes[key])copyFileSync(source,target);
  }
}
if(ready.sourceHashes&&data.info.sceneryProfile==='tuscany-venue-v3'&&existsSync(resolve(directory,ready.sourceSnapshot??'input/src','gp/ScannedMachine.tsx'))&&!ready.renderAssets?.length)throw Error('Scanned material sources must be frozen in ready.renderAssets before rendering');
stageRenderAssets(directory,ready.renderAssets??[],publicDir);
run('npx',['--no-install','remotion','bundle',ready.entry,'--out-dir',bundle,'--public-dir',publicDir]);
const flags=['--gl=angle','--crf=16','--jpeg-quality=95','--props={"dpr":1}','--concurrency=1','--timeout=180000','--browser-executable=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const sourceKey=Object.keys(ready.sourceHashes??{}).length?videoSourceKey({sources:ready.sourceHashes,renderAssets:renderAssetKey(ready.renderAssets??[]),entry:digest(ready.entry),race:digest(`${directory}/race.json`),replayCamera:existsSync(`${directory}/replay-camera.json`)?digest(`${directory}/replay-camera.json`):null,presentation:ready.presentationConfig??null,composition:ready.composition,flags,renderer:digest(fileURLToPath(import.meta.url)),cache:digest(fileURLToPath(new URL('./segment-cache.mjs',import.meta.url))),dependencies:digest('package-lock.json'),browser:capture('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--version']).trim(),platform:process.platform,architecture:process.arch}):null;
const cacheRoot=resolve(process.env.VIDEO_OUT??dirname(ready.output),'.render-cache');
if(mode==='--stills') {
  const patchFrame=data.frames.findIndex(row=>row.some(p=>p[7]>=116&&p[7]<120));
  const finish=Math.min(...data.marbles.map(m=>m.finishFrame).filter(Number.isFinite));
  const checks=[['start',data.timeline.raceStart-30],[location==='alps'?'meltwater':'mid-sector',patchFrame],[location==='alps'?'village':'city',2400],['finish',finish],['replay',data.timeline.replay.at+30],['qualification',data.timeline.standings.at+90]];
  if(data.carIncidents?.length)checks.push(['incident',data.carIncidents[0].f+10]);
  for(const check of checks)check[1]+=introFrames;
  if(data.intro?.vehicle==='car'){const cars=data.intro.scenes.find(s=>s.id==='cars');
    checks.push(...data.marbles.map((_,i)=>[`car-${i+1}`,cars.at+i*data.intro.carFrames+Math.round(data.intro.carFrames*.35)]),['car-front',cars.at+Math.round(data.intro.carFrames*.12)],['car-rear',cars.at+Math.round(data.intro.carFrames*.62)],['pick',introFrames-30]);
  }
  if(data.info.vehicle==='marble'&&data.intro){
    for(const sc of data.intro.scenes)checks.push([`intro-${sc.id}`,sc.at+Math.floor(sc.frames/2)]);
    const teams=data.intro.scenes.find(s=>s.id==='teams');
    if(teams)for(let i=0;i<10;i++)checks.push([`team-${i+1}`,teams.at+i*data.intro.teamFrames+Math.floor(data.intro.teamFrames/2)]);
    for(const [i,card]of data.intro.cards.entries())checks.push([`feature-${i+1}`,data.intro.scenes.find(s=>s.id==='flyover').at+Math.floor((card.from+card.to)/2)]);
    for(const [i,card]of data.intro.cards.entries())if(i)for(const [label,delta]of [['before',-1],['cut',0],['after',1]])checks.push([`feature-cut-${i}-${label}`,data.intro.scenes.find(s=>s.id==='flyover').at+card.from+delta]);
  }
  for(const [i,gate] of (data.carConditions?.gates??[]).entries()) {
    const f=data.frames.findIndex(row=>row.some(p=>p[7]>=gate.u-.5&&p[7]<gate.u+1));
    if(f<0)throw Error('No race frame reaches an authored island');
    checks.push([`island-${i+1}`,introFrames+f]);
  }
  for(const [i,pond]of (data.carConditions?.patches??[]).filter(p=>p.kind==='pond').entries()){
    for(const [label,u]of [['entry',pond.u0],['middle',(pond.u0+pond.u1)/2],['exit',pond.u1]]){
      const f=data.frames.findIndex(row=>row.some(p=>p[7]>=u&&p[7]<u+1));
      if(f<0)throw Error('No race frame reaches an authored pond');
      checks.push([`pond-${i+1}-${label}`,introFrames+f]);
    }
  }
  if((data.carConditions?.gates?.length||data.carConditions?.racecraft?.paceModel==='race-pace-v2')&&data.boosters?.length)for(const [label,u]of [['accel-entry',data.boosters[0].u0],['accel-dual',(data.boosters.find((b,i,a)=>a.some((x,j)=>j!==i&&x.u0===b.u0))??data.boosters.at(-1)).u0]]) {
    const f=data.frames.findIndex(row=>row.some(p=>p[7]>=u&&p[7]<u+1));checks.push([label,introFrames+f]);
  }
  for(const cp of data.checkpoints??[]){
    const f=data.frames.findIndex(row=>row.some(p=>p[7]>=cp.u-8&&p[7]<cp.u));
    if(f>=0)checks.push([`checkpoint-${cp.index}`,introFrames+f]);
    if(Number.isFinite(cp.firstFrame))for(const [label,delta]of [['crossing',0],['departure',15]])checks.push([`checkpoint-${cp.index}-${label}`,introFrames+cp.firstFrame+delta]);
  }
  for(const [i,shot]of data.shots.filter(s=>s.kind==='cockpit').entries()){
    for(const [label,f]of [['before',shot.start-1],['entry',shot.start+2],['middle',Math.floor((shot.start+shot.end)/2)],['exit',shot.end-2],['after',shot.end]])checks.push([`cockpit-${i+1}-${label}`,introFrames+f]);
  }
  if(ready.requireReplayGate||ready.requireMarbleReplayGate){
    const length=data.timeline.results.at-data.timeline.replay.at;
    for(let k=0;k<8;k++){
      const offset=Math.round((length-1)*k/7);
      checks.push([`replay-sweep-${offset}`,introFrames+data.timeline.replay.at+offset]);
    }
  }
  const selected=process.argv.slice(4).find(a=>!a.startsWith('--'))?.split(',');
  writeFileSync(`${directory}/native-frame-index.json`,JSON.stringify(Object.fromEntries(checks.map(([name,frame])=>[name+'.png',frame])),null,2)+'\n');
  if(selected?.some(name=>!checks.some(c=>c[0]===name)))throw Error('Unknown still selection');
  for(const [name,frame]of checks.filter(c=>!selected||selected.includes(c[0])))run('npx',['--no-install','remotion','still',bundle,ready.composition,`${directory}/${name}.png`,`--frame=${frame}`,...flags,'--image-format=png']);
  console.log(`Full production 4K stills: ${directory}`);
} else {
  for(const repo of [resolve('.'),resolve('../marble')]){const rel=relative(realpathSync(repo),realpathSync(dirname(ready.output)));if(!rel||(!rel.startsWith('..')&&!rel.startsWith('/')))throw Error('Videos must remain outside repositories');}
  if(process.argv.includes('--repair')) {
    if(ready.visualReview!=='failed'||!existsSync(ready.output))throw Error('Repair requires a preserved failed export');
    const failed=`${directory}-failed-${Date.now()}`;mkdirSync(failed);
    copyFileSync(path,`${failed}/ready.json`);
    ready.output=ready.output.replace(/-4k\.mp4$/,'-repaired-4k.mp4');
    ready.reviewTitle=`Alpes · Manga 1 · ${seed===17?'Evolución':'Condiciones B'} · Corregida 4K`;
    for(const key of ['visualReview','visualReviewIssues','publicationBlocked','videoBytes','sha256','technicalChecks','error'])delete ready[key];
  }
  const partial=ready.output.replace(/\.mp4$/,'.partial.mp4');
  if(existsSync(ready.output)||existsSync(partial))throw Error('Existing output preserved; inspect it before starting another render');
  delete ready.queueState;ready.status='rendering';save();
  try {
    // Restart Chrome regularly: bound GPU resource lifetime without changing
    // resolution, motion blur, effects, scenery, or any simulation frames.
    // Each complete frame range is checked before the next range is rendered.
    const partDir=resolve(dirname(ready.output),'.render-parts',`${location}-${seed}-${Date.now()}`);
    mkdirSync(partDir,{recursive:true});
    ready.partsDirectory=partDir;ready.renderedFrames=0;ready.totalFrames=ready.frames;save();
    const parts=[];
    const reuse=ready.segmentReuse?JSON.parse(readFileSync(ready.segmentReuse)):null;
    if(reuse){
      if(reuse.kind!=='unchanged-showcase'||reuse.raceSha256!==digest(`${directory}/race.json`)||reuse.entrySha256!==digest(ready.entry)||JSON.stringify(reuse.sourceHashes)!==JSON.stringify(ready.sourceHashes))throw Error('Explicit segment reuse evidence changed');
      const proof=JSON.parse(readFileSync(reuse.pixelProof));if(!proof.passed||proof.pairs.length!==4)throw Error('Showcase comparison is incomplete');
      for(const p of proof.pairs)if(!p.pixelIdentical||digest(p.before)!==p.beforeSha256||digest(p.after)!==p.afterSha256)throw Error('Showcase proof image changed');
    }
    for(let start=0;start<ready.frames;start+=180) {
      const end=Math.min(start+179,ready.frames-1);
      const part=`${partDir}/frames-${String(start).padStart(5,'0')}-${end}.mp4`;
      let retained=sourceKey?findCachedSegment(cacheRoot,sourceKey,start,end):null,scope='same-render-inputs';
      if(!retained&&reuse?.ranges?.[`${start}-${end}`]){
        if(!unchangedShowcaseRange(data,start,end))throw Error('Showcase-only reuse cannot cover affected racing frames');
        retained=reuse.ranges[`${start}-${end}`];if(digest(retained.path)!==retained.sha256)throw Error('Original showcase segment changed');scope='pixel-verified-unchanged-showcase';
      }
      if(retained){
        const v=JSON.parse(capture('ffprobe',['-v','error','-show_streams','-of','json',retained.path])).streams.find(s=>s.codec_type==='video');
        if(v?.width!==3840||v?.height!==2160||v?.r_frame_rate!=='60/1'||Number(v?.nb_frames)!==end-start+1)throw Error('Retained segment format mismatch');
        parts.push(retained.path);if(sourceKey)rememberSegment(cacheRoot,sourceKey,start,end,retained.path,scope);ready.renderedFrames=end+1;save();console.log(`REUSED VERIFIED ${start}-${end} (${scope})`);continue;
      }
      for(let attempt=1;attempt<=2;attempt++) {
        // Native UHD capture can add several GiB of transient GPU swap. Keep
        // that headroom above the permanent40GiB floor before starting Chrome.
        const disk=statfsSync(dirname(ready.output));
        if(disk.bavail*disk.bsize<48*2**30)throw Error('Native4K capture needs48GiB free to retain40GiB during rendering; verified cached segments are preserved');
        // Keep failed attempts too; never overwrite review evidence.
        const attemptFile=part.replace('.mp4',`-attempt${attempt}.mp4`);
        try {
          run('npx',['--no-install','remotion','render',bundle,ready.composition,attemptFile,
            `--frames=${start}-${end}`,'--muted','--log=verbose',...flags,'--image-format=jpeg']);
          const checkEnd=Math.min(end,introFrames+data.timeline.results.at-1);
          if(checkEnd>=start)run('python3',[sceneChecker,attemptFile,
            '--end-frame',String(checkEnd-start),'--report',attemptFile+'.scene.json']);
          const segment=JSON.parse(capture('ffprobe',['-v','error','-show_streams','-of','json',attemptFile])).streams.find(s=>s.codec_type==='video');
          if(segment?.width!==3840||segment?.height!==2160||segment?.r_frame_rate!=='60/1'||Number(segment?.nb_frames)!==end-start+1)throw Error('Segment format/frame count mismatch');
          parts.push(attemptFile);if(sourceKey)rememberSegment(cacheRoot,sourceKey,start,end,attemptFile);break;
        } catch(error) {
          console.error(`Range ${start}-${end}, attempt ${attempt}: ${error.message}`);
          if(attempt===2)throw error;
        }
      }
      ready.renderedFrames=end+1;save();
      console.log(`VERIFIED ${end+1}/${ready.frames} production frames`);
    }
    const list=`${partDir}/concat.txt`;
    writeFileSync(list,parts.map(p=>`file '${p.replaceAll("'", "'\\''")}'`).join('\n')+'\n');
    const audioId=ready.audioId??name;
    const audio=resolve(`public/gp/${audioId}.wav`);
    const audioDuration=Number(capture('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',audio]));
    if(Math.abs(audioDuration-data.timeline.total/60)>1/60)throw Error('Race audio must match the full baked race exactly');
    // WAVs are 44.1 kHz at 60 fps: exact sample offsets avoid millisecond rounding.
    const audioArgs=introFrames ? ['-i',resolve(`public/gp/${audioId}-intro.wav`),'-i',audio,
      '-filter_complex',`[1:a]apad,atrim=end_sample=${(introFrames+60)*735}[intro];[2:a]adelay=${introFrames*735}S:all=1[race];[intro][race]amix=inputs=2:normalize=0,atrim=end_sample=${ready.frames*735}[sound]`,'-map','0:v:0','-map','[sound]'] : ['-i',audio,'-map','0:v:0','-map','1:a:0'];
    // Only copy encoded video; use one continuous audio track, without AAC
    // priming gaps at segment boundaries. No frames are trimmed or re-encoded.
    run('ffmpeg',['-v','error','-n','-f','concat','-safe','0','-i',list,...audioArgs,
      '-c:v','copy','-c:a','aac','-b:a','320k','-movflags','+faststart',partial]);
    const probe=JSON.parse(capture('ffprobe',['-v','error','-show_streams','-show_format','-of','json',partial]));
    const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');
    if(v?.width!==3840||v?.height!==2160||v?.r_frame_rate!=='60/1'||Number(v?.nb_frames)!==ready.frames||!a)throw Error('4K60/frame count/audio verification failed');
    run('ffmpeg',['-v','error','-xerror','-i',partial,'-f','null','-']);
    run('python3',[frameChecker,partial]);
    run('python3',[sceneChecker,partial,'--end-frame',String(introFrames+data.timeline.results.at-1),'--report',`${directory}/scene-check.json`]);
    run('python3',[minimapChecker,partial,'--start-frame',String(introFrames+data.timeline.raceStart+data.fps),'--end-frame',String(introFrames+data.timeline.replay.at-Math.ceil(.4*data.fps)),'--report',`${directory}/minimap-check.json`]);
    renameSync(partial,ready.output);
    const hash=createHash('sha256');for await(const chunk of createReadStream(ready.output))hash.update(chunk);
    ready.status='rendered';ready.videoBytes=statSync(ready.output).size;ready.sha256=hash.digest('hex');ready.technicalChecks='4K60, exact frame count, continuous audio, full decode, garbled-frame, every race/replay frame scene check and live minimap check passed';ready.userValidation='pending';ready.visualReview='awaiting-human-review';ready.publicationBlocked=true;save();
    console.log(`READY FOR USER REVIEW: ${ready.output}`);
  }catch(e){ready.status='failed';ready.error=e.message;save();throw e;}
}
