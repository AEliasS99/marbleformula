// Measured world distance along the baked trajectory. No display multiplier:
// simulation metres/second -> km/h. Excludes parked/drained/teleported poses.
export function carSpeedKph(data,index,time){
 const car=data.marbles[index],start=data.timeline.raceStart;
 if(time<start)return 0;
 if(car.dqFrame!=null&&time>=car.dqFrame||car.finishFrame!=null&&time>=car.finishFrame)return null;
 const last=Math.min(data.frames.length-1,car.dqFrame==null?Infinity:car.dqFrame-1,car.finishFrame??Infinity);
 const radius=Math.max(1,Math.round(data.fps*.06));
 const a=Math.max(start,Math.floor(time)-radius),b=Math.min(last,Math.ceil(time)+radius);
 if(b<=a)return 0;
 let distance=0;
 for(let f=a+1;f<=b;f++)distance+=Math.hypot(...data.frames[f][index].slice(0,3).map((v,k)=>v-data.frames[f-1][index][k]));
 return distance*data.fps/(b-a)*3.6;
}
