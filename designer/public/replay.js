import {Quaternion} from 'three';
// The renderer and editor share this clock: interpolate baked poses, never resimulate.
export function sampleReplay(replay,time){
 const frames=replay.frames,t=Math.max(0,Math.min(replay.duration,time));let lo=0,hi=frames.length-1;
 while(lo<hi){const m=Math.ceil((lo+hi)/2);if(frames[m].t<=t)lo=m;else hi=m-1;}
 const a=frames[lo],b=frames[Math.min(lo+1,frames.length-1)],k=b.t>a.t?(t-a.t)/(b.t-a.t):0;
 const lerp=(x,y)=>x+(y-x)*k;
 const pose=(x,y)=>[...x.slice(0,3).map((v,i)=>lerp(v,y[i])),...new Quaternion(...x.slice(3)).slerp(new Quaternion(...y.slice(3)),k).toArray()];
 return {time:t,racers:a.racers.map((x,i)=>pose(x,b.racers[i])),fixtures:a.fixtures.map((x,i)=>pose(x,b.fixtures[i])),wheels:a.wheels.map((ws,i)=>ws.map((w,j)=>w.map((v,k)=>lerp(v,b.wheels[i][j][k])))),telemetry:(a.telemetry||[]).map((x,i)=>({...x,u:lerp(x.u,b.telemetry[i].u),speed:lerp(x.speed,b.telemetry[i].speed)}))};
}
