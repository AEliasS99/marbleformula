import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {italianTerrain} from './italy-terrain.js';
import {jaipurLayout} from './jaipur-layout.js';
import {jaipurDetail} from './jaipur-detail.js';
// Reuse the established terrain, placement and merged-mesh infrastructure;
// architecture and palette are specifically Jaipur/Rajasthan inspired.
export const JAIPUR_PROFILE='jaipur-venue-v1';
export const JAIPUR_TERRAIN=JAIPUR_PROFILE;
export const JAIPUR_MATERIALS={
 pink:{color:'#c87b69',roughness:.94},rose:{color:'#d79783',roughness:.93},
 sandstone:{color:'#cbaa79',roughness:.96},cream:{color:'#eadac0',roughness:.92},
 wood:{color:'#70503b',roughness:.88},brass:{color:'#aa8247',roughness:.42,metalness:.7},
 dark:{color:'#3f4845',roughness:.85},glass:{color:'#557477',roughness:.34,metalness:.12},
 saffron:{color:'#d68b39',roughness:.94},teal:{color:'#3e7d79',roughness:.88},
 leaf:{color:'#69744b',roughness:1},flower:{color:'#b24f78',roughness:1},
 soil:{color:'#af9168',roughness:1},hill:{color:'#a39a73',roughness:1},
 terracotta:{color:'#a95337',roughness:.92},canvas:{color:'#e9d5af',roughness:1},
 'textile-red':{color:'#903d46',roughness:1},'spice-gold':{color:'#c79b36',roughness:1},
 'spice-red':{color:'#9f4932',roughness:1},'spice-olive':{color:'#7b7944',roughness:1},
 lantern:{color:'#edd6a4',roughness:.6,emissive:'#d49a52',emissiveIntensity:.2},
 rock:{color:'#9e8767',roughness:.98},ridge:{color:'#9b9173',roughness:1},
};
const pose=(p,r=[0,0,0])=>new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(1,1,1));
const cache=new WeakMap();
export function jaipurScenery(samples,{length}={}){
 if(!(length>0&&Number.isFinite(length)))throw Error('Jaipur scenery needs actual course length');
 if(cache.get(samples)?.length===length)return cache.get(samples).recipe;
 const terrain=italianTerrain(samples,{profile:JAIPUR_TERRAIN,length}),layout=jaipurLayout(samples),parts=[],groups=[];
 const add=(m,kind,p,size,material,category,rot=[0,0,0])=>parts.push({kind,size,material,category:'india-'+category,matrix:m.clone().multiply(pose(p,rot)).elements});
 const box=(m,p,size,mat,category,rot)=>add(m,'box',p,size,mat,category,rot);
 const cyl=(m,p,r,h,mat,category)=>add(m,'cylinder',p,[r,r,h,16],mat,category);
 const arch=(m,x,y,z,w,h,category)=>add(m,'arch',[x,y,z],[w,h,.24,.17],'cream',category);
 const jali=(m,x,y,z,w,h)=>{
  box(m,[x,y,z],[w,h,.09],'dark','jali-recess');
  for(let k=0;k<5;k++)box(m,[x-w/2+(k+.5)*w/5,y,z+.075],[.055,h,.07],'cream','jali-vertical');
  for(let k=0;k<5;k++)box(m,[x,y-h/2+(k+.5)*h/5,z+.08],[w,.055,.08],'cream','jali-horizontal');
 };
 const pavilion=(m,x,y,z,r=1)=>{
  cyl(m,[x,y+.12,z],r+.22,.24,'cream','chhatri-base');
  for(let k=0;k<6;k++){const a=k*Math.PI/3;cyl(m,[x+Math.cos(a)*r*.8,y+1.15,z+Math.sin(a)*r*.8],.095,2,'cream','chhatri-column');}
  cyl(m,[x,y+2.22,z],r+.22,.2,'cream','chhatri-cornice');
  add(m,'dome',[x,y+2.32,z],[r+.2,r*.7,24],'pink','chhatri-dome');
  cyl(m,[x,y+2.32+r*.7+.16,z],.06,.32,'brass','finial');
 };
 const facade=(m,x,z,w=6,h=5.5,levels=2)=>{
  box(m,[x,h/2,z],[w,h,5],'pink','building');
  box(m,[x,.3,z],[w+.25,.6,5.25],'sandstone','plinth');
  for(let level=0;level<levels;level++){
   const y=1.4+level*2.5;
   for(let k=0;k<3;k++){
    const xx=x+(k-1)*w*.28;jali(m,xx,y,z+2.58,1.05,1.3);arch(m,xx,y-.7,z+2.66,1.35,1.8,'jharokha-arch');
    box(m,[xx,y-.82,z+2.77],[1.5,.14,.6],'cream','balcony-sill');
   }
   box(m,[x,y+1.15,z+2.7],[w+.5,.17,.65],'cream','chajja');
  }
  for(const xx of [-w/2,w/2])box(m,[x+xx,h/2,z+2.62],[.22,h,.22],'cream','pilaster');
  box(m,[x,h+.12,z],[w+.4,.24,5.4],'cream','roof-parapet');
  for(let k=0;k<8;k++)box(m,[x-w/2+k*w/7,h+.48,z+2.6],[.27,.5,.32],'rose','crenellation');
 };
 for(const [index,site]of layout.sites.entries()){
  const {x,z,rotY,halfX,halfZ,kind}=site;
  const cornerY=[[-halfX,-halfZ],[-halfX,halfZ],[halfX,-halfZ],[halfX,halfZ]].map(([dx,dz])=>terrain.heightAt(x+Math.cos(rotY)*dx+Math.sin(rotY)*dz,z-Math.sin(rotY)*dx+Math.cos(rotY)*dz));
  const floor=Math.max(terrain.heightAt(x,z),...cornerY)+.13,bottom=Math.min(...cornerY)-.35,m=pose([x,floor,z],[0,rotY,0]);
  groups.push({...site,y:floor,kind:'jaipur-'+kind});
  box(m,[0,(bottom-floor)/2,0],[2*halfX,floor-bottom,2*halfZ],'sandstone','graded-foundation');
  // Closely fitted paving, rather than a painted rectangle over the terrain.
  for(let xx=-halfX+1;xx<halfX;xx+=2)for(let zz=-halfZ+1;zz<halfZ;zz+=2)box(m,[xx,.025,zz],[1.97,.05,1.97],(Math.round(xx+zz)+index)%3?'sandstone':'cream','courtyard-paver');
  if(kind==='castle'||kind==='abbey'){
   for(let j=0;j<5;j++)facade(m,(j-2)*5.8,-3,5.8,8.2,3);
   for(const xx of [-14,0,14])pavilion(m,xx,8.4,-3,1.2);
   for(const xx of [-12,12]){cyl(m,[xx,4.7,5],1.5,9.4,'sandstone','fort-tower');pavilion(m,xx,9.4,5,1.6);}
   arch(m,0,0,5.5,5,6,'palace-gateway');
   for(let j=0;j<5;j++)box(m,[0,.12+j*.14,7+j*.48],[7-j*.6,.24,.5],'cream','palace-step');
  }else if(kind==='village'){
   for(let j=0;j<5;j++)facade(m,(j%3-1)*8,j<3?-5:5,6,5.6+(j%2)*2.5,j%2?3:2);
   for(let j=0;j<4;j++){
    const xx=-10+j*6;box(m,[xx,2,9],[4,.12,2.8],j%2?'teal':'saffron','market-canopy');
    for(const dx of [-1.8,1.8])box(m,[xx+dx,1,10],[.1,2,.1],'wood','market-post');
    box(m,[xx,.65,9],[3.6,1.3,1.4],'wood','market-counter');
   }
  }else{
   for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const xx=-7+col*4.5,zz=-5+row*5;
    box(m,[xx,.18,zz],[3.7,.36,3.4],'sandstone','garden-bed');
    cyl(m,[xx,1.8,zz],.13,3.6,'wood','tree-trunk');
    for(let k=0;k<3;k++)add(m,'canopy',[xx+Math.cos(k*2.1)*.6,3.6+(k%2)*.4,zz+Math.sin(k*2.1)*.6],[1.2,1.15,1.2,index+k],'leaf','garden-canopy');
    for(let k=0;k<3;k++)add(m,'canopy',[xx-1+k,.65,zz+1.2],[.45,.3,.4,k],'flower','flowers');
   }
   pavilion(m,0,0,0,1.25);
  }
 }
 jaipurDetail(parts,groups,samples,terrain,layout);
 const recipe={parts,groups,profile:JAIPUR_PROFILE,length,waterPlanes:0};cache.set(samples,{length,recipe});return recipe;
}
