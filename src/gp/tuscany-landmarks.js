import {Matrix4,Quaternion,Euler,Vector3} from 'three';
import {tuscanLandscape} from './tuscany-landscape.js';
const pose=(x,y,z,yaw=0)=>new Matrix4().compose(new Vector3(x,y,z),new Quaternion().setFromEuler(new Euler(0,yaw,0)),new Vector3(1,1,1));

// Country identity extends the existing venue. Focal buildings use the same
// admitted land plan, opaque parts and triangles as the camera director.
export function appendTuscanLandmarks({samples,terrain,parts,groups}){
 const plan=tuscanLandscape(samples);
 const add=(m,kind,p,size,material,category,rot=[0,0,0])=>parts.push({kind,size,material,category:'italy-landmark-'+category,matrix:m.clone().multiply(new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...rot)),new Vector3(1,1,1))).elements});
 const box=(m,p,size,material,category,rot)=>add(m,'box',p,size,material,category,rot);
 const cyl=(m,p,r,h,material,category,sides=24)=>add(m,'cylinder',p,[r,r,h,sides],material,category);
 const beam=(m,a,b,r,material,category)=>{
  const va=new Vector3(...a),vb=new Vector3(...b),delta=vb.clone().sub(va),mid=va.add(vb).multiplyScalar(.5),q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.clone().normalize());
  parts.push({kind:'cylinder',size:[r,r,delta.length(),10],material,category:'italy-landmark-'+category,matrix:m.clone().multiply(new Matrix4().compose(mid,q,new Vector3(1,1,1))).elements});
 };
 const clock=(m,y,z)=>{
  for(const [r,dz,material]of [[.73,0,'brass'],[.65,.045,'cream']])add(m,'cylinder',[0,y,z+dz],[r,r,.07,32],material,'clock',[Math.PI/2,0,0]);
  for(let k=0;k<12;k++){const a=k*Math.PI/6;box(m,[Math.sin(a)*.52,y+Math.cos(a)*.52,z+.095],[.055,k%3===0?.15:.09,.025],'iron','clock-index',[0,0,-a]);}
  box(m,[.13,y+.15,z+.13],[.055,.40,.04],'iron','clock-hand',[0,0,-.62]);
  box(m,[-.16,y+.05,z+.16],[.38,.05,.04],'iron','clock-hand',[0,0,-.30]);
 };
 const belfry=(m,x,z,h=12)=>{
  const t=m.clone().multiply(pose(x,0,z));
  box(t,[0,(h-3)/2,0],[2.55,h-3,2.55],'limestone','tower-shaft');
  for(const y of [.3,3.1,6.3,h-3.1,h-.1])box(t,[0,y,0],[2.85,.20,2.85],'cream','tower-cornice');
  for(const dx of [-1,1])for(const dz of [-1,1])box(t,[dx*1.16,(h-3)/2,dz*1.16],[.25,h-3,.25],'cream','tower-quoin');
  for(let f=0;f<4;f++){
   const face=t.clone().multiply(pose(0,0,0,f*Math.PI/2));
   add(face,'arch',[0,h-3,1.16],[2.45,2.75,.24,.25],'marbleStone','belfry-arch');clock(face,h-4.6,1.29);
  }
  box(t,[0,h-.75,0],[2.35,.16,.18],'wood','bell-yoke');
  add(t,'cylinder',[0,h-1.55,0],[.25,.56,.78,24],'brass','bell');
  add(t,'sphere',[0,h-2.05,0],[.12,.14,.12],'iron','bell-clapper');
  for(const side of [-1,1])box(t,[side*.76,h+.43,0],[1.95,.17,3.15],'roof','tower-roof',[0,0,-side*.42]);
  for(let k=0;k<12;k++)add(t,'cylinder',[0,h+.86,-1.43+k*.26],[.10,.10,.28,10],'tile','tower-ridge',[Math.PI/2,0,0]);
 };
 const arcade=(m,width,depth)=>{
  const bays=4,step=width/bays;
  for(const z of [-depth/2,depth/2]){
   for(let k=0;k<bays;k++)add(m,'arch',[-width/2+step*(k+.5),.18,z],[step,3.3,.38,.30],'marbleStone','loggia-arch');
   box(m,[0,3.52,z],[width+.30,.26,.64],'cream','loggia-cornice');
   for(let k=0;k<=bays;k++){
    const x=-width/2+step*k;cyl(m,[x,1.26,z],.16,2.16,'marbleStone','loggia-column');
    for(const y of [.20,2.32])box(m,[x,y,z],[.48,.15,.48],'limestone','loggia-capital');
   }
  }
  for(const x of [-width/2,width/2])for(const z of [-depth/2,depth/2])box(m,[x,1.7,z],[.45,3.4,.45],'limestone','loggia-pier');
  for(const side of [-1,1]){
   const rm=m.clone().multiply(pose(0,3.98,side*depth*.27)).multiply(new Matrix4().makeRotationX(side*.24));
   box(rm,[0,0,0],[width+.75,.16,depth*.57],'roof','loggia-roof');
   for(let x=-width/2;x<width/2;x+=.36)for(let z=-depth*.26;z<depth*.26;z+=.58)add(rm,'cylinder',[x,.095,z],[.075,.075,.60,8],'tile','loggia-roof-tile',[Math.PI/2,0,0]);
  }
 };
 const cathedral=m=>{
  // Florence-inspired miniature: green/cream marble courses, rose window,
  // terracotta octagonal cupola, raised ribs and an articulated lantern.
  box(m,[0,2.65,-1.3],[6.7,5.3,8.0],'marbleStone','cathedral-nave');
  for(const y of [.35,1.4,2.8,4.3,5.2])box(m,[0,y,-1.3],[6.84,.13,8.14],'verdeStone','cathedral-course');
  for(const x of [-3.2,-1.5,1.5,3.2])box(m,[x,2.65,2.78],[.20,5.3,.17],'cream','cathedral-pilaster');
  for(const x of [-1.85,0,1.85]){
   box(m,[x,1.25,2.79],[1.15,2.3,.11],'wood','cathedral-door');
   add(m,'arch',[x,.1,2.95],[1.55,2.8,.30,.22],'verdeStone','cathedral-portal');
  }
  add(m,'cylinder',[0,4.05,2.88],[.70,.70,.08,32],'verdeStone','rose-rim',[Math.PI/2,0,0]);
  add(m,'cylinder',[0,4.05,2.95],[.56,.56,.08,32],'glass','rose-glass',[Math.PI/2,0,0]);
  for(let k=0;k<8;k++)beam(m,[0,4.05,3.02],[Math.sin(k*Math.PI/4)*.54,4.05+Math.cos(k*Math.PI/4)*.54,3.02],.025,'cream','rose-tracery');
  for(const side of [-1,1])box(m,[side*1.76,5.69,-1.3],[3.75,.18,8.45],'roof','nave-roof',[0,0,-side*.22]);
  cyl(m,[0,6.06,-1.8],3.05,1.3,'marbleStone','cupola-drum',8);
  for(let k=0;k<8;k++){
   const a=(k+.5)*Math.PI/4,face=m.clone().multiply(pose(Math.sin(a)*2.84,0,-1.8+Math.cos(a)*2.84,a));
   add(face,'cylinder',[0,6.12,.06],[.29,.29,.055,16],'verdeStone','drum-window',[Math.PI/2,0,0]);
  }
  add(m,'dome',[0,6.72,-1.8],[3.24,4.45,8],'roof','cupola');
  const profile=[[1,0],[.98,.18],[.86,.48],[.62,.78],[.30,.95],[0,1]];
  for(let k=0;k<8;k++)for(let j=1;j<profile.length;j++){
   const a=k*Math.PI/4,point=([r,y])=>[Math.sin(a)*r*3.27,6.74+y*4.45,-1.8+Math.cos(a)*r*3.27];beam(m,point(profile[j-1]),point(profile[j]),.055,'cream','cupola-rib');
  }
  cyl(m,[0,11.33,-1.8],.46,.30,'cream','lantern-base',8);
  for(let k=0;k<8;k++)cyl(m,[Math.sin(k*Math.PI/4)*.37,11.90,-1.8+Math.cos(k*Math.PI/4)*.37],.045,.90,'marbleStone','lantern-column',10);
  add(m,'dome',[0,12.35,-1.8],[.57,.72,8],'cream','lantern-crown');
  cyl(m,[0,13.15,-1.8],.055,.38,'brass','lantern-finial',12);belfry(m,-5.2,-2.5,11.4);
 };
 for(const site of plan.landmarks){
  const y=terrain.heightAt(site.x,site.z),m=pose(site.x,y,site.z,site.rotY);groups.push({...site,y,kind:'tuscan-landmark',landmark:site.kind});
  // Terrain is graded by this same footprint. Small per-tile footings close
  // the triangulation gap without a tall raised catalogue plinth.
  for(let x=-site.halfX+.35;x<site.halfX;x+=.70)for(let z=-site.halfZ+.35;z<site.halfZ;z+=.70){
   const q=new Vector3(x,0,z).applyMatrix4(m),ground=terrain.heightAt(q.x,q.z),top=y+.09,h=top-ground;
   if(h>0)box(m,[x,(ground-y+top-y)/2,z],[.685,h,.685],(Math.round(x/.7)+Math.round(z/.7))%4?'paving':'limestone','piazza-paver');
  }
  if(site.kind==='cathedral')cathedral(m);
  else{
   arcade(m.clone().multiply(pose(0,0,-2)),11.8,3.6);belfry(m,-4.7,-1.9,12.2);
   // A dry carved fountain has a genuinely hollow basin. No transparent
   // water sheet or overlapping ground plane is introduced.
   add(m,'basin',[1.4,.15,3.2],[1.35,.65,32],'marbleStone','fountain-basin');
   cyl(m,[1.4,1.0,3.2],.15,1.25,'limestone','fountain-stem');
   add(m,'basin',[1.4,1.55,3.2],[.66,.30,32],'marbleStone','fountain-upper');
   add(m,'sphere',[1.4,2.05,3.2],[.14,.18,.14],'brass','fountain-finial');
   for(const x of [-4.8,4.8]){
    box(m,[x,.61,3.8],[2.3,.16,.48],'wood','piazza-bench');
    for(const dx of [-.85,.85])box(m,[x+dx,.31,3.8],[.12,.62,.40],'iron','bench-leg');
    box(m,[x,.98,4.0],[2.3,.46,.08],'wood','bench-back');
   }
  }
  for(const side of [-1,1]){
   const x=side*(site.halfX-.8),z=site.halfZ-1.0;cyl(m,[x,1.7,z],.055,3.4,'iron','streetlamp');
   box(m,[x,3.25,z],[.34,.5,.34],'brass','lamp-housing');box(m,[x,3.55,z],[.48,.12,.48],'iron','lamp-cap');
   add(m,'cylinder',[x-side*.65,.34,z],[.34,.24,.68,16],'terracotta','piazza-planter');
   for(let k=0;k<4;k++)add(m,'canopy',[x-side*.65+Math.sin(k*1.7)*.15,.85,z+Math.cos(k*1.7)*.15],[.25,.32,.25,k],'oliveLeaf','planter-leaves');
  }
 }
}
