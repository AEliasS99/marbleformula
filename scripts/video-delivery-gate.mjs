import fs from 'node:fs';import {resolve,dirname,basename} from 'node:path';import {createHash} from 'node:crypto';
import {marbleMotionReport} from './marble-motion-report.mjs';import {carMotionReport} from './car-motion-report.mjs';
import {marbleObstacleFlow} from './marble-obstacle-flow.mjs';
import {marbleChallengeAudit} from './marble-challenge-audit.mjs';
export const VIDEO_REVIEW_CHECKS=['physics','camera','decode','scene','minimap','audio','visual','cta'];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const canonical=p=>fs.realpathSync(resolve(p));
const hash=async p=>{const h=createHash('sha256');for await(const c of fs.createReadStream(p))h.update(c);return h.digest('hex');};
const required=(ok,message)=>{if(!ok)throw Error('Delivery blocked: '+message);};

// All transfers, including dry-run/resume/--force, use this current gate.
// Old render snapshots and a renamed MP4 cannot authorize an upload by
// themselves. No credentials or provider calls are used here.
export async function assertVideoDelivery({filePath,reviewPath=filePath+'.quality.json',privacy='unlisted',publishAt=null,root=process.cwd()}){
 const file=canonical(filePath),tcr=resolve(root,'out/tcr');
 const holds=fs.existsSync(tcr+'/production-review-holds.json')?read(tcr+'/production-review-holds.json').holds??{}:{};
 const matches=p=>p&&fs.existsSync(p)&&canonical(p)===file;
 const review=fs.existsSync(reviewPath)?read(reviewPath):null,auth=review?.authorization;
 // A fresh user request may authorize this exact technically checked master
 // for remote Unlisted review while subjective art/audio remain pending.
 // This is deliberately different from recording those reviews as passed.
 const userReview=privacy==='unlisted'&&!publishAt&&review?.purpose==='user-requested-unlisted-review'&&auth?.kind==='explicit-user-request'&&auth.privacy==='unlisted'&&typeof auth.id==='string'&&auth.id.length>0&&typeof auth.request==='string'&&auth.request.length>0&&Number.isFinite(Date.parse(auth.requestedAt))&&auth.sha256===review.artifact?.sha256;
 const authorized=record=>userReview&&record?.unlistedReviewAuthorization?.id===auth.id&&record.unlistedReviewAuthorization.sha256===auth.sha256;
 const held=key=>holds[key]&&!authorized(holds[key]);
 let currentReadyAuthorized=false;
 // Inspect current live manifests, never a copied historical approval.
 for(const group of ['marble-review','track-review','alps-review']){
  const dir=resolve(tcr,group);if(!fs.existsSync(dir))continue;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   if(!entry.isDirectory())continue;const readyFile=resolve(dir,entry.name,'ready.json');if(!fs.existsSync(readyFile))continue;
   const ready=read(readyFile);if(!matches(ready.output))continue;
   required(ready.userValidation!=='changes-requested'&&ready.physicsReview?.result!=='failed'&&(!ready.uploadBlocked||authorized(ready)),'current production has changes requested, failed physics or an upload hold');
   required(!held(entry.name),'current production is held: '+entry.name);
   currentReadyAuthorized ||= authorized(ready);
  }
 }
 if(fs.existsSync(tcr))for(const name of fs.readdirSync(tcr).filter(n=>n.endsWith('-job.json'))){
  const job=read(resolve(tcr,name));if(!matches(job.output))continue;
  const key=name.slice(0,-'-job.json'.length);
  required(!held(key)&&(!job.uploadBlocked||authorized(job)||currentReadyAuthorized),'current production is held: '+key);
 }
 required(fs.existsSync(reviewPath),'missing exact-master quality review '+basename(reviewPath));
 const artifact=review.artifact;
 required(review.schema===1&&(review.result==='passed'||(userReview&&review.result==='technical-passed-editorial-pending')),'quality review is missing, pending or failed');
 required(typeof review.productionKey==='string'&&review.productionKey.length>0&&!held(review.productionKey),'missing production identity or an active quality hold');
 required(artifact&&matches(artifact.path)&&artifact.bytes===fs.statSync(file).size&&/^[a-f0-9]{64}$/.test(artifact.sha256),'review does not match this exact master');
 required(await hash(file)===artifact.sha256,'master changed after review');
 const sources=review.races??[review.race],motions=[];
 required(Array.isArray(sources)&&sources.length>0,'missing saved physics sources');
 for(const source of sources){
  required(source&&fs.existsSync(source.path)&&await hash(source.path)===source.sha256,'saved physics evidence is missing or changed');
  const data=read(source.path);required(['marble','car'].includes(data.info?.vehicle),'missing saved race vehicle identity');
  const motion=data.info.vehicle==='marble'?marbleMotionReport(data):carMotionReport(data);motions.push(motion);
  required(motion.passed,'independent saved-motion audit failed');
  if(data.info.vehicle==='marble')required(marbleChallengeAudit(data).passed,'independent saved challenge transit audit failed');
  if(data.info.physicsProfile==='contact-flow-v3'){
   required(data.audioProfile==='asmr-v2','new marble production must use the contact-driven audio profile');
   required(marbleObstacleFlow(data).passed,'independent saved obstacle transit audit failed');
  }
  required(!(data.carDiagnostics??[]).some(r=>r.recoveries>0),'saved physics contains recovery teleports');
 }
 for(const key of VIDEO_REVIEW_CHECKS){
  const gate=review.checks?.[key],pending=userReview&&['audio','visual'].includes(key)&&gate?.result==='pending-editorial';required((gate?.result==='passed'||pending)&&gate.evidence&&fs.existsSync(gate.evidence.path),'missing or unapproved '+key+' review');
  required(await hash(gate.evidence.path)===gate.evidence.sha256,'changed '+key+' evidence');
  const evidence=read(gate.evidence.path);required(evidence.result===(pending?'technical-passed-editorial-pending':'passed')&&evidence.videoSHA256===artifact.sha256,'stale or failed '+key+' evidence');
  if(pending)required(evidence.pendingEditorialReview===true,'pending subjective review must stay explicit');
  if(key==='audio')required(evidence.method===(pending?'signal-checks':'listened'),'audio signal tests do not approve the listening review');
  if(key==='visual')required(evidence.method===(pending?'sampled-export-inspection':'watched-export'),'native stills do not approve the moving export');
  if(key==='cta')required(evidence.method==='inspected-export'&&['LIKE','SUBSCRIBE','marbleformula.com'].every(text=>evidence.visibleText?.includes(text)),'LIKE/SUBSCRIBE/site not verified in the export');
 }
 required(!motions.some(m=>m.delayReviewRequired)||review.checks.physics.obstacleDelaysReviewed===true,'unreviewed obstacle delays');
 if(privacy==='public'||publishAt)required(review.publicRelease?.approved===true,'public release requires separate explicit approval');
 return {passed:true,sha256:artifact.sha256,checks:VIDEO_REVIEW_CHECKS,privacy,purpose:userReview?'user-requested-unlisted-review':'approved-quality-delivery',editorialApproved:!VIDEO_REVIEW_CHECKS.some(key=>review.checks[key].result==='pending-editorial')};
}
