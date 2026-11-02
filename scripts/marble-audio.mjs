// Stereo-linked peak control: an isolated impact must not turn down an entire
// race's music. Preserve quiet rolling detail and recover after each impact.
export function limitBroadcastPeaks(left,right,rate=44100,ceiling=.85){
 if(left.length!==right.length)throw Error('Stereo sample counts differ');
 const future=new Float32Array(left.length),attack=Math.exp(-1/(rate*.003)),release=Math.exp(-1/(rate*.15));
 let envelope=0;
 for(let k=left.length-1;k>=0;k--){envelope=Math.max(Math.abs(left[k]),Math.abs(right[k]),envelope*attack);future[k]=envelope;}
 envelope=0;
 for(let k=0;k<left.length;k++){
  envelope=Math.max(future[k],envelope*release);
  const gain=Math.min(1,ceiling/Math.max(ceiling,envelope));left[k]*=gain;right[k]*=gain;
 }
}
// Replay the SAME physical rolling/contact bus on the existing picture clock.
export function copyRetimedAudio(sourceL,sourceR,outL,outR,{sourceStart,outputStart,length,speed}){
 for(let k=0;k<length&&outputStart+k<outL.length;k++){
  const at=sourceStart+k*speed,lo=Math.floor(at),hi=lo+1,f=at-lo,to=outputStart+k;
  if(to<0||lo<0||hi>=sourceL.length)continue;
  outL[to]+=sourceL[lo]*(1-f)+sourceL[hi]*f;
  outR[to]+=sourceR[lo]*(1-f)+sourceR[hi]*f;
 }
}
