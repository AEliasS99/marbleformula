// Existing Sydney landmarks, shared verbatim between picture and camera QA.
// Yachts sit on grounded boatyard cradles, not at the elevated road's height.
import {BoxGeometry,ConeGeometry,TorusGeometry,Euler,Matrix4,Quaternion,Vector3} from 'three';
import {sceneryLayout} from './scenery-layout.js';
const pose=(p,r=[0,0,0],s=[1,1,1])=>new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(...s));
export const SYDNEY_MATERIALS={
 pier:{color:'#2a4858',roughness:.8},stone:{color:'#d8cfc4',roughness:.75},
 opera:{color:'#f7fbff',emissive:'#bfefff',emissiveIntensity:.35,roughness:.28,metalness:.15,side:2},
 steel:{color:'#4a6274',metalness:.85,roughness:.3},pylon:{color:'#c8c2b8',roughness:.75},
 neon:{color:'#00f5d4',intensity:3.4,basic:true},hull:{color:'#ffffff',roughness:.3},
 sailTeal:{color:'#ffffff',emissive:'#00f5d4',emissiveIntensity:.6,roughness:.35},
 sailGold:{color:'#ffffff',emissive:'#ffcd00',emissiveIntensity:.6,roughness:.35},
 timber:{color:'#6e5140',roughness:.9},quay:{color:'#62747c',roughness:.88},
};
export const sydneyGeometry=p=>p.kind==='box'?new BoxGeometry(...p.size):p.kind==='cone'?new ConeGeometry(...p.size):new TorusGeometry(...p.size);
export function sydneyScenery(samples){
 const layout=sceneryLayout(samples),parts=[];
 const add=(m,kind,pos,size,material,category,rot=[0,0,0],scale=[1,1,1])=>parts.push({kind,size,material,category,matrix:m.clone().multiply(pose(pos,rot,scale)).elements});
 layout.ring.forEach((p,i)=>{
  const m=pose([p.x,p.y,p.z],[0,p.rotY,0]),h=Math.max(1,p.y-p.groundY);
  if(i%2===0){
   add(m,'box',[0,-h/2,0],[14*p.scale,h,10*p.scale],'pier','sydney-pier');
   const a=m.clone().multiply(pose([0,0,0],[0,0,0],Array(3).fill(p.scale*1.1)));
   add(a,'box',[0,.8,0],[16,1.6,10],'stone','sydney-opera-base');
   [-4,0,4].forEach((x,k)=>{
    const b=a.clone().multiply(pose([x,1.6,0],[0,0,-.18+k*.06]));
    add(b,'cone',[0,4.8+k,0],[4.2,8.2+k*1.2,5,1,false,0,Math.PI],'opera','sydney-opera-sail',[.28,0,0],[.65,1.35,1]);
   });
  }else{
   const a=m.clone().multiply(pose([0,0,0],[0,0,0],Array(3).fill(p.scale*1.05)));
   add(a,'torus',[0,1.5,0],[12,.75,8,32,Math.PI],'steel','sydney-bridge-arch');
   add(a,'torus',[0,1.5,0],[11.3,.22,8,32,Math.PI],'neon','sydney-bridge-light');
   // Pylons sit outside the old central pedestal. Extend their actual feet
   // to ground instead of leaving two floating columns beside an empty plinth.
   const depth=(p.y-p.groundY)/(p.scale*1.05);
   for(const x of [-12,12])add(a,'box',[x,(11-depth)/2,0],[2.4,11+depth,3.2],'pylon','sydney-bridge-pylon');
   add(a,'box',[0,1.2,0],[24,.6,2.6],'steel','sydney-bridge-deck');
  }
 });
 layout.props.forEach((p,i)=>{
  const m=pose([p.x,p.groundY,p.z],[0,p.rotY,0],Array(3).fill(p.scale));
  add(m,'box',[0,.075,0],[3.4,.15,6.4],'quay','sydney-boatyard-pad');
  for(const z of [-1.7,1.7])add(m,'box',[0,.275,z],[2.6,.25,.45],'timber','sydney-yacht-cradle');
  add(m,'box',[0,1,0],[2.2,1.2,5.4],'hull','sydney-yacht-hull');
  add(m,'cone',[0,4.8,0],[1.8,6.8,3],'sail'+(i%2===0?'Teal':'Gold'),'sydney-yacht-sail');
 });
 return {parts,groundY:layout.groundY,yachts:layout.props.length};
}
