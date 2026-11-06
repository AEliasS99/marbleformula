import fs from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const same=(a,b)=>a&&b&&Object.keys(a).length>0&&Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([k,v])=>b[k]===v);

// Rendering an explicitly requested remote-review master does not certify its
// subjective sound. Keep the ordinary listening gate, and admit only a fresh,
// exact-input Unlisted review with independently recorded audio signal checks.
// The uploader still requires its separate exact-MP4 delivery receipt.
export function assertAsmrRenderReview(ready,racePath){
 if(!ready.requireAsmrReview)return {purpose:'legacy-render'};
 const audio=ready.audioMixReview;
 if(audio?.result==='passed'&&same(ready.audioHashes,audio.audioHashes))return {purpose:'listened-audio-render'};
 const a=ready.reviewRenderAuthorization,e=audio?.technicalEvidence;
 const valid=a?.kind==='explicit-user-request'&&a.purpose==='user-requested-unlisted-review'&&a.privacy==='unlisted'&&typeof a.id==='string'&&a.id.length>0&&typeof a.request==='string'&&a.request.length>0&&Number.isFinite(Date.parse(a.requestedAt))&&a.raceSha256===hash(racePath)&&resolve(a.output??'')===resolve(ready.output)&&same(a.audioHashes,ready.audioHashes)&&same(audio?.audioHashes,ready.audioHashes)&&audio?.result==='pending-editorial'&&audio.listened===false&&e&&fs.existsSync(e.path)&&hash(e.path)===e.sha256;
 if(!valid)throw Error('Actual ASMR listening approval, or explicit exact-input Unlisted review with pending editorial audio, is required before full rendering');
 const evidence=JSON.parse(fs.readFileSync(e.path));
 if(evidence.result!=='passed'||evidence.method!=='signal-checks'||evidence.listened!==false||!same(evidence.audioHashes,ready.audioHashes)||evidence.raceSha256!==a.raceSha256)throw Error('Unlisted render review cannot bypass failed, stale or missing audio signal evidence');
 return {purpose:'user-requested-unlisted-review',editorialAudioPending:true,authorizationId:a.id};
}
