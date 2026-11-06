import {Matrix4,Quaternion,Euler,Vector3} from 'three';
import {tuscanLandscape,landscapeSurface} from './tuscany-landscape.js';

const hash=n=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);};
const pose=(x,y,z,yaw=0)=>new Matrix4().compose(new Vector3(x,y,z),new Quaternion().setFromEuler(new Euler(0,yaw,0)),new Vector3(1,1,1));

// The existing Tuscany venue gets a continuous, connected layer of human
// scale detail. All additions are opaque recipe parts shared with the camera
// director. This function never touches road samples, physics or saved poses.
export function appendTuscanEventDetail({samples,terrain,parts,groups}){
 const plan=tuscanLandscape(samples),surface=landscapeSurface(parts.filter(p=>p.kind==='hill'),terrain);
 const add=(m,kind,p,size,material,category,rot=[0,0,0])=>parts.push({kind,size,material,category,matrix:m.clone().multiply(new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...rot)),new Vector3(1,1,1))).elements});
 const box=(m,p,size,material,category,rot)=>add(m,'box',p,size,material,category,rot);
 const cyl=(m,p,r,h,material,category,rot)=>add(m,'cylinder',p,[r,r,h,10],material,category,rot);
 const leaf=(m,p,size,material,seed)=>add(m,'canopy',p,[...size,seed],material,'italy-event-leaves');
 const beam=(m,a,b,r,material,category)=>{
  const va=new Vector3(...a),vb=new Vector3(...b),delta=vb.clone().sub(va),mid=va.clone().add(vb).multiplyScalar(.5);
  const local=new Matrix4().compose(mid,new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.clone().normalize()),new Vector3(1,1,1));
  parts.push({kind:'cylinder',size:[r*.82,r,delta.length(),7],material,category,matrix:m.clone().multiply(local).elements});
 };
 const clear=(x,z,r)=>plan.roadClear(x,z,r+1)&&plan.landmarkClear(x,z,r);
 const groundFrame=(m,x,z)=>{
  const p=new Vector3(x,0,z).applyMatrix4(m);
  return pose(p.x,surface(p.x,p.z),p.z,Math.atan2(m.elements[8],m.elements[0]));
 };
 const settlements=[...plan.sites,...plan.neighborhoods];
 const awayFromBuildings=(x,z,r)=>settlements.every(p=>Math.hypot(p.x-x,p.z-z)>Math.hypot(p.halfX,p.halfZ)*p.scale+r);
 const fern=(x,z,seed)=>{
  const y=surface(x,z),m=pose(x,y,z,hash(seed)*Math.PI*2),h=.30+hash(seed+1)*.30;
  for(let k=0;k<4;k++)leaf(m,[Math.sin(k*1.8)*.19,h*(.45+k*.13),Math.cos(k*1.8)*.19],[.30,.18,.25],k%2?'oliveLeaf':'vineShade',seed+k);
  if(hash(seed+2)>.55)for(let k=0;k<3;k++){
   const px=(k-1)*.16;cyl(m,[px,h+.06,0],.014,.25,'vine','italy-event-flower-stem');
   add(m,'sphere',[px,h+.19,0],[.075,.045,.075],k%2?'spectatorGold':'flower','italy-event-flower');
  }
 };
 const barrel=(m,x,z)=>{
  m=groundFrame(m,x,z);x=0;z=0;
  cyl(m,[x,.40,z],.29,.8,'wood','italy-event-barrel');
  for(const y of [.13,.67])cyl(m,[x,y,z],.303,.06,'iron','italy-event-barrel-band');
  cyl(m,[x,.81,z],.27,.035,'wood','italy-event-barrel-lid');
  for(let j=0;j<8;j++)box(m,[x+Math.cos(j*Math.PI/4)*.292,.40,z+Math.sin(j*Math.PI/4)*.292],[.015,.68,.035],'wood','italy-event-barrel-stave',[0,-j*Math.PI/4,0]);
 };
 const crate=(m,x,y,z)=>{
  for(const dz of [-.32,.32])for(let row=0;row<3;row++)box(m,[x,y+.09+row*.14,z+dz],[.82,.11,.05],'wood','italy-event-crate');
  for(const dx of [-.38,.38])for(let row=0;row<3;row++)box(m,[x+dx,y+.09+row*.14,z],[.05,.11,.65],'wood','italy-event-crate');
  for(const dx of [-.35,.35])for(const dz of [-.29,.29])box(m,[x+dx,y+.24,z+dz],[.065,.48,.065],'wood','italy-event-crate-corner');
  for(let k=0;k<5;k++)add(m,'sphere',[x-.25+(k%3)*.23,y+.34,z-.15+Math.floor(k/3)*.27],[.11,.10,.11],k%2?'red':'spectatorGold','italy-event-produce');
 };
 const planter=(m,x,z)=>{
  m=groundFrame(m,x,z);x=0;z=0;
  add(m,'cylinder',[x,.25,z],[.29,.22,.5,12],'terracotta','italy-event-pot');
  cyl(m,[x,.49,z],.31,.085,'terracotta','italy-event-pot-rim');
  cyl(m,[x,.53,z],.26,.025,'soil','italy-event-pot-soil');
  for(let k=0;k<4;k++)leaf(m,[x+Math.sin(k*2)*.18,.77,z+Math.cos(k*2)*.18],[.25,.24,.24],k%2?'oliveLeaf':'vine',x+z+k);
 };

 // Continuous ground-attached verge detail. The varying bands form patches,
 // not evenly spaced lone trees, and leave a generous clear racing corridor.
 let next=10,vergeGroups=0;
 for(const s of samples){
  if(s.u<next||s.gap||s.u>samples.at(-1).u-10)continue;next=s.u+4.8;
  for(const side of [-1,1]){
   const seed=s.u*3.7+side*19,off=(s.w??2.1)+3.1+hash(seed)*1.2,x=s.p[0]+s.r[0]*side*off,z=s.p[2]+s.r[2]*side*off;
   if(!clear(x,z,1.0)||!awayFromBuildings(x,z,1.2))continue;
   const y=surface(x,z);
   // Clipped stone edging, little rocks and wild plants meet the actual
   // rendered earth rather than floating beside the elevated road.
   groups.push({kind:'event-verge',x,y,z,u:s.u,side,radius:1.0});vergeGroups++;
   fern(x,z,seed);
   for(let k=0;k<3;k++){
    const dx=(hash(seed+k+5)-.5)*1.3,dz=(hash(seed+k+9)-.5)*1.3,px=x+dx,pz=z+dz;
    if(!clear(px,pz,.38))continue;
    add(pose(px,surface(px,pz)+.09,pz),'canopy',[0,0,0],[.20,.13,.16,seed+k],'gravel','italy-event-verge-stone');
   }
  }
 }

 // Market/pergola courts follow the whole race, not just the finish valley.
 // The complete footprint and local slope are admitted before any prop exists.
 let last=-100,courts=0;
 for(const s of samples){
  if(s.u<25||s.u<last+43||s.u>samples.at(-1).u-20||s.gap)continue;
  for(const side of [1,-1]){
   const off=(s.w??2.1)+11,x=s.p[0]+s.r[0]*side*off,z=s.p[2]+s.r[2]*side*off,r=5.3;
   if(!clear(x,z,r)||!awayFromBuildings(x,z,r)||groups.some(g=>['spectator-pavilion','venue-pit','venue-vineyard','event-court'].includes(g.kind)&&Math.hypot(x-g.x,z-g.z)<(g.kind==='venue-vineyard'?12:15)))continue;
   const yaw=-Math.atan2(s.t[2],s.t[0])+(side<0?Math.PI:0),m=pose(x,surface(x,z),z,yaw),points=[[-3,-2],[-3,2],[3,-2],[3,2]].map(([a,b])=>new Vector3(a,0,b).applyMatrix4(m));
   const hs=points.map(p=>surface(p.x,p.z));
   if(Math.max(...hs)-Math.min(...hs)>1.0||Math.abs(surface(x,z)-terrain.heightAt(x,z))>1)continue;
   groups.push({kind:'event-court',x,y:m.elements[13],z,u:s.u,side,radius:r});last=s.u;courts++;
   // Individually grounded pavers, separated by recessed joints.
   for(let ix=-5;ix<=5;ix++)for(let iz=-4;iz<=4;iz++){
    const p=new Vector3(ix*.64,0,iz*.64).applyMatrix4(m),py=surface(p.x,p.z);
    box(pose(p.x,py+.025,p.z,yaw),[0,0,0],[.61,.05,.61],(ix+iz)%4?'paving':'limestone','italy-event-court-paver');
   }
   // The court connects to the actual trackside verge; no isolated catalogue
   // pad. Every stepping stone follows the same surface as the surrounding soil.
   for(let t=3.0;t<7.5;t+=.65){
    const p=new Vector3(0,0,-t).applyMatrix4(m);if(!clear(p.x,p.z,.75))break;
    box(pose(p.x,surface(p.x,p.z)+.025,p.z,yaw),[0,0,0],[1.1,.05,.56],'paving','italy-event-court-path');
   }
   for(const lx of [-2.7,2.7])for(const lz of [-1.75,1.75]){
    const wp=new Vector3(lx,0,lz).applyMatrix4(m),base=surface(wp.x,wp.z),top=m.elements[13]+3.3,h=top-base;
    box(pose(wp.x,base+h/2,wp.z,yaw),[0,0,0],[.16,h,.16],'wood','italy-event-pergola-post');
    box(pose(wp.x,base+.08,wp.z,yaw),[0,0,0],[.48,.16,.48],'limestone','italy-event-pergola-foot');
    for(const y of [.2,2.9])box(m,[lx,y,lz],[.22,.10,.22],'brass','italy-event-post-collar');
   }
   for(const z of [-1.75,1.75])box(m,[0,3.18,z],[6.0,.24,.19],'wood','italy-event-pergola-beam');
   for(let k=0;k<15;k++)box(m,[-2.8+k*.4,3.36,0],[.16,.12,4.1],'wood','italy-event-pergola-rafter');
   // An inset canvas canopy has a visible frame and stays below the beams.
   for(let k=0;k<6;k++)box(m,[-2.5+k,3.14,0],[.98,.045,3.65],k%2?'canvas':'banner','italy-event-awning');
   box(m,[0,.93,.5],[4.8,.16,.85],'wood','italy-event-market-counter');
   for(const x of [-2.1,2.1]){
    const p=new Vector3(x,0,.5).applyMatrix4(m),base=surface(p.x,p.z),height=m.elements[13]+.87-base;
    box(pose(p.x,base+height/2,p.z,yaw),[0,0,0],[.13,height,.63],'wood','italy-event-market-leg');
   }
   for(const x of [-1.5,0,1.5])crate(m,x,1.01,.5);
   barrel(m,-2.2,-.9);barrel(m,-1.5,-1.0);planter(m,2.45,-1.1);planter(m,-2.45,1.8);
   // Carved gateway with genuinely open stone arch and inset voussoirs.
   const arch=groundFrame(m,0,-1.9);
   add(arch,'arch',[0,0,0],[2.5,2.75,.32,.30],'limestone','italy-event-arch');
   for(let k=0;k<9;k++){
    const a=(k+.5)*Math.PI/9;box(arch,[Math.cos(a)*1.1,1.5+Math.sin(a)*1.1,-.19],[.31,.27,.08],'cream','italy-event-arch-stone',[0,0,a-Math.PI/2]);
   }
   for(let k=0;k<13;k++)box(m,[-2.7+k*.45,2.82,.0],[.25,.28,.035],['green','white','red'][k%3],'italy-event-bunting',[0,0,(k%3-1)*.12]);
   // A compact row of glossy country marbles gives the venue life.
   for(let k=0;k<8;k++){
    const seat=groundFrame(m,-2.1+k*.60,2);box(seat,[0,.45,0],[.43,.9,.43],'wood','italy-event-seat');
    add(seat,'sphere',[0,1.15,0],[.25,.25,.25],['spectatorRed','spectatorWhite','spectatorBlue','spectatorGold'][k%4],'italy-event-spectator');
   }
   break;
  }
 }

 // Denser irregular olive groves on the previously empty inner slopes. Real
 // forked branches and clustered leaves replace sticks with one sphere each.
 let trees=0;
 const bounds=plan.bounds;
 for(let x=bounds.minX+9;x<bounds.maxX-9;x+=8.5)for(let z=bounds.minZ+9;z<bounds.maxZ-9;z+=8.5){
  const seed=x*2.13+z*.77,px=x+(hash(seed)-.5)*4,pz=z+(hash(seed+1)-.5)*4;
  const near=Math.min(...samples.map(s=>Math.hypot(px-s.p[0],pz-s.p[2])));
  if(near<10||near>52||hash(seed+2)<.27||!clear(px,pz,3)||!awayFromBuildings(px,pz,4)||groups.some(g=>['event-court','spectator-pavilion','venue-pit','venue-vineyard'].includes(g.kind)&&Math.hypot(px-g.x,pz-g.z)<(g.kind==='venue-pit'?20:10)))continue;
  const y=surface(px,pz),m=pose(px,y,pz,hash(seed+3)*6.28),h=3.6+hash(seed+4)*1.8;
  beam(m,[0,0,0],[.16,h*.57,.04],.16,'wood','italy-event-olive-trunk');
  for(let k=0;k<4;k++){
   const angle=k*Math.PI/2+hash(seed+k)*.5,ox=Math.cos(angle)*h*.19,oz=Math.sin(angle)*h*.19,top=h*(.70+hash(seed+k+11)*.10);
   beam(m,[.10,h*.38,0],[ox,top,oz],.085,'wood','italy-event-olive-branch');
   leaf(m,[ox,top,oz],[h*.23,h*.17,h*.22],k%2?'oliveLeaf':'vineShade',seed+k);
   leaf(m,[ox*.8,top+.4,oz*.8],[h*.17,h*.16,h*.16],k%2?'vineShade':'oliveLeaf',seed+k+31);
  }
  groups.push({kind:'event-olive',x:px,y,z:pz,radius:3});trees++;
 }
 groups.push({kind:'event-detail-summary',x:0,y:0,z:0,courts,vergeGroups,trees});
}
