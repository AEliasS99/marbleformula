// Opaque authored Tuscan scenery shared by the image and camera ray checks.
// Reuses the established ground-connected landscape and merged-mesh pipeline.
import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {sceneryLayout} from './scenery-layout.js';
import {italianTerrain} from './italy-terrain.js';
import {pointInFrame,TRACK} from './trackMesh.js';
import {regionalRelief} from './regional-relief.js';
import {TUSCAN_VENUE_PROFILE} from './tuscany-sites.js';
import {appendTuscanLandscape} from './tuscany-landscape.js';
import {appendTuscanVenue} from './tuscany-venue.js';
const pose=(p,r=[0,0,0],s=1)=>new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(s,s,s));
export const ITALY_MATERIALS={
 limestone:{color:'#c7b18b',roughness:.95},cream:{color:'#ead9b3',roughness:.9},ochre:{color:'#c89d66',roughness:.94},
 roof:{color:'#9c4e33',roughness:.93},tile:{color:'#b76b46',roughness:.9},shutter:{color:'#365447',roughness:.87},
 glass:{color:'#638b91',roughness:.3,metalness:.12},wood:{color:'#66513a',roughness:.98},iron:{color:'#353e37',roughness:.64},
 soil:{color:'#81784d',roughness:1},hill:{color:'#7c8757',roughness:1},ridge:{color:'#8b986f',roughness:1},
 cypress:{color:'#294a32',roughness:.97},vine:{color:'#506a37',roughness:.96},grape:{color:'#484151',roughness:.93},
 green:{color:'#009246',roughness:.85},white:{color:'#f5efe0',roughness:.85},red:{color:'#ce2b37',roughness:.85},
};
export function italianScenery(samples,{profile='tuscany',length=0}={}){
 const venue=profile===TUSCAN_VENUE_PROFILE,rich=profile==='tuscany-rich-v2'||venue;
 if(venue&&!(Number.isFinite(length)&&length>0))throw Error('Tuscan venue needs the actual course length for shared pit placement');
 const provence=profile==='provence';
 const layout=sceneryLayout(samples),relief=regionalRelief(samples),terrain=italianTerrain(samples,{profile,length}),parts=[],groups=[];
 const add=(m,kind,p,size,material,category,rot=[0,0,0])=>parts.push({kind,size,material,category,matrix:m.clone().multiply(pose(p,rot)).elements});
 const box=(m,p,size,material,category='italy-building',rot)=>add(m,'box',p,size,material,category,rot);
 const cyl=(m,p,top,bottom,h,material,category,sides=10)=>add(m,'cylinder',p,[top,bottom,h,sides],material,category);
 const cypress=(m,x,z,h)=>{
  if(provence){
   cyl(m,[x,1.5,z],.18,.32,3,'wood','italy-tree-trunk');
   for(const [dx,dy,dz]of [[0,0,0],[-.9,-.2,.3],[.85,-.15,-.3]])add(m,'sphere',[x+dx,3.2+dy,z+dz],[1.4,1.2,1.3],'cypress','italy-olive-crown');
  }else{cyl(m,[x,.8,z],.11,.18,1.6,'wood','italy-tree-trunk');cyl(m,[x,h*.55,z],.13,.72,h,'cypress','italy-cypress');}
 };
 const flag=m=>{
  cyl(m,[4,2.3,3],.035,.055,4.6,'iron','italy-flag-pole');
  for(const[i,c]of [provence?'blue':'green','white','red'].entries())box(m,[4.24+i*.48,4.05,3],[.48,.92,.035],c,'italy-flag');
 };
 const house=(m,x,z,style)=>{
  const h=3.7+style%3*.6,w=3.6,d=4.4;
  box(m,[x,h/2+.25,z],[w,h,d],style%2?'cream':'ochre');
  // Grounded stone plinth, overhanging tiled gable and individual ridge caps.
  box(m,[x,.2,z],[w+.18,.4,d+.18],'limestone','italy-house-plinth');
  for(const side of [-1,1]){
   box(m,[x+side*.97,h+.68,z],[2.25,.18,4.95],'roof','italy-roof',[0,0,-side*.36]);
   for(let j=0;j<9;j++)box(m,[x+side*.97,h+.80,z-2.15+j*.53],[2.25,.035,.08],'tile','italy-roof-tile',[0,0,-side*.36]);
  }
  box(m,[x+.9,h+1.1,z-1.2],[.44,1.2,.5],'limestone','italy-chimney');
  for(let floor=0;floor<2;floor++)for(const dx of [-1,1]){
   const y=1.1+floor*1.65;
   box(m,[x+dx,y,z+d/2+.03],[.62,.94,.06],'glass','italy-window');
   box(m,[x+dx,y-.52,z+d/2+.10],[.96,.12,.32],'limestone','italy-window-sill');
   for(const side of [-1,1])box(m,[x+dx+side*.42,y,z+d/2+.07],[.19,1.05,.08],'shutter','italy-shutter');
  }
  box(m,[x,.91,z+d/2+.07],[.65,1.6,.12],'wood','italy-door');
  if(venue){
   for(const y of [.48,2.28,h-.18])box(m,[x,y,z],[w+.14,.14,d+.14],'limestone','italy-venue-cornice');
   for(const dx of [-1,1]){
    box(m,[x+dx*1.72,h/2,z+d/2+.10],[.18,h-.3,.14],'limestone','italy-venue-quoin');
    box(m,[x+dx,h-1.2,z+d/2+.37],[1.18,.10,.75],'wood','italy-venue-balcony');
    box(m,[x+dx,h-.72,z+d/2+.73],[1.18,.06,.06],'iron','italy-venue-balcony-rail');
    for(let j=0;j<5;j++)box(m,[x+dx-.48+j*.24,h-.95,z+d/2+.73],[.035,.45,.035],'iron','italy-venue-baluster');
   }
   box(m,[x,1.8,z+d/2+.13],[.94,.18,.25],'limestone','italy-venue-door-lintel');
   for(let j=0;j<3;j++)box(m,[x,.08+j*.07,z+d/2+.5-j*.16],[1.1,.14,.8-j*.16],'limestone','italy-venue-door-step');
  }
 };
 const tower=(m,x,z)=>{
  if(provence){
   cyl(m,[x,3.3,z],1.25,1.65,6.6,'limestone','italy-windmill');
   cyl(m,[x,7.25,z],0,1.7,1.6,'roof','italy-windmill-roof');
   for(const angle of [Math.PI/4,-Math.PI/4]){
    box(m,[x,4.8,z+1.7],[.14,6.5,.12],'wood','italy-windmill-sail',[0,0,angle]);
    box(m,[x,4.8,z+1.8],[.64,5.8,.05],'cream','italy-windmill-canvas',[0,0,angle]);
   }
   box(m,[x,1,z+1.6],[.8,2,.12],'wood','italy-door');return;
  }
  box(m,[x,4.4,z],[2.8,8.8,2.8],'limestone','italy-bell-tower');
  for(const side of [-1,1]){
   box(m,[x+side*.76,7.5,z+1.43],[.45,1.1,.04],'iron','italy-bell-window');
   box(m,[x+side*.8,9.12,z],[1.94,.18,3.2],'roof','italy-tower-roof',[0,0,-side*.5]);
  }
  box(m,[x,6.1,z+1.44],[.86,.86,.05],'cream','italy-clock');
  box(m,[x,6.25,z+1.48],[.06,.34,.03],'iron','italy-clock-hand');
  box(m,[x+.16,6.1,z+1.48],[.32,.06,.03],'iron','italy-clock-hand');
 };
 const vines=(m,x,z)=>{
  if(provence){
   for(let row=0;row<5;row++){
    const pz=z-row*.7;
    box(m,[x,.12,pz],[7.8,.2,.48],'soil','italy-lavender-bed');
    for(let j=0;j<10;j++){
     const px=x-3.5+j*.77;
     add(m,'sphere',[px,.4,pz],[.4,.25,.27],'vine','italy-lavender-leaves');
     add(m,'sphere',[px,.66,pz],[.34,.21,.23],'lavender','italy-lavender-flower');
    }
   }return;
  }
  for(let row=0;row<4;row++){
   box(m,[x,.17,z-row*.85],[7.8,.22,.54],'soil','italy-vine-bed');
   for(let j=0;j<7;j++){
    const px=x-3.4+j*1.13,pz=z-row*.85;
    cyl(m,[px,.64,pz],.045,.06,1.2,'wood','italy-vine-post',6);
    box(m,[px,.93,pz],[.96,.53,.48],'vine','italy-vine');
    if(j%2===0)cyl(m,[px,.72,pz+.27],.08,.12,.22,'grape','italy-grapes',6);
   }
  }
 };
 // Terraces are admitted only when their complete scaled footprint clears road.
 const clear=b=>samples.every(s=>Math.hypot(s.p[0]-b.x,s.p[2]-b.z)>Math.max(28,b.scale*20)+(s.w??2.1));
 const towns=[...layout.props.filter((b,i)=>i%2===0&&clear(b)),...layout.ring.filter((_,i)=>i%3===0)];
 towns.forEach((b,i)=>{
  const y=terrain.heightAt(b.x,b.z)+(venue?.05:1.4)*b.scale;
  const m=pose([b.x,y,b.z],[0,b.rotY,0],b.scale);
  groups.push({x:b.x,y,z:b.z,kind:'tuscan-town'});
  box(m,[0,-1.6,0],[15,3.4,12.5],'limestone','italy-town-foundation');
  box(m,[0,.26,0],[15,.25,12.5],'limestone','italy-piazza');
  if(venue)for(let x=-7;x<=7;x++)for(let z=-5;z<=5;z++)box(m,[x,.40,z],[.97,.04,.97],'paving','italy-venue-piazza-paver');
  for(let j=0;j<3;j++)house(m,(j-1)*4.4,-1.1,i+j);
  if(i%2===0)tower(m,-5,3.5);else cypress(m,-5.8,3.8,7.5);
  cypress(m,5.8,3.8,8.4);flag(m);vines(m,0,-6.1);
 });
 relief.plots.forEach((p,i)=>{
  const y=terrain.heightAt(p.x,p.z)+(venue?.05:1.4),m=pose([p.x,y,p.z],[0,p.rotY,0]);
  groups.push({...p,y,kind:'vineyard-farm'});
  box(m,[0,-1.6,0],[8.5,3.4,8.8],'limestone','italy-farm-foundation');
  box(m,[0,.16,0],[8.5,.18,8.8],'soil','italy-farm-terrace');
  house(m,-1,-.6,i);cypress(m,3.1,2.7,6+i%3);vines(m,.2,-3.7);
 });
 if(rich){
  const roadClear=(x,z,r)=>samples.every(s=>Math.hypot(s.p[0]-x,s.p[2]-z)>r+(s.w??3.2));
  // Existing villages must remain fully above ground, with room for their
  // vines and trees. Keep whole hill footprints outside their foundations.
  const settlements=parts.filter(p=>p.category==='italy-town-foundation'||p.category==='italy-farm-foundation').map(p=>({
   x:p.matrix[12],z:p.matrix[14],radius:Math.hypot(p.size[0],p.size[2])/2*Math.hypot(p.matrix[0],p.matrix[1],p.matrix[2])+15,
  }));
  const hillClear=(x,z,r)=>roadClear(x,z,r+10)&&settlements.every(p=>Math.hypot(x-p.x,z-p.z)>r+p.radius);
  // The original recipe computed relief.peaks but never added a skyline.
  // Broad, ground-connected ridges frame the existing Tuscan villages.
  relief.peaks.forEach((p,i)=>{
   const radius=Math.max(p.radius*2.5,p.height*.8);
   // The course loses over 100m of elevation. Scaling skyline height from that
   // drop produced steep overlapping walls. Keep the existing broad footprints
   // but give these Tuscan hills shallow, varied slopes and an open skyline.
   const height=radius*(.27+(i%4)*.035);
   let x=p.x,z=p.z;
   for(let k=0;k<18&&!hillClear(x,z,radius);k++){x=layout.cx+(x-layout.cx)*1.10;z=layout.cz+(z-layout.cz)*1.10;}
   if(!hillClear(x,z,radius))return;
   // Embed the skirt in the local rolling ground. A global datum buries
   // shallow hills below the outer terrain, exposing its finite mesh edge.
   const y=terrain.heightAt(x,z)-height*.60;
   const m=pose([x,y,z],[0,i*.71,0]);
   add(m,'hill',[0,0,0],[radius,height,radius*.84],'ridge','italy-backdrop-ridge');
   groups.push({x,y,z,kind:'tuscan-backdrop'});
  });
  const olive=(m,h=5)=>{
   cyl(m,[0,h*.28,0],.17,.27,h*.56,'wood','italy-olive-trunk');
   for(const [index,[x,y,z,k]]of [[0,.72,0,1],[-.22,.65,.12,.8],[.22,.68,-.12,.76]].entries()){
    const phase=m.elements[12]*.71+m.elements[14]*1.31+index*2.1;
    const variation=venue?.84+.15*(.5+.5*Math.sin(phase)):1;
    add(m,'sphere',[x*h,(y+(venue?.035*Math.sin(phase*1.7):0))*h,z*h],[h*.32*k*variation,h*.24*k*variation,h*.3*k*variation],venue&&index%2?'vineShade':'vine','italy-olive-crown');
   }
  };
  // Fill the camera's near and middle ground, not only distant object counts.
  for(let next=12,i=0;i<samples.length;i++){
   const s=samples[i];if(s.u<next||s.u>samples.at(-1).u-18||s.gap)continue;next=s.u+9;
   for(const side of [-1,1]){
    const off=8.5+(Math.floor(s.u/9)%3)*1.2,x=s.p[0]+s.r[0]*side*off,z=s.p[2]+s.r[2]*side*off;
    if(!roadClear(x,z,4))continue;
    const m=pose([x,terrain.heightAt(x,z),z],[0,Math.atan2(s.t[0],s.t[2]),0]);
    if(Math.floor(s.u/9)%3===(side<0?0:1))olive(m,5.5+s.u%2);
    else for(let j=0;j<5;j++)for(let course=0;course<2;course++)box(m,[0,.25+course*.45,(j-2)*.85+(course?.2:0)],[.55,.44,.8],'limestone','italy-near-stone-wall');
   }
  }
  relief.plots.filter((_,i)=>i%3===0).forEach((p,i)=>{
   const x=p.x+Math.cos(p.rotY)*10,z=p.z-Math.sin(p.rotY)*10;if(!roadClear(x,z,7))return;
   const m=pose([x,terrain.heightAt(x,z),z],[0,p.rotY,0]);
   for(const ox of [-3,0,3])for(const oz of [-3,0,3]){
    const wx=x+Math.cos(p.rotY)*ox+Math.sin(p.rotY)*oz,wz=z-Math.sin(p.rotY)*ox+Math.cos(p.rotY)*oz;
    olive(pose([wx,terrain.heightAt(wx,wz),wz],[0,p.rotY,0]),4.3+(i%3)*.4);
   }
   groups.push({x,y:terrain.heightAt(x,z),z,kind:'olive-grove'});
  });
 }
 if(venue){appendTuscanLandscape({samples,terrain,parts,groups,house});appendTuscanVenue({samples,terrain,parts,groups,length});}
 // Grounded stone piers replace dense reflective studio poles beneath this
 // high descending road. Their exact boxes also enter the camera ray model.
 let lastSupport=-Infinity;
 for(const s of samples){
  if(s.u-lastSupport<35||s.gap)continue;
  if(samples.some(q=>q.gap&&Math.abs(q.u-s.u)<2))continue;
  const bottom=pointInFrame(s,0,-TRACK.wall-.14),[x,top,z]=bottom;
  if(samples.some(q=>Math.abs(q.u-s.u)>8&&q.p[1]<s.p[1]&&Math.hypot(q.p[0]-x,q.p[2]-z)<(q.w??3)+3))continue;
  const foot=terrain.heightAt(x,z)-.2,h=top-foot;
  if(h<1.4)continue;
  lastSupport=s.u;
  const yaw=Math.atan2(s.t[0],s.t[2]),m=pose([x,foot,z],[0,yaw,0]);
  const width=h>15?2.6:1.2,depth=h>15?3.2:1.8;
  box(m,[0,(h-.7)/2,0],[width,h-.7,depth],'limestone','italy-viaduct-pier');
  // Follow the banked road underside; a level crossbeam can pierce its low edge.
  const cap=new Matrix4().makeBasis(new Vector3(...s.t),new Vector3(...s.n),new Vector3(...s.r));
  cap.setPosition(new Vector3(...bottom).addScaledVector(new Vector3(...s.n),-.35));
  box(cap,[0,0,0],[depth+1,.7,2*(s.w??3)],'limestone','italy-viaduct-cap');
  box(m,[0,.25,0],[width+1,.5,depth+1],'limestone','italy-viaduct-foot');
 }
 // Continuous rolling ground replaces pinched pillar foundations; road unchanged.
 return {parts:provence?parts.map(p=>({...p,category:p.category.replace('italy-','france-')})):parts,groups:provence?groups.map(g=>({...g,kind:g.kind==='tuscan-town'?'provencal-village':'lavender-farm'})):groups,groundY:layout.groundY};
}
