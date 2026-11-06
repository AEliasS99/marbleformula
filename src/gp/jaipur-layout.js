import {wachauLayout} from './wachau-layout.js';
const cache=new WeakMap();
// Retain established safe site placement, but face the architecture's front
// toward the nearest actual racing surface. Terrain grading uses this same yaw.
export function jaipurLayout(samples){
 if(cache.has(samples))return cache.get(samples);
 const base=wachauLayout(samples),sites=base.sites.map(site=>{
  const nearest=samples.reduce((a,b)=>Math.hypot(a.p[0]-site.x,a.p[2]-site.z)<Math.hypot(b.p[0]-site.x,b.p[2]-site.z)?a:b);
  return {...site,rotY:Math.atan2(nearest.p[0]-site.x,nearest.p[2]-site.z)};
 });
 const result={sites,clear:base.clear};cache.set(samples,result);return result;
}
