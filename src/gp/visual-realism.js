// Render-only presentation. No saved position, camera, result or collision edit.
export const naturalLighting=data=>data?.visualQuality?.lighting==='natural-v1';
export const motorsportMaterials=data=>['motorsport-v1','motorsport-v2'].includes(data?.visualQuality?.materials);
export const realismMaterials=data=>data?.visualQuality?.materials==='motorsport-v2';
export function visibleBoost(data,index,time){
 const frames=data.frames,f=Math.max(0,Math.min(frames.length-1,Math.floor(time))),row=frames[f][index],u=row[7];
 // Exhaust responds to the actual car occupying a powered lane, not to speed.
 let lo=0,hi=data.samples.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(data.samples[m].u<=u)lo=m;else hi=m;}
 const s=data.samples[Math.abs(data.samples[lo].u-u)<Math.abs(data.samples[hi].u-u)?lo:hi];
 const lateral=row.slice(0,3).reduce((v,p,k)=>v+(p-s.p[k])*s.r[k],0);
 return (data.boosters??[]).some(b=>u>=b.u0&&u<=b.u1&&Math.abs(lateral-(b.latCenter??0))<=(b.latHalf??(b.width??6.4)/2))?1:0;
}
// Equirectangular daylight environment, with a hazy horizon and broad cloud
// layers. Both background and bodywork reflections read the same pixels.
export function daylightPixels(width=512,height=256){
 const pixels=new Uint8Array(width*height*4),mix=(a,b,t)=>a+(b-a)*t;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const elevation=-Math.cos(y/(height-1)*Math.PI),azimuth=x/width*Math.PI*2;
  const horizon=Math.exp(-Math.abs(elevation)*4),cloud=Math.max(0,Math.sin(azimuth*3+.6)*.4+Math.sin(azimuth*7-elevation*9)*.18+Math.sin(elevation*18+.8)*.25)*Math.max(0,elevation)*.28;
  const top=elevation>=0?[111,151,181]:[90,105,81],edge=elevation>=0?[206,215,208]:[147,152,123],i=(y*width+x)*4;
  for(let c=0;c<3;c++)pixels[i+c]=Math.round(mix(mix(top[c],edge[c],horizon),237,cloud));pixels[i+3]=255;
 }
 return {width,height,pixels};
}
