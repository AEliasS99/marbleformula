// Regional dressing on the same grounded terrain/viaduct and merged-mesh pipeline.
// The camera reads these exact opaque parts, including trees and buildings.
import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {sceneryLayout} from './scenery-layout.js';
import {italianTerrain as regionalTerrain} from './italy-terrain.js';
import {italianScenery} from './italy-scenery.js';
import {regionalRelief} from './regional-relief.js';
const pose=(p,r=[0,0,0],s=1)=>new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(s,s,s));
export const BRITAIN_MATERIALS={
 sandstone:{color:'#c3af83',roughness:.96},roof:{color:'#665c4b',roughness:.97},
 stone:{color:'#96917d',roughness:1},glass:{color:'#698b95',roughness:.4,metalness:.05},
 door:{color:'#344c42',roughness:.94},trunk:{color:'#625445',roughness:1},
 leaf:{color:'#547348',roughness:1},hedge:{color:'#425e38',roughness:1},hill:{color:'#73885a',roughness:1},
 navy:{color:'#173653',roughness:.95},red:{color:'#b52738',roughness:.95},white:{color:'#f3eddf',roughness:.95},
 limestone:{color:'#999480',roughness:1},clock:{color:'#efe8d7',roughness:.9},hand:{color:'#24323a',roughness:.95},
 wool:{color:'#ece8d5',roughness:1},black:{color:'#292b28',roughness:.95},ridge:{color:'#6d8059',roughness:1},brick:{color:'#9a6550',roughness:1},
};
const recipes=new WeakMap();
export function britishScenery(samples,{profile='legacy'}={}){
 const cached=recipes.get(samples)?.get(profile);if(cached)return cached;
 const rich=profile==='cotswold-rich-v2';
 const layout=sceneryLayout(samples),terrain=regionalTerrain(samples),groups=[];
 const parts=italianScenery(samples).parts.filter(p=>p.category.startsWith('italy-viaduct')).map(p=>({...p,category:p.category.replace('italy','britain')}));
 const add=(m,kind,p,size,material,category,rotation=[0,0,0])=>parts.push({kind,size,material,category,matrix:m.clone().multiply(pose(p,rotation)).elements});
 const box=(m,p,size,material,category='britain-building',rotation)=>add(m,'box',p,size,material,category,rotation);
 const cylinder=(m,p,top,bottom,h,material,category,sides=10)=>add(m,'cylinder',p,[top,bottom,h,sides],material,category);
 const tree=(m,x,z,h)=>{cylinder(m,[x,h*.25,z],.16,.25,h*.5,'trunk','britain-tree-trunk');
  if(rich){for(const [dx,dy,dz,k]of [[0,.68,0,1],[-.22,.61,.08,.72],[.22,.65,-.08,.78]])add(m,'sphere',[x+dx*h,h*dy,z+dz*h],[h*.3*k,h*.27*k,h*.3*k],'leaf','britain-tree-crown');}
  else{cylinder(m,[x,h*.63,z],h*.22,h*.32,h*.5,'leaf','britain-tree-crown',9);cylinder(m,[x,h*.88,z],.15,h*.24,h*.35,'leaf','britain-tree-crown',9);}};
 const cottage=(m,x,z,i)=>{
  const w=4.4,d=5,h=3.6+(i%2)*.45;box(m,[x,h/2,z],[w,h,d],'sandstone');
  for(const side of [-1,1])box(m,[x+side*1.15,h+.7,z],[2.8,.23,5.5],'roof','britain-roof',[0,0,-side*.52]);
  box(m,[x-1.3,h+1.1,z-.9],[.7,1.6,.65],'sandstone','britain-chimney');
  for(const xx of [-1.25,1.25])for(const yy of [1.1,2.7]){
   box(m,[x+xx,yy,z+d/2+.06],[.9,.9,.1],'white','britain-window-trim');
   box(m,[x+xx,yy,z+d/2+.12],[.66,.65,.05],'glass','britain-window');
  }box(m,[x,.85,z+d/2+.13],[.75,1.7,.1],'door','britain-door');
 };
 const clear=(x,z,r)=>samples.every(s=>Math.hypot(s.p[0]-x,s.p[2]-z)>r+(s.w??3.2));
 const towns=[...layout.props.filter((b,i)=>i%3===0&&clear(b.x,b.z,b.scale*16+12)),...layout.ring.filter((b,i)=>i%5===0&&clear(b.x,b.z,b.scale*16+12))];
 towns.forEach((b,i)=>{
  const y=terrain.heightAt(b.x,b.z)+b.scale,m=pose([b.x,y,b.z],[0,b.rotY,0],b.scale);
  groups.push({x:b.x,y,z:b.z,kind:'cotswold-village'});
  box(m,[0,-1.1,0],[17,2.4,15],'stone','britain-village-foundation');
  for(let k=0;k<3;k++)cottage(m,(k-1)*5.1,-2,i+k);
  for(const x of [-7.6,7.6])box(m,[x,.55,3.5],[.55,1.1,6.2],'stone','britain-dry-stone-wall');
  box(m,[0,.8,6.1],[13,1.6,1.1],'hedge','britain-hedge');tree(m,-6.4,3.3,6.5);
  if(i%3===0){
   box(m,[5.3,4.1,3.4],[2.5,8.2,2.5],'sandstone','britain-clock-tower');
   box(m,[5.3,8.35,3.4],[3,.5,3],'stone','britain-tower-crown');
   box(m,[5.3,6.6,4.69],[1.5,1.5,.1],'clock','britain-clock');
   box(m,[5.3,6.85,4.76],[.09,.65,.04],'hand','britain-clock-hand');
   box(m,[5.55,6.6,4.77],[.6,.09,.04],'hand','britain-clock-hand');
  }
 });
 // Short separated field boundaries and broadleaf trees leave clear road/camera margins.
 for(let i=24;i<samples.length-24;i+=36){const s=samples[i];for(const side of [-1,1]){
  const offset=20+(i%5)*3,x=s.p[0]+s.r[0]*side*offset,z=s.p[2]+s.r[2]*side*offset;
  if(!clear(x,z,12)||towns.some(b=>Math.hypot(b.x-x,b.z-z)<b.scale*21))continue;
  const m=pose([x,terrain.heightAt(x,z),z],[0,Math.atan2(s.t[0],s.t[2]),0]);
  tree(m,0,0,7+(i%4));box(m,[4,.65,0],[6,1.3,.7],'stone','britain-field-wall');
 }}
 if(rich){
  // Rich country scenery extends the existing villages rather than replacing
  // the accepted circuit. Opaque geometry is shared with camera visibility.
  // Close race cameras see the verge, not distant farms. Dress the actual
  // grounded shoulders as well, leaving both the road and its dry bypass free.
  for(let i=40;i<samples.length-40;i+=16){const s=samples[i];for(const side of [-1,1]){
   const offset=6.8+(Math.floor(i/16)%3)*.45,x=s.p[0]+s.r[0]*side*offset,z=s.p[2]+s.r[2]*side*offset;
   if(!clear(x,z,2.3))continue;
   const m=pose([x,terrain.heightAt(x,z)+.04,z],[0,Math.atan2(s.t[0],s.t[2]),0]);
   const k=Math.floor(i/16);
   if(k%9!==0){
    if(k%3){box(m,[0,.72,0],[.62,1.44,4.8],'stone','britain-roadside-stone');box(m,[0,1.48,0],[.75,.14,4.9],'limestone','britain-roadside-coping');}
    else for(const dz of [-1.6,0,1.6])add(m,'sphere',[0,1,dz],[.85,1.05,1.1],'hedge','britain-roadside-hedge');
   }
   if(k%5===(side>0?0:2)){
    const tx=s.p[0]+s.r[0]*side*10.5,tz=s.p[2]+s.r[2]*side*10.5;
    if(clear(tx,tz,4))tree(pose([tx,terrain.heightAt(tx,tz),tz]),0,0,6.5+k%3);
   }
  }}
  const relief=regionalRelief(samples);
  const wall=(m,x,z,length)=>{for(let k=0;k<Math.floor(length/1.2);k++){const xx=x+k*1.2;box(m,[xx,.5,z],[1.14,1,.55],'stone','britain-stone-boundary');box(m,[xx,.99,z],[1.18,.15,.66],'limestone','britain-wall-coping');}};
  relief.plots.filter((_,i)=>i%2===0).forEach((p,i)=>{
   if(!clear(p.x,p.z,12))return;
   const y=terrain.heightAt(p.x,p.z)+.35,m=pose([p.x,y,p.z],[0,p.rotY,0]);groups.push({x:p.x,y,z:p.z,kind:'british-farm'});
   box(m,[0,-.7,0],[12,1.5,10],'stone','britain-farm-foundation');cottage(m,-2,-1,i);
   box(m,[3.6,1.5,-1],[3.6,3,4.4],'brick','britain-barn');
   for(const side of [-1,1])box(m,[3.6+side*.92,3.45,-1],[2.3,.2,4.8],'roof','britain-barn-roof',[0,0,-side*.45]);
   wall(m,-5.8,4.3,10);tree(m,-5,-3.7,6.2+i%3);
   for(let k=0;k<3;k++){
    const x=1.5+k*1.35,z=2.1+(k%2)*.5;
    add(m,'sphere',[x,.5,z],[.48,.34,.31],'wool','britain-sheep-body');add(m,'sphere',[x+.43,.58,z],[.17,.19,.15],'black','britain-sheep-head');
    for(const dx of [-.25,.25])for(const dz of [-.16,.16])box(m,[x+dx,.2,z+dz],[.07,.4,.07],'black','britain-sheep-leg');
   }
   if(i%4===0){box(m,[-2,2.65,1.3],[2,.44,.08],'navy','britain-pub-sign');for(let k=0;k<4;k++)box(m,[-4.5+k*.5,.2,3],[.32,.4,.32],k%2?'red':'navy','britain-spectator');}
  });
  for(let i=0;i<18;i++){
   const angle=i/18*Math.PI*2,radius=65+i%4*14;
   let x=layout.cx+Math.cos(angle)*(layout.rx+185),z=layout.cz+Math.sin(angle)*(layout.rz+185);
   for(let k=0;k<12&&!clear(x,z,radius+10);k++){x=layout.cx+(x-layout.cx)*1.07;z=layout.cz+(z-layout.cz)*1.07;}
   if(!clear(x,z,radius+10))continue;
   const m=pose([x,terrain.heightAt(x,z)-1,z],[0,angle,0]);add(m,'hill',[0,0,0],[radius,25+i%5*7,radius*.85],'ridge','britain-rolling-hill');
  }
 }
 const result={parts,groups,groundY:terrain.ground};if(!recipes.has(samples))recipes.set(samples,new Map());recipes.get(samples).set(profile,result);return result;
}
