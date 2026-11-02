import {Matrix4,Vector3} from 'three';
import {TRACK,TRACK_DEPTH} from './trackMesh.js';

export const CHECKPOINT_BOARD_Y=TRACK_DEPTH+1.3+.48;
// Match the renderer's saved-sample lookup and cross-track/normal basis exactly.
export function checkpointLayout(samples,checkpoints=[]) {
  return checkpoints.slice(0,3).map(cp=>{
    const f=samples[Math.max(0,Math.min(samples.length-1,Math.round((cp.u-samples[0].u)/.5)))];
    const right=new Vector3(...f.r).normalize(),normal=new Vector3(...f.n).normalize();
    const along=new Vector3().crossVectors(right,normal).normalize();
    const matrix=new Matrix4().makeBasis(right,normal,along);matrix.setPosition(...f.p);
    const width=(f.w??TRACK.width/2)+TRACK.wall,y=CHECKPOINT_BOARD_Y;
    const parts=[{pos:[0,y,0],size:[2*width+.78,.74,.24],category:'checkpoint-board'}];
    for(const side of [-1,1]){
      const x=side*(width+.22);
      parts.push({pos:[x,.28,0],size:[.28,.56,.36],category:'checkpoint-base'},
        {pos:[x,y/2+.1,0],size:[.22,y+.2,.22],category:'checkpoint-post'},
        {pos:[x,y+.38,0],size:[.28,.4,.28],category:'checkpoint-beacon'});
    }
    return {frame:f,matrix:matrix.elements,width,boardY:y,parts};
  });
}
