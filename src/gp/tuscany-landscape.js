import {Matrix4,Euler,Quaternion,Vector3} from 'three';
import {sceneryPartGeometry} from './scenery-mesh.js';
import {tuscanSettlementSites} from './tuscany-sites.js';
const cache=new WeakMap();
const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const pose=(x,y,z,yaw=0)=>new Matrix4().compose(new Vector3(x,y,z),new Quaternion().setFromEuler(new Euler(0,yaw,0)),new Vector3(1,1,1));
// Sample the exact transformed triangles used by renderer and camera rays.
// A spatial grid keeps tree placement bounded without approximating hill height.
export function landscapeSurface(hills,terrain){
 const cells=new Map(),cell=24,key=(x,z)=>x+','+z;
 for(const hill of hills){
  const g=sceneryPartGeometry(hill).applyMatrix4(new Matrix4().fromArray(hill.matrix)),p=g.getAttribute('position'),index=g.index;
  for(let i=0;i<(index?index.count:p.count);i+=3){
   const v=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k));
   const [a,b,c]=v,den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-9)continue;
   const tri={a,b,c,den};
   for(let x=Math.floor(Math.min(...v.map(q=>q.x))/cell);x<=Math.floor(Math.max(...v.map(q=>q.x))/cell);x++)for(let z=Math.floor(Math.min(...v.map(q=>q.z))/cell);z<=Math.floor(Math.max(...v.map(q=>q.z))/cell);z++){
    const k=key(x,z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(tri);
   }
  }g.dispose();
 }
 return (x,z)=>{
  let y=terrain.heightAt(x,z);
  for(const {a,b,c,den} of cells.get(key(Math.floor(x/cell),Math.floor(z/cell)))??[]){
   const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den,w=1-u-v;
   if(u>=-1e-7&&v>=-1e-7&&w>=-1e-7)y=Math.max(y,u*a.y+v*b.y+w*c.y);
  }return y;
 };
}
// One deterministic land-use plan drives actual buildings, hill planting,
// connected country lanes and ground colour. Never changes the racing course.
export function tuscanLandscape(samples){
 if(cache.has(samples))return cache.get(samples);
 const sites=tuscanSettlementSites(samples),xs=samples.map(s=>s.p[0]),zs=samples.map(s=>s.p[2]);
 const bounds={minX:Math.min(...xs)-100,maxX:Math.max(...xs)+100,minZ:Math.min(...zs)-100,maxZ:Math.max(...zs)+100};
 const roadClear=(x,z,r)=>samples.every(s=>Math.hypot(x-s.p[0],z-s.p[2])>(s.w??2.1)+r);
 const siteRadius=p=>Math.hypot(p.halfX,p.halfZ)*p.scale;
 const neighborhoods=[];
 for(const [i,p] of sites.entries()){
  for(const side of [-1,1]){
   const d=siteRadius(p)+5.2,x=p.x+Math.cos(p.rotY)*d*side,z=p.z-Math.sin(p.rotY)*d*side;
   if(!roadClear(x,z,6.5)||sites.some(q=>q!==p&&Math.hypot(x-q.x,z-q.z)<siteRadius(q)+6)||neighborhoods.some(q=>Math.hypot(x-q.x,z-q.z)<10))continue;
   neighborhoods.push({x,z,rotY:p.rotY,scale:.9+hash(i+side*31)*.15,halfX:3,halfZ:3.2,parent:i,style:i+side+1});
  }
 }
 // Admit whole Tuscan focal precincts before grading and planting. They share
 // the same land-use plan as villages, ground colour and camera geometry.
 const landmarks=[];
 for(const spec of [{kind:'cathedral',u:140,halfX:7.5,halfZ:8.5},{kind:'civic-loggia',u:780,halfX:7.2,halfZ:6.5}]){
  const q=samples.reduce((a,b)=>Math.abs(b.u-spec.u)<Math.abs(a.u-spec.u)?b:a),radius=Math.hypot(spec.halfX,spec.halfZ),candidates=[];
  for(const off of [18,24,32,40,50,62])for(const side of [-1,1])for(const along of [0,-12,12,-24,24]){
   const x=q.p[0]+q.r[0]*off*side+q.t[0]*along,z=q.p[2]+q.r[2]*off*side+q.t[2]*along;
   if(!roadClear(x,z,radius+3)||[...sites,...neighborhoods].some(p=>Math.hypot(x-p.x,z-p.z)<siteRadius(p)+radius+3)||landmarks.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius+radius+8))continue;
   candidates.push({...spec,x,z,radius,scale:1,rotY:-Math.atan2(q.t[2],q.t[0]),u:q.u,score:off+Math.abs(along)*.15});
  }
  candidates.sort((a,b)=>a.score-b.score);if(candidates[0])landmarks.push(candidates[0]);
 }
 // Minimum connecting tree plus short village-to-field branches, rather than
 // disconnected decorative pads. Surface lanes remain on the actual earth.
 const paths=[],connected=new Set([0]);
 while(connected.size<sites.length){let best=null;
  for(const i of connected)for(let j=0;j<sites.length;j++)if(!connected.has(j)){const d=Math.hypot(sites[i].x-sites[j].x,sites[i].z-sites[j].z);if(!best||d<best.d)best={i,j,d};}
  if(!best)break;paths.push({a:sites[best.i],b:sites[best.j],width:1.5});connected.add(best.j);
 }
 for(const p of neighborhoods)paths.push({a:sites[p.parent],b:p,width:1.25});
 for(const p of landmarks){const nearest=sites.reduce((a,b)=>Math.hypot(b.x-p.x,b.z-p.z)<Math.hypot(a.x-p.x,a.z-p.z)?b:a);paths.push({a:nearest,b:p,width:1.7});}
 const parcels=[];
 for(let ix=0,x=bounds.minX+8;x<bounds.maxX;x+=22,ix++)for(let iz=0,z=bounds.minZ+8;z<bounds.maxZ;z+=22,iz++){
  const seed=ix*73+iz*109,px=x+(hash(seed)-.5)*5,pz=z+(hash(seed+1)-.5)*5;
  if(!roadClear(px,pz,9)||sites.some(q=>Math.hypot(px-q.x,pz-q.z)<siteRadius(q)+9)||neighborhoods.some(q=>Math.hypot(px-q.x,pz-q.z)<12)||landmarks.some(q=>Math.hypot(px-q.x,pz-q.z)<q.radius+12))continue;
  parcels.push({x:px,z:pz,yaw:Math.floor(hash(seed+3)*4)*Math.PI/4,kind:['vineyard','olive','meadow','wheat'][Math.floor(hash(seed+2)*4)],seed,half:8});
 }
 const landmarkClear=(x,z,r)=>landmarks.every(p=>Math.hypot(x-p.x,z-p.z)>p.radius+r);
 const out={sites,neighborhoods,landmarks,landmarkClear,paths,parcels,bounds,roadClear};cache.set(samples,out);return out;
}

