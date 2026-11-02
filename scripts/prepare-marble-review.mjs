// Isolated marble production in the established GrandPrix pipeline. No sweeps,
// shared race rewrites, uploader, publication, archive or deletion.
import fs from 'node:fs';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const option=n=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3);
const seed=Number(option('seed')),location=option('location')??'italy';
const resume=process.argv.includes('--resume-camera');
const take=option('take');
const visualProfile=option('visual-profile');
if(visualProfile&&!['legacy','tuscany-craft'].includes(visualProfile))throw Error('Unsupported visual profile');
if(visualProfile==='tuscany-craft'&&location!=='italy')throw Error('Tuscan craft is currently reviewed on the existing Italy circuit');
if(take!==undefined&&!/^[a-z][a-z0-9-]{0,32}$/.test(take))throw Error('Invalid isolated take');
const audioProfile='asmr-v1';
const name=`${location}-marbles-race-first-seed${seed}${take?'-'+take:''}`;
if(!Number.isSafeInteger(seed)||seed<0)throw Error('An explicit fixed seed is required');
const directory=resolve(option('directory')??`out/tcr/marble-review/${name}`);
const rel=relative(resolve('out/tcr/marble-review'),directory);
if(!rel||rel.startsWith('..')||rel.startsWith('/'))throw Error('Use an isolated marble review directory');
const videoRoot=resolve(process.env.VIDEO_OUT??`${process.env.HOME}/GoogleCloud`);
const free=()=>{const s=fs.statfsSync(videoRoot);return s.bavail*s.bsize/2**30;};
if(free()<(resume?40:50))throw Error('Insufficient disk reserve');
if(resume){if(!fs.existsSync(directory+'/camera-candidate.json')||fs.existsSync(directory+'/ready.json'))throw Error('Resume needs a saved camera candidate and no completed preparation');}
else if(fs.existsSync(directory+'/race.json')||fs.existsSync(directory+'/job.json'))throw Error('Existing fixed-seed work preserved; inspect and resume, never rebake');
fs.mkdirSync(directory,{recursive:true});
if(resume&&!fs.existsSync(directory+'/job-before-camera.json'))fs.copyFileSync(directory+'/job.json',directory+'/job-before-camera.json');
const job={seed,location,take,status:'preparing',pid:process.pid,startedAt:new Date().toISOString(),publicationBlocked:true};
const write=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
const save=()=>write(directory+'/job.json',job);
save();
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):e.isFile()?[dir+'/'+e.name]:[]);
try{
 // Freeze before physics. Current active car exports and official races stay intact.
 if(!resume){fs.cpSync('src',directory+'/input/src',{recursive:true});fs.cpSync('scripts',directory+'/input/scripts',{recursive:true});if(fs.existsSync('public/materials'))fs.cpSync('public/materials',directory+'/input/public/materials',{recursive:true});}
 const sourceHashes=resume?JSON.parse(fs.readFileSync(directory+'/frozen-inputs.json')).files:Object.fromEntries(walk(directory+'/input').map(p=>[relative(directory,p),hash(p)]));
 if(!resume)write(directory+'/frozen-inputs.json',{createdAt:new Date().toISOString(),files:sourceHashes});
 for(const[p,h]of Object.entries(sourceHashes))if(hash(directory+'/'+p)!==h)throw Error('Frozen input changed');
 const renderAssets=Object.entries(sourceHashes).filter(([p])=>p.startsWith('input/public/materials/')).map(([path,sha256])=>({path,sha256,publicPath:path.slice('input/public/'.length)}));
 const base=directory+'/input';
 const {productionLocation}=await import(base+'/src/gp/production-locations.js');
 const place=productionLocation(location);
 const output=resolve(videoRoot,name+'-4k.mp4');
 if(fs.existsSync(output)||fs.existsSync(output.replace('.mp4','.partial.mp4')))throw Error('Existing output preserved');
 for(const suffix of ['','-intro'])if(fs.existsSync(`public/gp/${name}${suffix}.wav`))throw Error('Existing soundtrack preserved; use a distinct isolated take');
 process.env.GP_CARS='0';process.env.GP_LAPS='2';process.env.GP_MARBLE_HOST=place.host;
 process.env.GP_MARBLE_PHYSICS='contact-flow-v2';
 delete process.env.GP_COUNTRIES;delete process.env.GP_HEAT;delete process.env.GP_SEEDS;
 const {default:RAPIER}=await import('@dimforge/rapier3d-compat');await RAPIER.init();
 const {runRound,introFor,introTrack,soundtrack}=await import(base+'/scripts/season.mjs');
 const {marbleRaceFirstIntro}=await import(base+'/src/gp/marble-presentation.js');
 const {teamOf,TEAMS}=await import(base+'/src/gp/teams.js');
 const res=resume?{data:JSON.parse(fs.readFileSync(directory+'/camera-candidate.json')),impacts:JSON.parse(fs.readFileSync(directory+'/audio-input.json')).impacts}:await runRound(visualProfile==='tuscany-craft'?{...place.round,carSceneryProfile:'tuscany-venue-v3'}:place.round,seed,{quiet:false}),d=res.data;
 if(visualProfile==='tuscany-craft'){d.info.sceneryProfile='tuscany-venue-v3';d.info.trackSurface='timber-craft';}
 if(resume){
  const {nonCameraHash}=await import(base+'/scripts/refresh-production-cameras.mjs');
  const before=JSON.parse(fs.readFileSync(directory+'/race.json'));
  if(nonCameraHash(before)!==nonCameraHash(d)||d.seed!==seed)throw Error('Camera repair changed saved physics/results/presentation');
  if(!fs.existsSync(directory+'/race-before-camera.json'))fs.copyFileSync(directory+'/race.json',directory+'/race-before-camera.json');
  res.summary=JSON.parse(fs.readFileSync(directory+'/checks.json')).summary;
 }
 // Write the single fixed bake immediately, even if a later QA gate fails.
 if(!resume){write(directory+'/race-bake.json',d);write(directory+'/audio-input.json',{impacts:res.impacts});}
 d.round=1;d.rounds=1;d.hostCountry=place.host;d.audioProfile=audioProfile;
 const points=[25,20,16,13,11,10,9,8,7,6,5,4,3,2,1];
 d.results=d.order.map((i,k)=>({marble:i,pos:k+1,points:d.marbles[i].finishFrame===null?0:points[k]??0,time:d.marbles[i].finishExact===null?null:(d.marbles[i].finishExact-d.timeline.raceStart)/d.fps,dq:d.marbles[i].dqFrame!==null}));
 d.standings=d.results.map(r=>({marble:r.marble,pos:r.pos,points:r.points,prevPos:null}));
 d.teams=TEAMS;d.standingsBefore=[];d.constructorsBefore=[];
 d.constructors=TEAMS.map(team=>({team:team.id,points:d.results.filter(r=>teamOf(d.marbles[r.marble].abbr)?.id===team.id).reduce((n,r)=>n+r.points,0)})).sort((a,b)=>b.points-a.points).map((r,k)=>({...r,pos:k+1,prevPos:null}));
 const legacy=introFor(d,1);d.intro=marbleRaceFirstIntro(d,legacy);
 write(directory+'/intro-comparison.json',{oldFrames:legacy.total,newFrames:d.intro.total,profile:d.intro.profile,physicsRebakes:0});
 write(directory+'/race.json',d);
 const {marbleMotionReport}=await import(base+'/scripts/marble-motion-report.mjs');
 const physicsAudit=marbleMotionReport(d);write(directory+'/physics-audit.json',physicsAudit);
 const checks={allAccountedFor:d.marbles.every(m=>m.finishFrame!==null||m.dqFrame!==null),recoveries:physicsAudit.recoveries,stalls:physicsAudit.faults.filter(x=>x.reason==='stalled'),physicsAudit,camera:d.cameraAudit,
  checkpoints:d.checkpoints.map(c=>({index:c.index,survive:c.survive,eliminated:c.eliminated})),countries:d.marbles.map(m=>m.abbr),seed,
  summary:res.summary,vehicle:'marble',presentation:d.intro.profile,physics:'Rapier marble rigid bodies; original obstacles and two-lap circuit'};
 write(directory+'/checks.json',checks);
 if(!physicsAudit.passed||physicsAudit.delayReviewRequired||!checks.allAccountedFor||d.marbles.length!==20||d.marbles[0].abbr!==place.host||d.marbles[0].grid!==1||checks.checkpoints.length!==3||checks.camera.unresolvedFramingFrames.length||checks.camera.unresolvedOcclusionFrames.length)throw Error('Marble physics/obstacle flow/live camera gates failed; preserve this bake and physics-audit.json for repair');
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 fs.writeFileSync(`public/gp/${name}.wav`,soundtrack(res,random,{mixProfile:audioProfile}));
 fs.writeFileSync(`public/gp/${name}-intro.wav`,introTrack(d.intro,d,random));
 const audioHashes=Object.fromEntries(['','-intro'].map(s=>[`public/gp/${name}${s}.wav`,hash(`public/gp/${name}${s}.wav`)]));
 const entry=directory+'/entry.tsx';
 fs.writeFileSync(entry,`import {Composition,registerRoot} from 'remotion';\nimport {GrandPrix} from './input/src/gp/GrandPrix';\nimport type {RoundData} from './input/src/gp/race';\nimport data from './race.json';\nregisterRoot(()=> <Composition id="Marbles-Race-4k" component={GrandPrix} fps={60} width={3840} height={2160} durationInFrames={${d.timeline.total+d.intro.total}} defaultProps={{id:'${place.id}',layout:'landscape',data:data as unknown as RoundData,audioId:'${name}'}}/>);\n`);
 for(const[p,h]of Object.entries(sourceHashes))if(hash(directory+'/'+p)!==h)throw Error('Frozen input changed');
 write(directory+'/ready.json',{variant:'marble-production',vehicle:'marble',location,take,heat:'exhibition',seed,hostCountry:place.host,countries:checks.countries,directory,entry,composition:'Marbles-Race-4k',output,audioId:name,audioHashes,renderAssets,sourceHashes,sourceSnapshot:'input/src',raceSha256:hash(directory+'/race.json'),frames:d.timeline.total+d.intro.total,presentationFrames:d.intro.total,reviewTitle:`Canicas · ${place.label} · 20 países · Revisión 4K60`,status:'prepared',userValidation:'pending',publicationBlocked:true,requireMarbleReplayGate:true,audioProfile,requireAsmrReview:true,audioMixReview:{result:'pending',instruction:'Listen to complete race, checkpoint, replay and closing mix. Signal tests alone do not approve ASMR; record exact approved audio hashes.'}});
 job.status='awaiting-replay-and-native-review';job.output=output;job.frames=d.timeline.total+d.intro.total;job.introSeconds=d.intro.total/60;job.finishedAt=new Date().toISOString();save();console.log(JSON.stringify(job));
}catch(e){job.status='failed';job.error=e.message;save();throw e;}
