import {Matrix4,Euler,Quaternion,Vector3} from 'three';
import {venueLayout} from './venue.js';
const pose=(p,yaw=0)=>new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(0,yaw,0)),new Vector3(1,1,1));
export const TUSCAN_VENUE_MATERIALS={
 hill:{color:'#4b6435',roughness:1},ridge:{color:'#4b6435',roughness:1},limestone:{color:'#b9ab8d',roughness:.9},cream:{color:'#e0cfaa',roughness:.88},ochre:{color:'#c5a27b',roughness:.9},
 wood:{color:'#967044',roughness:.67},iron:{color:'#364b43',roughness:.38,metalness:.55},brass:{color:'#b49349',roughness:.34,metalness:.68},
 pineCrown:{color:'#43684c',roughness:.98},pineShade:{color:'#385a40',roughness:.98},vineShade:{color:'#5b7043',roughness:.96},paving:{color:'#c8bc9c',roughness:.9},stoneJoint:{color:'#93896e',roughness:1},banner:{color:'#2f5545',roughness:.83},
 spectatorRed:{color:'#b93d37',roughness:.27,metalness:.04},spectatorBlue:{color:'#2d577f',roughness:.27,metalness:.04},spectatorGold:{color:'#e1b43d',roughness:.27,metalness:.04},spectatorWhite:{color:'#dedacb',roughness:.27},
};

