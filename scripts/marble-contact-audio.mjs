import {routeOffset} from '../src/gp/route-path.js';
import {surfaceHeight} from '../src/gp/trackMesh.js';
import {vortexY} from '../src/gp/vortex.js';
const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const dot=(a,b)=>a.reduce((n,x,k)=>n+x*b[k],0);

function trackFrame(data,u){
 const ss=data.samples,L=data.info.length;
 // Saved progress wraps at the grid origin, which can be negative. Using
 // zero as the seam maps the next lap's grid onto the previous lap's dock.
 const origin=ss[0].u;
 u=((u-origin)%L+L)%L+origin;
 let lo=0,hi=ss.length-1;
 while(hi-lo>1){const m=(lo+hi)>>1;if(ss[m].u<=u)lo=m;else hi=m;}
 const a=ss[lo],b=ss[hi],k=Math.max(0,Math.min(1,(u-a.u)/(b.u-a.u)));
 return {u,t:a.t.map((v,i)=>v+(b.t[i]-v)*k),p:a.p.map((v,i)=>v+(b.p[i]-v)*k),n:a.n.map((v,i)=>v+(b.n[i]-v)*k),r:a.r.map((v,i)=>v+(b.r[i]-v)*k),w:a.w+(b.w-a.w)*k,gap:a.gap||b.gap};
}
// Conservative physical support test on saved poses, never a velocity rescue.
// Flight, finishers and eliminated racers cannot generate a rolling bed.
export function rollingContact(data,index,f){
 const marble=data.marbles[index],pose=data.frames[f]?.[index],previous=data.frames[Math.max(0,f-1)]?.[index];
 if(!pose||!previous||f<data.timeline.raceStart||(marble.finishFrame!=null&&f>=marble.finishFrame)||(marble.dqFrame!=null&&f>=marble.dqFrame))return {supported:false,speed:0};
 const delta=pose.slice(0,3).map((v,k)=>(v-previous[k])*data.fps),speed=Math.hypot(...delta),radius=data.marbleRadius;
 if(speed<.15||!Number.isFinite(speed))return {supported:false,speed};
 for(const v of data.vortices??[]){
  const r=Math.hypot(pose[0]-v.center[0],pose[2]-v.center[2]);
  if(r<v.hole-radius||r>v.radius+radius)continue;
  let foot=r;
  for(let k=0;k<4;k++){const slope=v.k/Math.max(v.hole,foot)**2;foot=r+radius*slope/Math.hypot(1,slope);}
  const h=v.center[1]+vortexY(v,foot),distance=Math.hypot(foot-r,pose[1]-h);
  if(Math.abs(distance-radius)<.065)return {supported:true,speed,material:'bowl'};
 }
 const s=trackFrame(data,pose[7]),rel=pose.slice(0,3).map((v,k)=>v-s.p[k]),lat=dot(rel,s.r),height=dot(rel,s.n)-surfaceHeight(lat,s.w);
 for(const zone of data.challengeZones??[]){
  if(zone.topology!=='raised-main-v1'||s.u<zone.u0||s.u>zone.u1)continue;
  const route=zone.routes.find(route=>{const [center]=routeOffset(route.points,s.u-zone.u0);return Math.abs(lat-center)<=route.clearWidth/2;});
  if(!route)continue;
  const u=s.u-zone.u0,[,h]=routeOffset(route.points,u),slope=(routeOffset(route.points,u+.01)[1]-routeOffset(route.points,u-.01)[1])/.02;
  const norm=Math.hypot(1,slope),normal=s.n.map((v,k)=>(v-s.t[k]*slope)/norm),distance=(dot(rel,s.n)-h)/norm;
  return {supported:Math.abs(distance-radius)<.075&&Math.abs(dot(delta,normal))<1.5,speed,material:'wood'};
 }
 return {supported:!s.gap&&Math.abs(lat)<=s.w+.08&&Math.abs(height-radius)<.075&&Math.abs(dot(delta,s.n))<1.5,speed,material:data.info.trackSurface==='timber-craft'?'wood':'track'};
}

// Distance-excited resonators model successive small surface contacts. There
// is no random white-noise sample stream, shared hiss, music or machine bed.
// Individual sources pan together and go quiet when they leave the surface.
export function renderContactRoll(data,left,right,rate=44100){
 const voices=data.marbles.map((_,i)=>({i,distance:0,grain:0,next:.055+hash(i)*.055,gain:0,pan:0,a:0,b:0,c:0,d:0}));
 const mode=voices.map((_,i)=>[140+i*7,390+i*13].map((hz,k)=>{const decay=Math.exp(-1/(rate*(k?.006:.017))),w=2*Math.PI*hz/rate;return {a:2*decay*Math.cos(w),b:decay*decay,excite:Math.sin(w)};}));
 const report={profile:'asmr-v2',method:'distance-excited-contact-resonators',whiteNoiseBed:false,supportedFrames:0,unsupportedMovingFrames:0,textureContacts:0,maximumVoices:4};
 for(let f=0;f<data.frames.length;f++){
  const camera=data.cams[f],dx=camera[3]-camera[0],dz=camera[5]-camera[2],norm=Math.hypot(dx,dz)||1;
  const contacts=voices.map(v=>{
   const c=rollingContact(data,v.i,f),p=data.frames[f][v.i],distance=Math.hypot(p[0]-camera[0],p[1]-camera[1],p[2]-camera[2]);
   if(c.supported)report.supportedFrames++;else if(c.speed>.15)report.unsupportedMovingFrames++;
   return {...c,voice:v,gain:c.supported?1/(1+distance*distance/196):0,pan:Math.max(-.85,Math.min(.85,((p[0]-camera[0])*(-dz/norm)+(p[2]-camera[2])*(dx/norm))/(distance*.8+.01)))};
  }).sort((a,b)=>b.gain-a.gain);
  const selected=new Set(contacts.slice(0,4).filter(c=>c.supported).map(c=>c.voice.i));
  const start=Math.round(f/ data.fps*rate),end=Math.min(left.length,Math.round((f+1)/data.fps*rate));
  for(const c of contacts){
   const v=c.voice,target=selected.has(v.i)?c.gain:0,was=v.gain;
   if(target<.0001&&was<.0001)continue;
   const [low,high]=mode[v.i],l=Math.cos((c.pan+1)*Math.PI/4),r=Math.sin((c.pan+1)*Math.PI/4);
   for(let k=start;k<end;k++){
    let excitation=0;
    if(target>0){
     v.distance+=Math.min(c.speed,24)/rate;
     if(v.distance>=v.next){v.distance-=v.next;v.grain++;v.next=.045+hash(v.i*911+v.grain)*.07;excitation=(.065+.035*hash(v.grain*17+v.i))*Math.min(1,Math.sqrt(c.speed/8));report.textureContacts++;}
    }
    const a=low.a*v.a-low.b*v.b+excitation*low.excite,b=high.a*v.c-high.b*v.d+excitation*high.excite;
    v.b=v.a;v.a=a;v.d=v.c;v.c=b;
    const mix=(a*.88+b*.23)*(was+(target-was)*(k-start)/Math.max(1,end-start));
    left[k]+=mix*l;right[k]+=mix*r;
   }
   v.gain=target;v.pan=c.pan;
  }
 }
 return report;
}
