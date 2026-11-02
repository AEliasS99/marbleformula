import {sceneryLayout} from './scenery-layout.js';
// Landscape and settlement positions only. The regional recipes retain their
// own houses, vegetation, materials and landmarks; camera QA uses those parts.
export function regionalRelief(samples){
 const a=sceneryLayout(samples),highest=Math.max(...samples.map(s=>s.p[1]));
 const peaks=[],plots=[],roadClear=(x,z,radius)=>samples.every(s=>Math.hypot(s.p[0]-x,s.p[2]-z)>radius+(s.w??2.2)+1.5);
 for(let i=0;i<22;i++){
  const angle=i/22*Math.PI*2,radius=25+i%4*8;
  let x=a.cx+Math.cos(angle)*(a.rx+radius*1.8+35),z=a.cz+Math.sin(angle)*(a.rz+radius*1.8+35);
  while(!roadClear(x,z,radius*1.6)){x=a.cx+(x-a.cx)*1.08;z=a.cz+(z-a.cz)*1.08;}
  peaks.push({x,y:a.groundY+2,z,radius,height:highest-a.groundY+35+(i%5)*14,seed:1700+i});
 }
 let next=32;
 for(const s of samples){
  if(s.u<next||s.u>samples.at(-1).u-45)continue;next=s.u+32;
  const len=Math.hypot(s.r[0],s.r[2])||1;
  for(const side of [-1,1]){
   const distance=(s.w??2.2)+15+(Math.floor(s.u/32)%3)*2;
   const x=s.p[0]+s.r[0]/len*side*distance,z=s.p[2]+s.r[2]/len*side*distance;
   if(!roadClear(x,z,9)||plots.some(p=>Math.hypot(p.x-x,p.z-z)<14))continue;
   plots.push({x,y:s.p[1]-.7,z,rotY:Math.atan2(s.p[0]-x,s.p[2]-z),seed:Math.floor(s.u)});
  }
 }
 return {peaks,plots,groundY:a.groundY};
}
