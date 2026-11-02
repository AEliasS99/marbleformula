// Run under the shared factory lock. Bakes the existing full themed production
// into an isolated snapshot; never changes championship/qualifier files.
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {carShowcasePlan} from '../src/gp/car-showcase.js';
import {carMotionReport} from './car-motion-report.mjs';
import {raceAction} from './race-action.mjs';
import {productionLocation,productionReviewIdentity,hostFirstCountries,tourRacePlan} from '../src/gp/production-locations.js';
import {auditCarIslands} from './car-island-audit.mjs';
import {refineCarCircuit} from '../src/gp/car-circuit-refinement.js';
import {carPaceReport} from './car-pace-report.mjs';
const heat=process.argv.find(a=>a.startsWith('--heat='))?.slice(7)||'1';
if(!/^[1-4]$/.test(heat))throw Error('Expected --heat=1..4');
const location=process.argv.find(a=>a.startsWith('--location='))?.slice(11)||'alps';
const place=productionLocation(location),baseRound=place.round;
const requestedCountries=process.argv.find(a=>a.startsWith('--countries='))?.slice(12);
const countries=hostFirstCountries(location,requestedCountries??tourRacePlan('colombia',Number(process.argv[2]??17)).countries).join(',');
process.env.GP_CARS='1';process.env.GP_LAPS='1';process.env.GP_HEAT=heat;
if(countries)process.env.GP_COUNTRIES=countries;else delete process.env.GP_COUNTRIES;
const {default:RAPIER}=await import('@dimforge/rapier3d-compat');
const {runRound,introTrack,buildCourse}=await import('./season.mjs');
const {carSoundtrack}=await import('./car-engine.mjs');
const variant=process.argv.find(a=>a.startsWith('--variant='))?.slice(10)||'standard';
const visualStyle=process.argv.find(a=>a.startsWith('--visual-style='))?.slice(15)||'legacy';
if(!['legacy','natural'].includes(visualStyle))throw Error('Unknown visual style');
if(!['standard','turbo','sprint','coastal-action','andes-action','andes-rush','world-rush'].includes(variant))throw Error('Unknown production circuit variant');
if(variant==='turbo'&&location!=='alps')throw Error('The authored Alpine Turbo layout belongs to Alpes');
if(variant==='coastal-action'&&location!=='spain')throw Error('Coastal action design belongs to Spain');
if(variant==='andes-action'&&location!=='colombia')throw Error('Coffee Andes action design belongs to Colombia');
if(variant==='andes-rush'&&location!=='colombia')throw Error('Coffee Andes Rush belongs to Colombia');
let designedRound;
if(variant==='world-rush'){
 const {worldRushRound,worldRushAction}=await import('../src/gp/circuits/world-rush.js');
 const road=worldRushRound(baseRound);designedRound=worldRushAction(road,buildCourse(road));
}else if(variant==='andes-rush'){
 const {colombiaRushRound,colombiaRushAction}=await import('../src/gp/circuits/colombia-action.js');
 const road=colombiaRushRound(baseRound);designedRound=colombiaRushAction(road,buildCourse(road));
}else designedRound=variant==='andes-action'?(await import('../src/gp/circuits/colombia-action.js')).colombiaAction(baseRound,buildCourse(baseRound)):variant==='coastal-action'?(await import('../src/gp/circuits/spain-action.js')).spainAction(baseRound,buildCourse(baseRound)):variant==='turbo'?(await import('../src/gp/circuits/alps-turbo.js')).alpsTurbo(baseRound):variant==='sprint'?(await import('../src/gp/circuits/compose-sprint.js')).composeSprint(baseRound,buildCourse(baseRound)):baseRound;
const round=refineCarCircuit(designedRound,buildCourse(designedRound));
const seed=Number(process.argv[2]??17);
if(!Number.isInteger(seed)||seed<0) throw Error('Expected a nonnegative seed');
const take=process.argv.find(a=>a.startsWith('--take='))?.slice(7)||'evolution';
if(!/^[a-z][a-z0-9-]{0,32}$/.test(take))throw Error('Invalid take');
const identity=productionReviewIdentity(location,heat,take,seed),name=identity.name;
const directory=resolve(identity.folder,name);
const output=resolve(process.env.VIDEO_OUT??`${homedir()}/GoogleCloud`,`${name}-4k.mp4`);
if(existsSync(output)) throw Error(`Existing review master is preserved: ${output}`);
if(existsSync(`${directory}/race.json`)||existsSync(`${directory}/ready.json`))throw Error('Existing review snapshot is preserved; use a new take');
mkdirSync(directory,{recursive:true});
await RAPIER.init();
const res=await runRound(round,seed,{quiet:false});
console.log(res.summary);
const d=res.data;
// New productions inherit the reviewed visual setup. Saved races stay intact.
d.visualQuality=visualStyle==='natural'?{tyreContact:true,materials:'motorsport-v2',lighting:'natural-v1'}:{tyreContact:true,materials:'motorsport-v1'};
const original=JSON.parse(readFileSync('out/tcr/alps/heat-1.json','utf8'));
d.round=location==='alps'?original.round:place.roundNumber;d.rounds=Math.max(original.rounds,d.round);d.intro=carShowcasePlan(d.marbles.length,d.fps);
d.results=d.order.map((i,k)=>({marble:i,pos:k+1,points:0,time:d.marbles[i].finishExact===null?null:Math.round((d.marbles[i].finishExact-d.timeline.raceStart)/d.fps*1000)/1000,dq:d.marbles[i].dqFrame!==null}));
d.standings=d.results.map(r=>({marble:r.marble,pos:r.pos,points:0,prevPos:null}));
d.constructors=[];d.teams=original.teams;d.standingsBefore=[];d.constructorsBefore=[];
const checks={
  allAccountedFor:d.marbles.every(m=>m.finishFrame!==null||m.dqFrame!==null),
  countries:d.marbles.map(m=>m.abbr),
  checkpoints:d.checkpoints.map(c=>({survive:c.survive,eliminated:c.eliminated})),
  recoveries:d.carDiagnostics.reduce((n,c)=>n+c.recoveries,0),
  outcomes:d.results.map(r=>({country:d.marbles[r.marble].abbr,...r})),
  conditions:d.carConditions,carDiagnostics:d.carDiagnostics,camera:d.cameraAudit,
  model:'Existing constrained car controller with grip-limited braking/steering; not a full tyre/suspension simulation',
};
const stalls=[];
for(let i=0;i<d.marbles.length;i++) {
  let slow=0;
  for(let f=d.timeline.raceStart+120;f<d.frames.length;f++) {
    if(d.marbles[i].finishFrame!==null&&f>=d.marbles[i].finishFrame||d.marbles[i].dqFrame!==null&&f>=d.marbles[i].dqFrame)break;
    const speed=Math.hypot(...d.frames[f][i].slice(0,3).map((v,k)=>v-d.frames[f-1][i][k]))*d.fps;
    slow=speed<1?slow+1:0;
    if(slow===120)stalls.push({car:i,frame:f});
  }
}
checks.stalls=stalls;
checks.action=raceAction(d);
checks.motion=carMotionReport(d);
checks.islands=auditCarIslands(d);
if(d.carConditions?.racecraft?.paceModel==='race-pace-v2')checks.pace=carPaceReport(d);
if(d.carConditions?.racecraft?.cockpitCamera===true)checks.cockpit={passed:d.cameraAudit.cockpitFrames>=d.fps*2,shots:d.cameraAudit.cockpitShots,frames:d.cameraAudit.cockpitFrames,nativeInteriorClippingReview:'pending'};
if(d.carConditions?.racecraft?.drivingModel==='lookahead-driver-v1'){
  checks.driving={model:d.carDrivingModel,drivers:d.carDrivingDiagnostics,decisions:d.carDrivingDecisions?.length??0,
    passed:d.carDrivingModel==='lookahead-driver-v1'&&d.carDrivingDiagnostics?.length===d.marbles.length&&d.carDrivingDiagnostics.every(x=>x.plans>0)&&d.carDrivingDecisions.every(x=>[x.u,x.targetLat,x.speedLimit,x.lookahead,x.risk].every(Number.isFinite))};
}
writeFileSync(`${directory}/checks.json`,JSON.stringify(checks,null,2));
writeFileSync(`${directory}/race.json`,JSON.stringify(d));
writeFileSync(`${directory}/audio-input.json`,JSON.stringify({impacts:res.impacts}));
if(!checks.allAccountedFor||checks.recoveries||stalls.length||!checks.motion.passed||!checks.islands.passed||checks.pace&&!checks.pace.passed||checks.driving&&!checks.driving.passed||checks.cockpit&&!checks.cockpit.passed||checks.checkpoints.length!==3||checks.camera.unresolvedOcclusionFrames.length||checks.camera.unresolvedFramingFrames.length)throw Error('Race requires physical/camera/pace review before rendering; see checks.json');
writeFileSync(`public/gp/${name}.wav`,carSoundtrack(res));
let audioSeed=(seed+7)>>>0;
writeFileSync(`public/gp/${name}-intro.wav`,introTrack(d.intro,d,()=>{audioSeed=(Math.imul(audioSeed,1664525)+1013904223)>>>0;return audioSeed/4294967296;}));
writeFileSync(`${directory}/entry.tsx`, `import {Composition,registerRoot} from 'remotion';\nimport {GrandPrix} from '../../../../src/gp/GrandPrix';\nimport type {RoundData} from '../../../../src/gp/race';\nimport data from './race.json';\nregisterRoot(()=> <Composition id="${identity.composition}" component={GrandPrix} fps={60} width={3840} height={2160} durationInFrames={${d.timeline.total+d.intro.total}} defaultProps={{id:'${place.id}',layout:'landscape',data:data as unknown as RoundData,audioId:'${name}'}}/>);\n`);
writeFileSync(`${directory}/ready.json`,JSON.stringify({variant:location!=='alps'?"production-review":variant==='turbo'?"alps-turbo":"alps-evolution",location,heat,countries:checks.countries,directory,entry:`${directory}/entry.tsx`,composition:identity.composition,output,audioId:name,seed,frames:d.timeline.total+d.intro.total,presentationFrames:d.intro.total,presentationConfig:d.visualQuality,reviewTitle:location==='colombia'?'Colombia · Coffee Andes Rush · Revisión 4K60':take==='evolution'&&heat==='1'?undefined:`${place.label} · Manga ${heat} · ${take} · Revisión 4K`,status:'prepared',userValidation:'pending',publication:'not uploaded',reference:'/Users/user/GoogleCloud/tcr-alps-heat1-4k.mp4'},null,2));
console.log(JSON.stringify({directory,output,checks},null,2));
