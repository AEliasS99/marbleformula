import fs from 'node:fs';
import {digest,videoSourceKey} from './segment-cache.mjs';
export function captureFrameRanges(start,end,limit=180){
 if(![start,end,limit].every(Number.isSafeInteger)||start<0||end<start||limit<1||limit>180)throw Error('Invalid capture frame range');
 const ranges=[];for(let a=start;a<=end;a+=limit)ranges.push([a,Math.min(end,a+limit-1)]);return ranges;
}
// Only browser lifetime changes. All picture/audio/source/dependency/browser
// identities must still agree before retaining any previously verified range.
export function captureRuntimeReuseKey(inputs,proof){
 if(!proof)return null;
 const normalized=x=>({...x,renderer:null});
 if(proof.kind!=='shorter-capture-runtime'||!fs.existsSync(proof.previousRenderer.path)||digest(proof.previousRenderer.path)!==proof.previousRenderer.sha256||proof.previousInputs.renderer!==proof.previousRenderer.sha256||inputs.renderer!==proof.currentRendererSHA256||videoSourceKey(normalized(inputs))!==videoSourceKey(normalized(proof.previousInputs))||videoSourceKey(proof.previousInputs)!==proof.previousSourceKey)throw Error('Capture runtime repair changed picture inputs or prior cache identity');
 return proof.previousSourceKey;
}
