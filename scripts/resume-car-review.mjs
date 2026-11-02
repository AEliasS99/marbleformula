// Finalize an explicitly pinned failed preparation from saved telemetry.
// No runRound, no physics rebuild, no outcome/seed changes. Use factory lock.
import fs from 'node:fs';import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {carMotionReport} from './car-motion-report.mjs';
import {productionLocation,productionReviewIdentity} from '../src/gp/production-locations.js';
const read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const state=read(resolve(process.argv[2])),directory=dirname(state.ready),pin=state.resumeSaved;
if(!pin?.raceSha256||!pin.audioInputSha256||!pin.checksSha256)throw Error('Explicit saved-artifact pins required');
for(const [file,key]of [['race.json','raceSha256'],['audio-input.json','audioInputSha256'],['checks.json','checksSha256']])if(hash(directory+'/'+file)!==pin[key])throw Error('Saved artifact changed: '+file);
const d=read(directory+'/race.json'),checks=read(directory+'/checks.json');
const place=productionLocation(state.location),identity=productionReviewIdentity(state.location,state.heat,state.take,state.seed),name=identity.name;
if(d.seed!==state.seed||d.id!==place.id||d.marbles.map(m=>m.abbr).join(',')!==state.countries.join(','))throw Error('Saved race identity mismatch');
checks.motion=carMotionReport(d);
if(!checks.motion.passed||!checks.allAccountedFor||checks.recoveries||checks.stalls.length||!checks.islands.passed||!checks.pace?.passed||!checks.driving?.passed||!checks.cockpit?.passed||checks.checkpoints.map(c=>c.survive).join(',')!=='10,8,6'||checks.camera.unresolvedOcclusionFrames.length||checks.camera.unresolvedFramingFrames.length)throw Error('Saved physical/camera gates failed');
const targets=[state.ready,directory+'/entry.tsx',`public/gp/${name}.wav`,`public/gp/${name}-intro.wav`];
if(targets.some(p=>fs.existsSync(p))||fs.existsSync(state.output))throw Error('Existing prepared artifacts preserved');
process.env.GP_CARS='1';process.env.GP_COUNTRIES=state.countries.join(',');process.env.GP_LAPS='1';
const {carSoundtrack}=await import('./car-engine.mjs'),{introTrack}=await import('./season.mjs');
fs.writeFileSync(`public/gp/${name}.wav`,carSoundtrack({data:d,impacts:read(directory+'/audio-input.json').impacts}));
let audioSeed=(state.seed+7)>>>0;
fs.writeFileSync(`public/gp/${name}-intro.wav`,introTrack(d.intro,d,()=>{audioSeed=(Math.imul(audioSeed,1664525)+1013904223)>>>0;return audioSeed/4294967296;}));
fs.writeFileSync(directory+'/entry.tsx',`import {Composition,registerRoot} from 'remotion';\nimport {GrandPrix} from '../../../../src/gp/GrandPrix';\nimport type {RoundData} from '../../../../src/gp/race';\nimport data from './race.json';\nregisterRoot(()=> <Composition id="${identity.composition}" component={GrandPrix} fps={60} width={3840} height={2160} durationInFrames={${d.timeline.total+d.intro.total}} defaultProps={{id:'${place.id}',layout:'landscape',data:data as unknown as RoundData,audioId:'${name}'}}/>);\n`);
fs.writeFileSync(state.ready,JSON.stringify({variant:'production-review',location:state.location,heat:String(state.heat),countries:state.countries,directory,entry:directory+'/entry.tsx',composition:identity.composition,output:state.output,audioId:name,seed:state.seed,frames:d.timeline.total+d.intro.total,presentationFrames:d.intro.total,presentationConfig:d.visualQuality,reviewTitle:`${place.label} · Manga ${state.heat} · ${state.take} · Revisión 4K`,status:'prepared',userValidation:'pending',publication:'not uploaded',reference:'/Users/user/GoogleCloud/tcr-alps-heat1-4k.mp4'},null,2));
fs.writeFileSync(directory+'/checks.json',JSON.stringify(checks,null,2));
if(hash(directory+'/race.json')!==pin.raceSha256)throw Error('Saved telemetry changed');
fs.writeFileSync(directory+'/saved-preparation-resume.json',JSON.stringify({resumedAt:new Date().toISOString(),raceSha256:pin.raceSha256,audioInputSha256:pin.audioInputSha256,motion:checks.motion,physicsRerun:false},null,2));
console.log('Saved race finalized without physics rerun; camera/native review remains pending');
