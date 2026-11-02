// Regional assets reuse the established grounded terrain and merged meshes.
// Every opaque part is also consumed by the real camera-occlusion model.
import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {sceneryLayout} from './scenery-layout.js';
import {italianTerrain as regionalTerrain} from './italy-terrain.js';
import {italianScenery} from './italy-scenery.js';
const pose=(p,r=[0,0,0],s=1)=>new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(s,s,s));
export const GERMANY_MATERIALS={
 plaster:{color:'#e5dfcc',roughness:.93},timber:{color:'#4c3b31',roughness:.96},
 roof:{color:'#554f4d',roughness:.94},stone:{color:'#a19983',roughness:.98},
 glass:{color:'#73919a',roughness:.35,metalness:.08},pine:{color:'#294d3d',roughness:.98},
 trunk:{color:'#625044',roughness:1},hill:{color:'#677f59',roughness:1},
 black:{color:'#191a1a',roughness:.92},red:{color:'#d62228',roughness:.9},gold:{color:'#f1c545',roughness:.9},
 limestone:{color:'#a19983',roughness:.98},
};
export function germanScenery(samples){
 const layout=sceneryLayout(samples),terrain=regionalTerrain(samples),groups=[];
 // Keep the corrected, bank-aligned grounded supports; do not reintroduce the
 // reflective studio poles that spoiled older finish shots.
 const parts=italianScenery(samples).parts.filter(p=>p.category.startsWith('italy-viaduct')).map(p=>({...p,category:p.category.replace('italy','germany')}));
 const add=(m,kind,p,size,material,category,rotation=[0,0,0])=>parts.push({kind,size,material,category,matrix:m.clone().multiply(pose(p,rotation)).elements});
 const box=(m,p,size,material,category='germany-building',rotation)=>add(m,'box',p,size,material,category,rotation);
 const cylinder=(m,p,top,bottom,h,material,category,sides=10)=>add(m,'cylinder',p,[top,bottom,h,sides],material,category);
 const pine=(m,x,z,h)=>{
  cylinder(m,[x,h*.18,z],.12,.22,h*.36,'trunk','germany-tree-trunk');
  for(let k=0;k<3;k++)cylinder(m,[x,h*(.40+k*.19),z],.04,h*(.22-k*.04),h*.48,'pine','germany-pine',9);
 };
 const house=(m,x,z,i)=>{
  const w=4.2,d=4.8,h=4.8+(i%2)*.6;
  box(m,[x,h/2,z],[w,h,d],'plaster');
  box(m,[x,.20,z],[w+.22,.4,d+.22],'stone','germany-plinth');
  for(const side of [-1,1])box(m,[x+side*1.17,h+.75,z],[2.75,.22,5.35],'roof','germany-roof',[0,0,-side*.52]);
  // Half-timbered frontage with inset windows, visible roof ridge and chimney.
  for(const xx of [-1.9,0,1.9])box(m,[x+xx,h*.5,z+d/2+.055],[.15,h,.14],'timber','germany-timber');
  for(const yy of [.55,2.4,h-.08])box(m,[x,yy,z+d/2+.07],[w,.16,.14],'timber','germany-timber');
  for(const side of [-1,1])box(m,[x+side*.95,1.45,z+d/2+.07],[.13,2.2,.14],'timber','germany-timber',[0,0,side*.70]);
  for(const xx of [-1,1])for(const yy of [1.35,3.5])box(m,[x+xx,yy,z+d/2+.15],[.65,.85,.07],'glass','germany-window');
  box(m,[x,.95,z+d/2+.18],[.7,1.8,.12],'timber','germany-door');
  box(m,[x+1.1,h+1.1,z-1.25],[.55,1.5,.55],'stone','germany-chimney');
 };
 const clear=(x,z,r)=>samples.every(s=>Math.hypot(s.p[0]-x,s.p[2]-z)>r+(s.w??3.2));
 const towns=[...layout.props.filter((b,i)=>i%3===0&&clear(b.x,b.z,b.scale*15+12)),...layout.ring.filter((b,i)=>i%4===0&&clear(b.x,b.z,b.scale*15+12))];
 towns.forEach((b,i)=>{
  const y=terrain.heightAt(b.x,b.z)+1.4*b.scale,m=pose([b.x,y,b.z],[0,b.rotY,0],b.scale);
  groups.push({x:b.x,y,z:b.z,kind:'black-forest-village'});
  box(m,[0,-1.6,0],[15,3.4,13],'stone','germany-village-foundation');
  for(let k=0;k<3;k++)house(m,(k-1)*4.6,-1,i+k);
  cylinder(m,[5.8,2.5,4.7],.045,.07,5,'timber','germany-flag-pole');
  for(const[k,material]of ['black','red','gold'].entries())box(m,[6.6,4.6-k*.38,4.7],[1.5,.38,.04],material,'germany-flag');
  pine(m,-6,4.6,8.5);pine(m,2,5.8,7);
 });
 // Dense local stands frame the road while allowing clear action cameras.
 for(let i=20;i<samples.length-20;i+=42){const s=samples[i];for(const side of [-1,1]){
  const offset=18+(i%4)*4,x=s.p[0]+s.r[0]*side*offset,z=s.p[2]+s.r[2]*side*offset;
  if(!clear(x,z,10)||towns.some(b=>Math.hypot(b.x-x,b.z-z)<b.scale*20))continue;
  const m=pose([x,terrain.heightAt(x,z),z]);pine(m,0,0,7+(i%5));
 }}
 return {parts,groups,groundY:terrain.ground};
}
