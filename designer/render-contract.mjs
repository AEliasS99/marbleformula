import {createHash} from 'node:crypto';
export const digest=s=>createHash('sha256').update(s).digest('hex');
export function validateRenderSnapshot({job,input,result,currentSourceHash,projectEtag}){
 if(job.status!=='complete'||result.mode!=='cars')throw Error('Choose a complete car simulation.');
 if(job.sourceHash!==currentSourceHash||result.sourceHash!==currentSourceHash)throw Error('Physics changed: bake a fresh simulation before rendering.');
 if(job.etag!==projectEtag)throw Error('The design changed since this simulation.');
 const {hash,...snapshot}=input;if(digest(JSON.stringify(snapshot))!==hash||hash!==job.snapshotHash||result.snapshotHash!==hash)throw Error('Snapshot integrity mismatch.');
 if(result.projectId!==input.project.id||result.revision!==input.project.revision)throw Error('Replay/project mismatch.');
 if(result.participants.length<4||new Set(result.participants.map(p=>p.id)).size!==result.participants.length||result.standings.length!==result.participants.length)throw Error('Invalid participant/result roster.');
 if(result.gates.length!==3||result.gates.some((g,i)=>g.quota!==result.participants.length-i-1))throw Error('Review render requires three elimination checkpoints.');
 if(result.standings.some(s=>!['finished','eliminated'].includes(s.status)))throw Error('Resolve failed or incomplete racers before making the review render.');
 if(result.frames.length<2||result.frames[0].t!==0||Math.abs(result.frames.at(-1).t-result.duration)>1e-8)throw Error('Incomplete replay timeline.');
 for(let i=0;i<result.frames.length;i++){const f=result.frames[i];if(i&&f.t<=result.frames[i-1].t)throw Error('Invalid replay clock.');if(f.racers.length!==result.participants.length||!f.racers.flat().every(Number.isFinite)||!f.wheels.flat(2).every(Number.isFinite)||f.telemetry?.length!==result.participants.length)throw Error('Incomplete pose/wheel telemetry.');}
 return {frames:Math.ceil((2+result.duration+3)*60),width:3840,height:2160,fps:60};
}
