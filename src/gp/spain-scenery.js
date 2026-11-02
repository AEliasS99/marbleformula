// Themed production scenery and camera envelopes share these exact primitives.
import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {sceneryLayout} from './scenery-layout.js';
import {regionalRelief} from './regional-relief.js';
const pose=(p,r=[0,0,0],s=1)=>new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(s,s,s));
export const SPAIN_MATERIALS={
 ridge:{color:'#87715c',roughness:1},distantRidge:{color:'#9a8c7d',roughness:1},
 ivory:{color:'#f0dfb8',roughness:.84},ochre:{color:'#d69a51',roughness:.88},rose:{color:'#c77762',roughness:.83},stone:{color:'#ac9374',roughness:.95},roof:{color:'#b64828',roughness:.84},tile:{color:'#e17840',roughness:.76},iron:{color:'#223d3d',roughness:.48,metalness:.45},glass:{color:'#8cc6d1',roughness:.2,metalness:.35},lamp:{color:'#ffdd94',emissive:'#ffbc59',emissiveIntensity:.7,roughness:.45},red:{color:'#aa151b',roughness:.65},gold:{color:'#f1bf00',roughness:.6},bark:{color:'#82603c',roughness:.9},leaf:{color:'#426e3c',roughness:.92},water:{color:'#216f86',roughness:.23,metalness:.35},
};
export function spanishScenery(samples){
 const layout=sceneryLayout(samples),parts=[],groups=[];
 const add=(m,kind,pos,size,material,category='spain-building',rot=[0,0,0])=>parts.push({kind,size,material,category,matrix:m.clone().multiply(pose(pos,rot)).elements});
 const box=(m,p,s,c,cat,rot)=>add(m,'box',p,s,c,cat,rot);
 const cylinder=(m,p,top,bottom,h,c,cat,sides=10)=>add(m,'cylinder',p,[top,bottom,h,sides],c,cat);
 const palm=(m,x,z,h=6)=>{
  cylinder(m,[x,h/2,z],.13,.27,h,'bark','spain-palm');
  for(let j=0;j<8;j++){const a=j*Math.PI/4;box(m,[x+Math.sin(a)*1.25,h+.05,z+Math.cos(a)*1.25],[.65,.12,3.3],'leaf','spain-frond',[.18,a,0]);}
 };
 const flag=(m,x,z)=>{
  cylinder(m,[x,2,z],.045,.07,4,'iron','spain-flag-pole');
  for(const [y,h,c]of [[3.7,.28,'red'],[3.28,.56,'gold'],[2.86,.28,'red']])box(m,[x+.85,y,z],[1.7,h,.045],c,'spain-flag');
 };
 const house=(m,x,z,style=0)=>{
  const h=4.2+(style%3)*1.2,c=['ivory','ochre','rose'][style%3];box(m,[x,h/2,z],[3.8,h,4.6],c);
  add(m,'cylinder',[x,h+.72,z],[0,3.35,1.55,4],'roof','spain-roof',[0,Math.PI/4,0]);
  box(m,[x,h-.04,z],[4.1,.16,4.85],'tile','spain-eaves');box(m,[x+1,h+.65,z-.9],[.38,1.5,.38],'ivory','spain-chimney');
  for(let floor=0;floor<Math.floor(h/2);floor++)for(const dx of [-1.05,1.05]){
   const y=1.1+floor*1.75;box(m,[x+dx,y,z+2.32],[.65,.9,.07],'glass','spain-window');
   for(const side of [-1,1])box(m,[x+dx+side*.43,y,z+2.36],[.16,.96,.09],'iron','spain-shutter');
   box(m,[x+dx,y-.5,z+2.52],[1,.1,.5],'stone','spain-balcony');box(m,[x+dx,y-.25,z+2.78],[1,.08,.055],'iron','spain-balcony');
   for(const xx of [-.4,0,.4])box(m,[x+dx+xx,y-.37,z+2.78],[.035,.3,.04],'iron','spain-balcony');
  }
  box(m,[x,.8,z+2.32],[.7,1.6,.08],'iron','spain-door');box(m,[x,1.7,z+2.5],[1.2,.12,.6],'tile','spain-awning');
 };
 const village=(b,i)=>{
  const m=pose([b.x,b.y,b.z],[0,b.rotY,0],b.scale),depth=Math.max(.6,(b.y-layout.groundY)/b.scale);groups.push({x:b.x,y:b.y,z:b.z,kind:'village'});
  add(m,'mountain',[0,0,0],[6.8,.35,depth,200+i],'stone','spain-landform');box(m,[0,.55,0],[14.3,.16,10.3],'ivory','spain-paving');
  for(let j=0;j<3;j++)house(m,(j-1)*4.1,-.9,i+j);palm(m,-5.5,3.5,5.3);palm(m,5.5,3.5,6.1);if(i%2===0)flag(m,0,3.8);
  if(i%4===0){const x=-4.2,z=-3,h=11;box(m,[x,h/2,z],[2.1,h,2.1],'ochre','spain-bell-tower');for(const side of [-1,1])box(m,[x+side*.8,h+.7,z],[.38,1.7,2.1],'ivory','spain-belfry');box(m,[x,h+1.7,z],[2.5,.25,2.5],'ivory','spain-belfry');add(m,'cylinder',[x,h+2.4,z],[0,1.9,1.3,4],'roof','spain-roof',[0,Math.PI/4,0]);cylinder(m,[x,h+.7,z],.3,.5,.65,'gold','spain-bell');}
 };
 [...layout.props.filter((_,i)=>i%2===0),...layout.ring.filter((_,i)=>i%2===0)].forEach(village);
 // Roadside cluster clearance includes neighbouring hairpins at any elevation.
 for(let i=25;i<samples.length-35;i+=48){
  const s=samples[i],side=i%96<48?1:-1,len=Math.hypot(s.r[0],s.r[2])||1;
  const x=s.p[0]+side*s.r[0]/len*((s.w??2.1)+8.5),z=s.p[2]+side*s.r[2]/len*((s.w??2.1)+8.5);
  if(samples.some(q=>Math.hypot(q.p[0]-x,q.p[2]-z)<(q.w??2.1)+5))continue;
  const m=pose([x,s.p[1]-1,z],[0,Math.atan2(s.p[0]-x,s.p[2]-z),0]),h=Math.max(.5,s.p[1]-1-layout.groundY);
  add(m,'mountain',[0,0,0],[2,.2,h,500+i],'stone','spain-roadside-landform');box(m,[0,.05,0],[5.1,.15,4.6],'ochre','spain-paving');palm(m,-1.2,-.3,5.5);flag(m,1.1,.3);groups.push({x,y:s.p[1]-1,z,kind:'roadside'});
 }
 const relief=regionalRelief(samples);
 for(const [i,p]of relief.peaks.entries())add(pose([p.x,p.y,p.z]),'mountain',[0,0,0],[p.radius,p.height*.82,2,p.seed],i%3?'ridge':'distantRidge','spain-mountain');
 for(const [i,p]of relief.plots.entries()){
  const m=pose([p.x,p.y,p.z],[0,p.rotY,0]),depth=Math.max(.7,p.y-layout.groundY);
  groups.push({...p,kind:'hillside-hamlet'});add(m,'mountain',[0,0,0],[5.1,.2,depth,2400+i],'stone','spain-hamlet-landform');
  box(m,[0,.4,0],[8,.15,7.5],'ochre','spain-hamlet-paving');house(m,-2,-.6,i);house(m,2,-1.2,i+1);
  if(i%3===0)palm(m,3.3,2.8,6);if(i%4===0)flag(m,-3,2.5);
  // Olive groves and roadside markets bring regional detail near the racing.
  for(const x of [-3,0,3]){cylinder(m,[x,.7,-3.2],.09,.14,1.4,'bark','spain-olive-trunk');cylinder(m,[x,1.8,-3.2],.7,1.1,1.5,'leaf','spain-olive',7);}
  if(i%5===0){box(m,[0,1.7,3],[2.6,.12,1.3],'red','spain-market-awning');box(m,[0,.7,3],[2.4,.9,1.1],'bark','spain-market');}
 }
 return {parts,groups,groundY:layout.groundY};
}