export function appendTuscanLandscape({samples,terrain,parts,groups,house}){
 const plan=tuscanLandscape(samples),hills=parts.filter(p=>p.kind==='hill'),surface=landscapeSurface(hills,terrain);
 const add=(kind,x,y,z,size,material,category,yaw=0)=>parts.push({kind,size,material,category,matrix:pose(x,y,z,yaw).elements});
 const box=(x,y,z,size,material,category,yaw=0)=>add('box',x,y,z,size,material,category,yaw);
 const trunk=(x,y,z,r,h)=>add('cylinder',x,y+h/2,z,[r*.72,r,h,7],'wood','italy-landscape-trunk');
 const cypress=(x,y,z,h,seed)=>{
  trunk(x,y,z,.13,h*.52);
  for(let k=0;k<3;k++)add('cylinder',x+.08*Math.sin(seed+k),y+h*(.38+k*.18),z,[.10,h*(.14-k*.023),h*.48,9],k%2?'pineShade':'cypress','italy-landscape-cypress');
 };
 const pine=(x,y,z,h,seed)=>{
  trunk(x,y,z,.16,h*.66);
  add('canopy',x,y+h*.79,z,[h*.40,h*.24,h*.37,seed],seed%2>1?'pineShade':'pineCrown','italy-landscape-pine');
 };
 for(const [i,p] of plan.neighborhoods.entries()){
  const y=terrain.heightAt(p.x,p.z),mat=pose(p.x,y+.05,p.z,p.rotY).scale(new Vector3(p.scale,p.scale,p.scale));
  house(mat,0,0,p.style);groups.push({...p,y,kind:'village-extension'});
  for(const side of [-1,1]){
   const dx=side*3.3,wx=p.x+Math.cos(p.rotY)*dx,wz=p.z-Math.sin(p.rotY)*dx;
   cypress(wx,surface(wx,wz),wz,4.6+hash(i)*1.1,i);
  }
 }
 // Path-side planting and low garden walls connect old and new buildings.
 for(const [i,path]of plan.paths.entries()){
  const d=Math.hypot(path.b.x-path.a.x,path.b.z-path.a.z),nx=(path.b.z-path.a.z)/(d||1),nz=-(path.b.x-path.a.x)/(d||1);
  for(let t=5;t<d-4;t+=6.5){
   const x=path.a.x+(path.b.x-path.a.x)*t/d,z=path.a.z+(path.b.z-path.a.z)*t/d;
   for(const side of [-1,1]){
    const px=x+nx*side*2.9,pz=z+nz*side*2.9;
    if(!plan.roadClear(px,pz,2.1)||!plan.landmarkClear(px,pz,2.1)||plan.sites.some(q=>Math.hypot(px-q.x,pz-q.z)<Math.hypot(q.halfX,q.halfZ)*q.scale+1)||plan.neighborhoods.some(q=>Math.hypot(px-q.x,pz-q.z)<4))continue;
    if((Math.floor(t/6.5)+i)%3===0)cypress(px,surface(px,pz),pz,4.1+hash(t+i)*2.1,i+t);
    else box(px,surface(px,pz)+.32,pz,[.48,.64,3.9],'limestone','italy-landscape-garden-wall',Math.atan2(path.b.x-path.a.x,path.b.z-path.a.z));
   }
  }
 }
 for(const [i,p]of plan.parcels.entries()){
  if(p.kind==='olive')for(let row=0;row<3;row++)for(let col=0;col<3;col++){
   const dx=(row-1)*4.8,dz=(col-1)*4.8,x=p.x+Math.cos(p.yaw)*dx+Math.sin(p.yaw)*dz,z=p.z-Math.sin(p.yaw)*dx+Math.cos(p.yaw)*dz;
   if(!plan.roadClear(x,z,3.2))continue;pine(x,surface(x,z),z,3.6+hash(i+row+col)*1.4,i+row);
  }
  if(p.kind==='vineyard')for(let row=0;row<5;row++)for(let col=0;col<13;col++){
   const dx=(row-2)*2.7,dz=(col-6)*1.0,x=p.x+Math.cos(p.yaw)*dx+Math.sin(p.yaw)*dz,z=p.z-Math.sin(p.yaw)*dx+Math.cos(p.yaw)*dz;
   if(!plan.roadClear(x,z,1.2))continue;
   const y=surface(x,z);trunk(x,y,z,.045,.85);
   // Continuous trellised rows with low uneven foliage, not orchard balls.
   add('cylinder',x,y+.94,z,[.37,.52,.44,7],(row+col)%3?'vine':'vineShade','italy-landscape-vine',p.yaw);
   if(col%6===0)box(x,y+.69,z,[.08,1.38,.08],'wood','italy-landscape-vine-post');
  }
 }
 // Low scrub and rocks connect the road verge to field and garden detail.
 let nextGround=5;
 for(const s of samples){
  if(s.u<nextGround||s.gap)continue;nextGround=s.u+3.7;
  for(const side of [-1,1])for(let band=0;band<3;band++){
   const seed=s.u*7+band*19+side*13,offset=7+band*4.1+hash(seed)*2,x=s.p[0]+s.r[0]*offset*side,z=s.p[2]+s.r[2]*offset*side;
   if(!plan.roadClear(x,z,1.5)||!plan.landmarkClear(x,z,1.5)||plan.sites.some(p=>Math.hypot(x-p.x,z-p.z)<Math.hypot(p.halfX,p.halfZ)*p.scale+1)||plan.neighborhoods.some(p=>Math.hypot(x-p.x,z-p.z)<4))continue;
   const y=surface(x,z);
   if(hash(seed+4)<.23)add('canopy',x,y+.15,z,[.40,.22,.33,seed],'limestone','italy-landscape-rock');
   else for(let k=0;k<3;k++){
    const dx=(hash(seed+k)-.5)*.7,dz=(hash(seed+k+4)-.5)*.7,py=surface(x+dx,z+dz),h=.20+hash(seed+k+7)*.32;
    add('cylinder',x+dx,py+h/2,z+dz,[.025,.16,h,6],k%2?'vineShade':'vine','italy-landscape-scrub');
   }
  }
 }
 // Plant the actual rendered hill triangles, including overlapping ridges.
 let count=0;
 // A sparse grid of irregular groves gives a readable tree line and clear
 // openings; the continuous fields/paths carry detail between those groves.
 for(const [hi,hill]of hills.entries()){
  const cx=hill.matrix[12],cz=hill.matrix[14],rx=hill.size[0]*.88,rz=hill.size[2]*.88;
  const spacing=Math.max(10,Math.sqrt(Math.PI*rx*rz/160));
  for(let x=cx-rx;x<cx+rx;x+=spacing)for(let z=cz-rz;z<cz+rz;z+=spacing){
   const seed=x*3.1+z*1.7+hi*71,px=x+(hash(seed)-.5)*6,pz=z+(hash(seed+1)-.5)*6;
   if(count>=2500||Math.hypot((px-cx)/rx,(pz-cz)/rz)>1||hash(seed+2)<.27||!plan.roadClear(px,pz,4.5)||!plan.landmarkClear(px,pz,4.5))continue;
   const y=surface(px,pz),h=4+hash(seed+4)*3.8;
   if(hash(seed+5)>.68)cypress(px,y,pz,h,seed);else pine(px,y,pz,h,seed);count++;
  }
 }
 groups.push({kind:'landscape-summary',x:0,y:0,z:0,trees:count,parcels:plan.parcels.length,extensions:plan.neighborhoods.length});
 return plan;
}
