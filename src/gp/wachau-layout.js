// Regional placement is deterministic and shared by terrain, picture and rays.
// Fictional Wachau-inspired setting; no claim to reproduce a surveyed town.
export const WACHAU_PROFILE='wachau-venue-v1';
const cache=new WeakMap();
export function wachauLayout(samples){
 if(cache.has(samples))return cache.get(samples);
 const xs=samples.map(s=>s.p[0]),zs=samples.map(s=>s.p[2]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs);
 const clear=(x,z,r)=>samples.every(s=>Math.hypot(s.p[0]-x,s.p[2]-z)>r+(s.w??2.1)+4);
 const sites=[];
 for(let i=110;i<samples.length-100;i+=145){
  const s=samples[i],index=Math.floor(i/145),kind=index%6===0?'village':index%2?'orchard':'terrace';
  const halfX=kind==='village'?15:10,halfZ=kind==='village'?13:9;
  for(const side of [index%2?1:-1,index%2?-1:1]){
   const distance=Math.hypot(halfX,halfZ)+15;
   const x=s.p[0]+s.r[0]*side*distance,z=s.p[2]+s.r[2]*side*distance;
   if(!clear(x,z,Math.hypot(halfX,halfZ))||sites.some(p=>Math.hypot(p.x-x,p.z-z)<Math.hypot(p.halfX,p.halfZ)+distance-8))continue;
   sites.push({x,z,halfX,halfZ,rotY:Math.atan2(s.t[0],s.t[2]),scale:1,kind,u:s.u});break;
  }
 }
 for(const [fraction,kind]of [[.38,'castle'],[.83,'abbey']]){
  const s=samples[Math.floor(samples.length*fraction)],radius=24;
  search:for(const distance of [62,88,116,148,180])for(const side of [-1,1])for(const angle of [0,-.6,.6,-1.2,1.2]){
   const dx=s.r[0]*Math.cos(angle)+s.t[0]*Math.sin(angle),dz=s.r[2]*Math.cos(angle)+s.t[2]*Math.sin(angle);
   const x=s.p[0]+dx*side*distance,z=s.p[2]+dz*side*distance;
   if(!clear(x,z,radius)||sites.some(p=>Math.hypot(p.x-x,p.z-z)<radius+Math.hypot(p.halfX,p.halfZ)+8))continue;
   sites.push({x,z,halfX:18,halfZ:15,rotY:Math.atan2(s.t[0],s.t[2]),scale:1,kind,u:s.u});break search;
  }
 }
 const points=Array.from({length:25},(_,i)=>{const x=minX-150+(maxX-minX+300)*i/24;return [x,minZ-105+12*Math.sin(i/24*Math.PI*2)];});
 const river={points,halfWidth:16,waterY:Math.min(...samples.map(s=>s.p[1]))-.05};
 const result={sites,river,clear};cache.set(samples,result);return result;
}
export function wachauRiverDistance(river,x,z){
 let distance=Infinity;
 for(let i=1;i<river.points.length;i++){
  const a=river.points[i-1],b=river.points[i],dx=b[0]-a[0],dz=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
  distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
 }
 return distance;
}