// Extend the real regional recipe, using its exact terrain and route. All
// opaque pieces are returned to both merged rendering and camera ray checks.
export function appendTuscanVenue({samples,terrain,parts,groups,length}){
 const add=(m,kind,p,size,material,category,rot=[0,0,0])=>parts.push({kind,size,material,category,matrix:m.clone().multiply(new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...rot)),new Vector3(1,1,1))).elements});
 const box=(m,p,size,material,category)=>add(m,'box',p,size,material,category);
 const cylinder=(m,p,r,h,material,category)=>add(m,'cylinder',p,[r,r,h,10],material,category);
 const sphere=(m,p,r,material)=>add(m,'sphere',p,[r,r,r],material,'italy-venue-spectator');
 const roadClear=(x,z,r)=>samples.every(s=>Math.hypot(x-s.p[0],z-s.p[2])>r+(s.w??2.1)+1);
 const foundations=parts.filter(p=>p.category==='italy-town-foundation'||p.category==='italy-farm-foundation'||p.category==='italy-building');
 const buildingClear=(x,z,r)=>foundations.every(p=>Math.hypot(x-p.matrix[12],z-p.matrix[14])>r+Math.hypot(p.size[0],p.size[2])/2*Math.hypot(...p.matrix.slice(0,3)));

 // Real segmented coping and inset metal collars, following the same banking
 // as the road. They live outside the racing floor, never on top of a ball.
 let next=18;
 for(const s of samples){
  if(s.u<next||s.u>samples.at(-1).u-14||s.gap)continue;next=s.u+.95;
  if(samples.some(q=>q.gap&&Math.abs(q.u-s.u)<1.5))continue;
  const m=new Matrix4().makeBasis(new Vector3(...s.t),new Vector3(...s.n),new Vector3(...s.r));m.setPosition(new Vector3(...s.p));
  for(const side of [-1,1]){
   box(m,[0,.615,side*((s.w??2.1)+.18)],[.91,.10,.27],'paving','italy-venue-coping');
   if(Math.floor(s.u)%5===0){
    box(m,[0,.31,side*((s.w??2.1)+.19)],[.18,.64,.08],'iron','italy-venue-rail-collar');
    for(const y of [.12,.5])cylinder(m,[0,y,side*((s.w??2.1)+.25)],.045,.04,'brass','italy-venue-fastener');
   }
  }
 }

 // Terraced spectator pavilions at the lower sections. Ground-connected
 // legs and conservative whole-footprint clearance replace floating props.
 let last=-Infinity;
 for(const s of samples){
  if(s.u<samples.at(-1).u*.50||s.u<last+45||s.u>samples.at(-1).u-12||s.gap||Math.abs(s.curv)>.045)continue;
  for(const side of [1,-1]){
   const off=12.5,x=s.p[0]+side*s.r[0]*off,z=s.p[2]+side*s.r[2]*off,ground=terrain.heightAt(x,z),gap=s.p[1]-ground;
   if(gap>11||gap<1||!roadClear(x,z,7.8)||!buildingClear(x,z,8))continue;
   if(groups.some(g=>g.kind==='spectator-pavilion'&&Math.hypot(g.x-x,g.z-z)<35))continue;
   const yaw=-Math.atan2(s.t[2],s.t[0])+(side<0?Math.PI:0),floor=Math.min(s.p[1]-.65,ground+3),m=pose([x,floor,z],yaw);
   groups.push({kind:'spectator-pavilion',x,y:floor,z,u:s.u,side});last=s.u;
   box(m,[0,.05,0],[10,.24,5.8],'wood','italy-venue-deck');
   for(let row=0;row<4;row++){
    const y=.22+row*.6,z=-2+row*1.17;
    box(m,[0,y,z],[9.5,.17,1.08],'wood','italy-venue-terrace');
    box(m,[0,y+.32,z+.18],[9.15,.12,.38],'banner','italy-venue-bench');
    for(let col=0;col<16;col++){
     const colors=['spectatorRed','spectatorBlue','spectatorGold','spectatorWhite'],px=-4.2+col*.56;
     sphere(m,[px,y+.59,z+.18],.23,colors[(col+row*3)%colors.length]);
     box(m,[px,y+.59,z-.055],[.2,.1,.02],colors[(col+row*3+1)%colors.length],'italy-venue-spectator-badge');
    }
   }
   for(const lx of [-4.75,4.75])for(const lz of [-2.65,2.65]){
    const wp=new Vector3(lx,0,lz).applyMatrix4(m),base=terrain.heightAt(wp.x,wp.z),height=floor+5-base;
    const leg=pose([wp.x,base,wp.z],yaw);
    box(leg,[0,.12,0],[.8,.24,.8],'limestone','italy-venue-pavilion-foot');
    box(leg,[0,height/2,0],[.22,height,.22],'wood','italy-venue-pavilion-column');
    for(const y of [floor-base+.2,height-.25])box(leg,[0,y,0],[.31,.13,.31],'brass','italy-venue-column-collar');
   }
   for(const z of [-2.65,2.65])box(m,[0,4.6,z],[10.5,.25,.22],'wood','italy-venue-roof-beam');
   for(let j=0;j<18;j++)box(m,[-4.9+j*.58,4.82,0],[.54,.15,6.3],'wood','italy-venue-roof-plank');
   box(m,[0,4.25,-2.76],[9.7,.48,.08],'banner','italy-venue-banner');
   for(let j=0;j<18;j++){
    const c=['green','white','red'][j%3];box(m,[-4.6+j*.54,3.85,-2.76],[.34,.42,.035],c,'italy-venue-bunting');
   }
   for(const side of [-1,1]){
    box(m,[side*4.72,1.3,-.6],[.12,.12,3.8],'iron','italy-venue-handrail');
    for(const z of [-2.3,-1.1,.1,1.3])box(m,[side*4.72,.7,z],[.10,1.3,.10],'iron','italy-venue-handrail-post');
   }
   break;
  }
 }
 // Regional event dressing is grounded individually, not laid onto a large
 // flat plane. Low shrubs and paths keep sight-lines to racers open.
 for(const g of groups.filter(g=>g.kind==='tuscan-town'||g.kind==='vineyard-farm')){
  for(const side of [-1,1]){
   const x=g.x+side*9,z=g.z+7;if(!roadClear(x,z,2.5))continue;
   const lm=pose([x,terrain.heightAt(x,z),z]);
   cylinder(lm,[0,1.8,0],.065,3.6,'iron','italy-venue-lantern-pole');
   box(lm,[0,3.55,0],[.32,.42,.32],'brass','italy-venue-lantern');
   box(lm,[0,3.8,0],[.48,.08,.48],'iron','italy-venue-lantern-cap');
  }
 }

 // Keep the existing pit building and its established footprint. Articulate
 // its facade with actual stone piers, recessed timber doors and tile courses.
 const pit=Number.isFinite(length)?venueLayout(samples,length).pit:null;
 if(pit){
  const m=pose(pit.base,pit.yaw+(pit.side>0?Math.PI:0));
  groups.push({kind:'venue-pit',x:pit.base[0],y:pit.base[1],z:pit.base[2]});
  for(const z of [-3.55,3.55]){
   box(m,[0,.2,z],[26.45,.4,.28],'limestone','italy-venue-pit-plinth');
   box(m,[0,2.65,z],[26.45,.22,.35],'cream','italy-venue-pit-cornice');
   box(m,[0,3.15,z],[26.9,.2,.4],'limestone','italy-venue-pit-cornice');
   for(let k=0;k<8;k++)box(m,[-11.9+k*3.4,1.45,z],[.38,2.6,.36],'ochre','italy-venue-pit-pier');
  }
  for(let k=0;k<7;k++){
   const x=(k-3)*3.4;
   for(let j=0;j<9;j++)box(m,[x-1.16+j*.29,1.25,3.535],[.26,2.15,.045],'wood','italy-venue-pit-door-plank');
   for(const y of [.48,2])box(m,[x,y,3.58],[2.55,.075,.05],'iron','italy-venue-pit-door-brace');
   for(const dx of [-.12,.12])box(m,[x+dx,1.22,3.62],[.045,.23,.06],'brass','italy-venue-pit-door-handle');
   box(m,[x,2.43,3.56],[2.95,.18,.3],'limestone','italy-venue-pit-lintel');
  }
  // Shallow roof tiles sit on the old roof; no new floor or racing collider.
  for(let row=0;row<8;row++)for(let col=0;col<56;col++){
   box(m,[-13+col*.47,3.465+(row%2)*.015,-3.34+row*.94],[.45,.08,.92],(col+row)%3?'roof':'tile','italy-venue-pit-tile');
  }
 }

 // Cultivated land, not random props: whole plots are clear of the circuit
 // and architecture, and every trunk, trellis and canopy meets real relief.
 const xs=samples.map(s=>s.p[0]),zs=samples.map(s=>s.p[2]);
 const minX=Math.floor((Math.min(...xs)-30)/19)*19,maxX=Math.max(...xs)+30;
 const minZ=Math.floor((Math.min(...zs)-30)/19)*19,maxZ=Math.max(...zs)+30;
 let plots=0;
 for(let x=minX;x<maxX;x+=19)for(let z=minZ;z<maxZ;z+=19){
  if(plots>=35||!roadClear(x,z,7)||!buildingClear(x,z,7))continue;
  if(Math.min(...samples.map(s=>Math.hypot(x-s.p[0],z-s.p[2])))>48)continue;
  if(groups.some(g=>['spectator-pavilion','venue-pit'].includes(g.kind)&&Math.hypot(x-g.x,z-g.z)<18))continue;
  const heights=[[-4,-6],[4,-6],[-4,6],[4,6]].map(([dx,dz])=>terrain.heightAt(x+dx,z+dz));
  if(Math.max(...heights)-Math.min(...heights)>5)continue;
  groups.push({kind:'venue-vineyard',x,y:terrain.heightAt(x,z),z});plots++;
  for(let row=0;row<4;row++)for(let j=0;j<9;j++){
   const px=x-3.9+row*2.6,pz=z-6+j*1.5,ground=terrain.heightAt(px,pz),m=pose([px,ground,pz]);
   cylinder(m,[0,.52,0],.055,1.04,'wood','italy-venue-vine-trunk');
   // A trellised leaf mass with deterministic uneven lobes, not identical
   // topiary balls. All lobes remain inside the old whole-plant clearance.
   const phase=px*1.73+pz*.91;
   for(let lobe=0;lobe<3;lobe++){
    const leaf=.92+.08*Math.sin(phase+lobe*2.3),dz=(lobe-1)*.34;
    add(m,'sphere',[.10*Math.sin(phase+lobe*1.9),.95+.10*Math.cos(phase+lobe*2.1),dz],[.40*leaf,.27*leaf,.36],lobe===1?'vine':'vineShade','italy-venue-vine-canopy');
   }
   if(j%4===0){
    box(m,[.35,.66,0],[.09,1.32,.10],'wood','italy-venue-trellis');
    box(m,[0,.82,0],[1.02,.045,.05],'wood','italy-venue-trellis');
   }
  }
 }
}
