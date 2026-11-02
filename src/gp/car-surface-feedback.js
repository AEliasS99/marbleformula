import {waterResponse} from './car-pace.js';
export function carRoadPosition(data,index,frame){
 const row=data.frames[Math.max(0,Math.min(data.frames.length-1,Math.round(frame)))][index],u=row[7];let lo=0,hi=data.samples.length-1;
 while(hi-lo>1){const m=(lo+hi)>>1;if(data.samples[m].u<=u)lo=m;else hi=m;}
 const a=data.samples[lo],b=data.samples[hi],f=Math.max(0,Math.min(1,(u-a.u)/(b.u-a.u))),p=a.p.map((v,i)=>v+(b.p[i]-v)*f),right=a.r.map((v,i)=>v+(b.r[i]-v)*f);
 return {u,lat:row.slice(0,3).reduce((sum,v,k)=>sum+(v-p[k])*right[k],0)};
}
export function carSurfaceFeedback(data,index,frame,speed){
 const {u,lat}=carRoadPosition(data,index,frame),conditions=data.carConditions;
 const water=waterResponse(conditions,u,lat,speed/3.6);
 const lane=data.boosters?.find(b=>u>=b.u0&&u<=b.u1&&Math.abs(lat-(b.latCenter??0))<=b.width/2);
 const pond=conditions?.patches?.find(p=>p.kind==='pond'&&u>=p.u0&&u<=p.u1);
 return {water:water.coverage,lane,nearPond:!!pond,speed};
}
