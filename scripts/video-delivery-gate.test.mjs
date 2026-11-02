import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import {join} from 'node:path';import {createHash}from'node:crypto';
import {assertVideoDelivery,VIDEO_REVIEW_CHECKS} from './video-delivery-gate.mjs';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const write=(p,x)=>fs.writeFileSync(p,JSON.stringify(x));
function fixture(t){
 const root=fs.mkdtempSync(join(os.tmpdir(),'race-delivery-gate-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 // Contract fixture, deliberately not a video render/delivery artifact.
 const file=join(root,'master.bin');fs.writeFileSync(file,'unit artifact');const sha=hash(file);
 const raceFile=join(root,'race.json'),data={fps:60,info:{vehicle:'marble',length:100},timeline:{raceStart:0},features:[],marbles:[{abbr:'ITA',finishFrame:2,dqFrame:null}],frames:[0,.05,.1].map(x=>[[x,.35,0,0,0,0,1,x]]),carDiagnostics:[{recoveries:0}]};write(raceFile,data);
 const review={schema:1,result:'passed',productionKey:'unit-reviewed-production',artifact:{path:file,bytes:fs.statSync(file).size,sha256:sha},race:{path:raceFile,sha256:hash(raceFile)},checks:{}};
 for(const key of VIDEO_REVIEW_CHECKS){const p=join(root,key+'.json');write(p,{result:'passed',videoSHA256:sha,method:key==='audio'?'listened':key==='visual'?'watched-export':'inspected-export',visibleText:['LIKE','SUBSCRIBE','marbleformula.com']});review.checks[key]={result:'passed',evidence:{path:p,sha256:hash(p)}};}
 const reviewPath=file+'.quality.json',save=()=>write(reviewPath,review);save();
 return {root,file,reviewPath,raceFile,data,review,save,args:{filePath:file,root}};
}
test('only an exact reviewed master is eligible for Unlisted; public needs separate approval',async t=>{
 const f=fixture(t);assert.equal((await assertVideoDelivery(f.args)).passed,true);
 await assert.rejects(assertVideoDelivery({...f.args,privacy:'public'}),/separate explicit approval/);
 await assert.rejects(assertVideoDelivery({...f.args,publishAt:'2026-11-03T10:00:00Z'}),/separate explicit approval/);
});
test('changing the master or an evidence file invalidates the old review',async t=>{
 const f=fixture(t);fs.appendFileSync(f.file,' changed');await assert.rejects(assertVideoDelivery(f.args),/exact master|master changed/);
 const g=fixture(t);fs.appendFileSync(g.review.checks.audio.evidence.path,' ');await assert.rejects(assertVideoDelivery(g.args),/changed audio evidence/);
});
test('no review and a forged zero-recovery counter cannot bypass actual pose audit',async t=>{
 const f=fixture(t);fs.unlinkSync(f.reviewPath);await assert.rejects(assertVideoDelivery(f.args),/missing exact-master quality review/);
 f.data.frames[1][0][0]=4;write(f.raceFile,f.data);f.review.race.sha256=hash(f.raceFile);f.save();await assert.rejects(assertVideoDelivery(f.args),/independent saved-motion audit failed/);
});
test('the real recorded Italy67 teleport stays rejected with no dependency on ignored out files',async t=>{
 const f=fixture(t),actual=JSON.parse(fs.readFileSync(new URL('./fixtures/italy67-recorded-teleport.json',import.meta.url)));
 write(f.raceFile,actual);f.review.race.sha256=hash(f.raceFile);f.save();
 await assert.rejects(assertVideoDelivery(f.args),/independent saved-motion audit failed/);
});
test('signal-only audio, still-only visual review and absent CTAs cannot become editorial passes',async t=>{
 for(const [key,patch,error] of [['audio',{method:'signal-only'},/listening review/],['visual',{method:'native-stills'},/moving export/],['cta',{visibleText:['LIKE']},/not verified/]]){
  const f=fixture(t),p=f.review.checks[key].evidence.path;write(p,{...JSON.parse(fs.readFileSync(p)),...patch});f.review.checks[key].evidence.sha256=hash(p);f.save();await assert.rejects(assertVideoDelivery(f.args),error);
 }
});
test('current ready/job holds take precedence over old passed evidence and force',async t=>{
 const f=fixture(t),dir=join(f.root,'out/tcr/marble-review/unit');fs.mkdirSync(dir,{recursive:true});write(join(dir,'ready.json'),{output:f.file,userValidation:'changes-requested'});
 await assert.rejects(assertVideoDelivery({...f.args,force:true}),/changes requested/);
 fs.unlinkSync(join(dir,'ready.json'));write(join(f.root,'out/tcr/unit-job.json'),{output:f.file});write(join(f.root,'out/tcr/production-review-holds.json'),{holds:{unit:{reason:'quality regression'}}});await assert.rejects(assertVideoDelivery({...f.args,force:true}),/production is held/);
});
test('multi-race compilations require valid saved-motion evidence for every included race',async t=>{
 const f=fixture(t),second=join(f.root,'second.json');write(second,{...f.data,carDiagnostics:[{recoveries:1}]});f.review.races=[f.review.race,{path:second,sha256:hash(second)}];f.save();await assert.rejects(assertVideoDelivery(f.args),/motion audit failed|recovery teleports/);
});
test('fresh exact-master Unlisted review can retain explicit pending editorial checks, never bypass technical faults or authorize public',async t=>{
 const f=fixture(t),auth={id:'specific-user-request',kind:'explicit-user-request',request:'sube a youtube',requestedAt:'2026-11-02T08:30:00Z',privacy:'unlisted',sha256:f.review.artifact.sha256};
 Object.assign(f.review,{purpose:'user-requested-unlisted-review',result:'technical-passed-editorial-pending',authorization:auth});
 for(const key of ['audio','visual']){const gate=f.review.checks[key],p=gate.evidence.path;write(p,{result:'technical-passed-editorial-pending',videoSHA256:auth.sha256,pendingEditorialReview:true,method:key==='audio'?'signal-checks':'sampled-export-inspection'});gate.result='pending-editorial';gate.evidence.sha256=hash(p);}f.save();
 const tcr=join(f.root,'out/tcr');fs.mkdirSync(tcr,{recursive:true});write(join(tcr,'production-review-holds.json'),{holds:{[f.review.productionKey]:{reason:'art pending'}}});
 await assert.rejects(assertVideoDelivery(f.args),/active quality hold/);
 write(join(tcr,'production-review-holds.json'),{holds:{[f.review.productionKey]:{reason:'art pending',unlistedReviewAuthorization:auth}}});
 assert.equal((await assertVideoDelivery(f.args)).editorialApproved,false);
 await assert.rejects(assertVideoDelivery({...f.args,privacy:'public'}),/missing|pending|hold/);
 f.data.frames[1][0][0]=4;write(f.raceFile,f.data);f.review.race.sha256=hash(f.raceFile);f.save();await assert.rejects(assertVideoDelivery(f.args),/motion audit failed/);
});
