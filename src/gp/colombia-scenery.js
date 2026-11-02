// One opaque primitive recipe for BOTH the production image and camera QA.
import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {sceneryLayout} from './scenery-layout.js';
import {regionalRelief} from './regional-relief.js';
const pose=(p,r=[0,0,0],s=1)=>new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(s,s,s));
export const COLOMBIA_MATERIALS={
 cream:{color:'#f2e3ba',roughness:.88},yellow:{color:'#fcd116',roughness:.8},
 turquoise:{color:'#269d95',roughness:.8},rose:{color:'#dc7067',roughness:.86},
 blue:{color:'#285da6',roughness:.77},red:{color:'#ce1126',roughness:.78},
 roof:{color:'#b45132',roughness:.9},wood:{color:'#69442b',roughness:.94},
 soil:{color:'#56703c',roughness:1},hill:{color:'#487549',roughness:1},ridge:{color:'#496a63',roughness:1},distantRidge:{color:'#66817b',roughness:1},
 leaf:{color:'#2b6037',roughness:.97},palm:{color:'#5e8548',roughness:.94},
 glass:{color:'#8ccec8',roughness:.28,metalness:.18},iron:{color:'#213b32',roughness:.6},
 berry:{color:'#aa3430',roughness:.83},stone:{color:'#a69776',roughness:.98},
};
export function colombianScenery(samples){
 const layout=sceneryLayout(samples),parts=[],groups=[];
 const add=(m,kind,p,size,material,category,rot=[0,0,0])=>parts.push({kind,size,material,category,matrix:m.clone().multiply(pose(p,rot)).elements});
 const box=(m,p,size,material,category='colombia-building',rot)=>add(m,'box',p,size,material,category,rot);
 const cylinder=(m,p,top,bottom,h,material,category,sides=8)=>add(m,'cylinder',p,[top,bottom,h,sides],material,category);
 const palm=(m,x,z,h)=>{
  cylinder(m,[x,h/2,z],.10,.22,h,'cream','colombia-palm');
  for(let j=0;j<9;j++){
   const a=j*Math.PI*2/9;
   box(m,[x+Math.sin(a)*1.3,h+.05,z+Math.cos(a)*1.3],[.42,.10,3.1],'palm','colombia-frond',[.18,a,0]);
  }
 };
 const flag=(m,x,z)=>{
  cylinder(m,[x,2,z],.035,.065,4,'iron','colombia-flag-pole');
  for(const [y,h,c]of [[3.65,.56,'yellow'],[3.23,.28,'blue'],[2.95,.28,'red']])box(m,[x+.8,y,z],[1.6,h,.035],c,'colombia-flag');
 };
 const house=(m,x,z,style)=>{
  const h=4.4+(style%2)*1.2,c=['cream','yellow','turquoise','rose'][style%4],trim=['blue','red','yellow','turquoise'][style%4];
  box(m,[x,h/2,z],[3.8,h,4.5],c);
  // Two sloping tile surfaces form an open triangular gable; no opaque box roof.
  for(const side of [-1,1])box(m,[x+side*1.12,h+.55,z],[2.65,.16,5.1],'roof','colombia-roof',[0,0,-side*.40]);
  for(const side of [-1,1])box(m,[x+side*1.94,h/2,z+2.28],[.15,h,.1],trim,'colombia-timber');
  for(let floor=0;floor<2;floor++)for(const dx of [-1.05,1.05]){
   const y=1.25+floor*2;box(m,[x+dx,y,z+2.28],[.72,1.1,.055],'glass','colombia-window');
   for(const side of [-1,1])box(m,[x+dx+side*.46,y,z+2.32],[.17,1.23,.09],trim,'colombia-shutter');
  }
  box(m,[x,2.52,z+2.65],[4.05,.15,.85],trim,'colombia-balcony');
  box(m,[x,2.96,z+3.04],[4.05,.1,.07],trim,'colombia-balcony');
  for(let j=0;j<11;j++)box(m,[x-1.9+j*.38,2.75,z+3.04],[.055,.42,.055],trim,'colombia-balcony');
  box(m,[x,.95,z+2.32],[.82,1.9,.09],trim,'colombia-door');
 };
 const coffee=(m,x,z)=>{
  cylinder(m,[x,.38,z],.05,.08,.76,'wood','colombia-coffee');
  cylinder(m,[x,.72,z],.28,.55,.9,'leaf','colombia-coffee',6);
  for(const dx of [-.25,.25])box(m,[x+dx,.72,z+.32],[.09,.09,.09],'berry','colombia-berries');
 };
 // The broad green foundations need more space than the original chalet plots.
 // Include their rotated/scaled bounds when admitting a town near a hairpin.
 const townClear=b=>samples.every(s=>Math.hypot(s.p[0]-b.x,s.p[2]-b.z)>Math.max(30,b.scale*21));
 [...layout.props.filter((b,i)=>i%2===0&&townClear(b)),...layout.ring.filter((_,i)=>i%2===0)].forEach((b,i)=>{
  const m=pose([b.x,b.y,b.z],[0,b.rotY,0],b.scale),depth=Math.max(.7,(b.y-layout.groundY)/b.scale);
  groups.push({x:b.x,y:b.y,z:b.z,kind:'coffee-town'});
  add(m,'mountain',[0,0,0],[8.2,.2,depth,730+i],'soil','colombia-landform');
  box(m,[0,.36,0],[14,.15,10.5],'stone','colombia-plaza');
  for(let j=0;j<3;j++)house(m,(j-1)*4.2,-1.4,i+j);
  palm(m,-5.8,3.8,9.5+i%4);palm(m,5.8,3.8,11+i%3);
  if(i%2===0)flag(m,.2,3.7);
  for(let row=0;row<3;row++)for(let j=0;j<8;j++)coffee(m,-5.3+j*1.5,-5.1-row*.9);
 });
 // Hills use the existing faceted landscape geometry with green materials.
 for(const [i,b]of layout.ring.entries()){
  if(i%2===0)continue;
  const m=pose([b.x,b.y-2,b.z],[0,b.rotY,0]);
  const depth=Math.max(.7,b.y-2-layout.groundY);
  add(m,'mountain',[0,0,0],[12,10+i%4*2,depth,950+i],'hill','colombia-hill');
 }
 // A continuous Andean skyline and close, varied coffee-country hamlets.
 // These use the SAME primitive recipe for imagery and camera collision QA.
 const relief=regionalRelief(samples);
 for(const [i,p]of relief.peaks.entries()){
  add(pose([p.x,p.y,p.z]),'mountain',[0,0,0],[p.radius,p.height,2,p.seed],i%3?'ridge':'distantRidge','colombia-mountain');
 }
 for(const [i,p]of relief.plots.entries()){
  const m=pose([p.x,p.y,p.z],[0,p.rotY,0]),depth=Math.max(.7,p.y-layout.groundY);
  groups.push({...p,kind:'coffee-hamlet'});
  add(m,'mountain',[0,0,0],[5.1,.15,depth,2200+i],'soil','colombia-hamlet-landform');
  box(m,[0,.35,0],[8,.15,7.5],'stone','colombia-hamlet-paving');
  house(m,-1.95,-.5,i);house(m,2.05,-1.2,i+2);
  if(i%3===0)palm(m,3.2,2.6,7+i%4);
  if(i%4===0){flag(m,-3,2.5);box(m,[0,1.5,3],[2.6,.16,1.4],'roof','colombia-market-canopy');for(const x of [-1,1])cylinder(m,[x,.8,3],.045,.045,1.6,'wood','colombia-market-post');box(m,[0,.65,3],[2.4,.7,1.1],'wood','colombia-market');}
  for(let j=0;j<4;j++)coffee(m,-3+j*2,-3.5);
 }
 // Sparse closer palms/flags add regional detail without blocking a lane.
 for(let i=25;i<samples.length-40;i+=52){
  const s=samples[i],side=i%104<52?1:-1,len=Math.hypot(s.r[0],s.r[2])||1;
  const x=s.p[0]+side*s.r[0]/len*((s.w??2.1)+9),z=s.p[2]+side*s.r[2]/len*((s.w??2.1)+9);
  if(samples.some(q=>Math.hypot(q.p[0]-x,q.p[2]-z)<(q.w??2.1)+5))continue;
  const m=pose([x,s.p[1]-1,z],[0,Math.atan2(s.p[0]-x,s.p[2]-z),0]);
  add(m,'mountain',[0,0,0],[2.8,.2,Math.max(.7,s.p[1]-1-layout.groundY),1200+i],'soil','colombia-landform');
  palm(m,0,0,10+i%3);flag(m,1.7,.7);groups.push({x,y:s.p[1]-1,z,kind:'roadside'});
 }
 return {parts,groups,groundY:layout.groundY};
}
