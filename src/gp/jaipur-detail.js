import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {roadClearanceVolumes,sceneryBoxClearsRoad} from './scenery-road-clearance.js';
import {pointInFrame,TRACK} from './trackMesh.js';

const pose=(p,r=[0,0,0])=>new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(1,1,1));

// Construction and dressing on the established Jaipur recipe. Every opaque
// piece is returned to the same merged renderer AND live/replay ray queries.
export function jaipurDetail(parts,groups,samples,terrain,layout){
 const add=(m,kind,p,size,material,category,r=[0,0,0])=>parts.push({kind,size,material,category:'india-'+category,matrix:m.clone().multiply(pose(p,r)).elements});
 const box=(m,p,size,material,category,r)=>add(m,'box',p,size,material,category,r);
 const cylinder=(m,p,rt,rb,h,material,category)=>add(m,'cylinder',p,[rt,rb,h,12],material,category);
 const pot=(m,x,z,i)=>{
  cylinder(m,[x,.28,z],.28,.18,.56,'terracotta','pottery-body');
  cylinder(m,[x,.55,z],.31,.31,.09,'terracotta','pottery-rim');
  cylinder(m,[x,.60,z],.23,.23,.025,'soil','pottery-soil');
  for(let k=0;k<3;k++)add(m,'canopy',[x+Math.cos(k*2.1)*.15,.84+(k%2)*.12,z+Math.sin(k*2.1)*.15],[.27,.3,.23,i+k],'leaf','potted-leaf');
 };
 const tree=(x,z,i)=>{
  const m=pose([x,terrain.heightAt(x,z)-.12,z]),h=3.5+(i%3)*.45;
  cylinder(m,[0,h/2,0],.09,.22,h,'wood','neem-trunk');
  for(let k=0;k<4;k++){
   const a=k*Math.PI/2+i*.4,dx=Math.cos(a),dz=Math.sin(a);
   box(m,[dx*.42,h-.3,dz*.42],[.13,1.1,.13],'wood','neem-branch',[dz*.6,0,-dx*.6]);
   add(m,'canopy',[dx*.9,h+.2+(k%2)*.2,dz*.9],[1.3,.63,1.15,i+k],'leaf','neem-crown');
  }
 };
 const balustrade=(m,x,y,z,w)=>{
  for(const dy of [0,.69])box(m,[x,y+dy,z],[w,.12,.19],'cream','balcony-rail');
  const n=Math.ceil(w/.25);
  for(let k=0;k<n;k++){
   const xx=x-w/2+(k+.5)*w/n;
   cylinder(m,[xx,y+.33,z],.043,.064,.6,'cream','turned-baluster');
   cylinder(m,[xx,y+.29,z],.083,.083,.11,'cream','baluster-collar');
  }
 };
 const facade=(m,x,z,w,h,levels)=>{
  // Recessed timber shutters, projecting brackets and carved screens make
  // the existing facade readable obliquely, rather than adding flat decals.
  for(let level=0;level<levels;level++){
   const y=1.4+level*2.5;
   // Side and rear elevations are real camera-facing assets too. Recesses,
   // timber leaves and deep stone arches avoid large featureless wall boxes.
   const elevations=[{origin:[x,y,z-2.58],yaw:Math.PI,count:3,pitch:w*.28},{origin:[x-w/2-.08,y,z],yaw:-Math.PI/2,count:2,pitch:2.3},{origin:[x+w/2+.08,y,z],yaw:Math.PI/2,count:2,pitch:2.3}];
   for(const e of elevations){
    const wall=m.clone().multiply(pose(e.origin,[0,e.yaw,0]));
    for(let j=0;j<e.count;j++){
     const xx=(j-(e.count-1)/2)*e.pitch;
     box(wall,[xx,0,0],[.89,1.32,.12],'dark','side-window-recess');
     for(const side of [-1,1])box(wall,[xx+side*.22,0,.10],[.38,1.18,.08],'wood','side-window-shutter');
     add(wall,'arch',[xx,-.70,.17],[1.15,1.64,.15,.12],'cream','side-window-arch');
     box(wall,[xx,-.74,.16],[1.25,.14,.35],'cream','side-window-sill');
    }
   }
   for(let k=0;k<3;k++){
    const xx=x+(k-1)*w*.28;
    balustrade(m,xx,y-.74,z+3.02,1.44);
    for(const side of [-1,1]){
     box(m,[xx+side*.38,y,z+2.64],[.17,1.22,.10],'wood','window-shutter');
     for(const dy of [-.49,.49])box(m,[xx+side*.46,y+dy,z+2.75],[.08,.08,.05],'brass','shutter-hinge');
     box(m,[xx+side*.55,y-.98,z+2.72],[.13,.38,.31],'rose','chajja-bracket',[.38,0,side*.22]);
    }
    for(let j=0;j<7;j++){
     const t=(j-3)*.125;
     // Short diagonal bars lie wholly inside the existing window opening.
     box(m,[xx+t,y,z+2.70],[.032,.71,.04],'cream','jali-diagonal',[0,0,.48]);
    }
   }
   for(const dz of [2.66,-2.66]){
    box(m,[x,y+1.17,z+dz],[w+.38,.09,.24],'rose','cornice-shadow');
    for(let k=0;k<Math.floor(w/.40);k++)box(m,[x-w/2+.2+k*.4,y+1.03,z+dz],[.13,.16,.19],'cream','cornice-dentil');
   }
  }
  box(m,[x,h+.31,z-2.6],[w+.4,.44,.22],'rose','rear-parapet');
  for(const side of [-1,1])box(m,[x+side*(w/2+.1),h+.31,z],[.22,.44,5.4],'rose','side-parapet');
  cylinder(m,[x-w*.3,h+.72,z-.7],.33,.43,.8,'terracotta','roof-vessel');
 };
 const market=(m,x,z,i)=>{
  // Sloped striped fabric, a scalloped edge, tie bars and visible stock.
  for(let k=0;k<10;k++){
   box(m,[x-1.8+k*.4,2.12,z],[.395,.065,2.85],(k+i)%2?'saffron':'canvas','awning-stripe',[-.13,0,0]);
   add(m,'sphere',[x-1.8+k*.4,1.78,z+1.43],[.19,.20,.045],(k+i)%2?'saffron':'canvas','awning-scallop');
  }
  box(m,[x,2.02,z+1.25],[3.9,.08,.08],'wood','awning-crossbar');
  for(const dx of [-1.8,1.8])box(m,[x+dx,1,z+1.25],[.09,2,.09],'wood','awning-front-post');
  for(let k=0;k<4;k++){
   const xx=x-1.35+k*.9;
   box(m,[xx,1.35,z],[.80,.16,.74],'wood','spice-tray');
   add(m,'dome',[xx,1.44,z],[.32,.23,12],['spice-gold','spice-red','spice-olive','cream'][(k+i)%4],'spice-mound');
   for(const dx of [-.39,.39])box(m,[xx+dx,1.42,z],[.045,.18,.78],'wood','crate-side');
  }
  for(let k=0;k<3;k++)box(m,[x-1.05+k*1.05,.36,z+1.08],[.85,.09,.5],k%2?'teal':'saffron','folded-textile');
  pot(m,x+2.3,z+1.1,i);
 };
 for(const [i,s]of groups.entries()){
  const m=pose([s.x,s.y,s.z],[0,s.rotY,0]);
  if(s.kind==='jaipur-castle'||s.kind==='jaipur-abbey'){
   for(let j=0;j<5;j++)facade(m,(j-2)*5.8,-3,5.8,8.2,3);
   // Gateway has real depth and an open throat, not a solid scenic panel.
   for(const z of [5.5,6.25])add(m,'arch',[0,0,z],[5,6,.24,.17],'cream','gateway-inner-order');
   for(const x of [-3.2,3.2]){
    box(m,[x,1.9,6],[.34,3.8,.38],'pink','gate-pilaster');
    for(const y of [.22,3.8])box(m,[x,y,6],[.58,.24,.65],'cream','pilaster-capital');
   }
   for(const x of [-14,0,14])balustrade(m,x,8.64,-1.25,2.5);
   for(const x of [-8,8])for(let k=0;k<3;k++)pot(m,x+(k-1)*1.4,10.3,i+k);
  }else if(s.kind==='jaipur-village'){
   for(let j=0;j<5;j++)facade(m,(j%3-1)*8,j<3?-5:5,6,5.6+(j%2)*2.5,j%2?3:2);
   for(let j=0;j<4;j++)market(m,-10+j*6,9,i+j);
   // Interlocking rugs and edge stitching remain opaque, above the paving.
   for(let j=0;j<3;j++){
    const x=-9+j*7.5,z=.7;
    box(m,[x,.072,z],[3.9,.04,2.4],j%2?'teal':'textile-red','courtyard-rug');
    for(const side of [-1,1])box(m,[x+side*1.77,.095,z],[.13,.012,2.15],'canvas','rug-border');
    for(let k=0;k<7;k++)box(m,[x-1.6+k*.52,.096,z],[.18,.012,.65],'spice-gold','rug-motif',[0,Math.PI/4,0]);
   }
  }else{
   // Defined garden paths, stone edging and ceramic planters replace empty
   // paving between the existing neem-inspired crowns and flower beds.
   for(const z of [-2.5,2.5])box(m,[0,.085,z],[18.6,.11,.65],'cream','garden-path');
   for(const x of [-9,9])for(const z of [-7.7,0,7.7])pot(m,x,z,i);
  }
  // Low perimeter wall: foundation is already terrain-graded. No broad water.
  for(const side of [-1,1]){
   const z=side*(s.halfZ-.45),segments=Math.floor(2*s.halfX/3.2);
   for(let k=0;k<segments;k++){
    const x=-s.halfX+.6+k*3.2;
    if(side===1&&Math.abs(x)<4.5)continue;
    box(m,[x,.47,z],[2.9,.82,.26],'pink','court-boundary');
    box(m,[x,.91,z],[3.05,.12,.38],'cream','court-coping');
    cylinder(m,[x-1.46,.70,z],.14,.14,1.4,'sandstone','court-pier');
    add(m,'dome',[x-1.46,1.40,z],[.20,.18,12],'cream','court-pier-cap');
   }
  }
  // A planted edge links each courtyard to its hillside. Reuse deterministic
  // terrain placement, not trees floating on a single flat ground plane.
  for(let k=0;k<6;k++){
   const x=(k%2?1:-1)*(s.halfX+4+(k%3)),z=(Math.floor(k/2)-1)*(s.halfZ*.9);
   const p=new Vector3(x,0,z).applyMatrix4(m);
   if(layout.clear(p.x,p.z,2.5)&&!groups.some(g=>g!==s&&Math.hypot(g.x-p.x,g.z-p.z)<Math.hypot(g.halfX,g.halfZ)+3))tree(p.x,p.z,i+k);
  }
 }
 // Broken, layered sandstone on the cut slopes gives the course a physical
 // setting between the authored settlements. Exact irregular rock triangles
 // already belong to the shared scenery/camera geometry infrastructure.
 for(let i=90;i<samples.length-100;i+=94){
  const s=samples[i],side=i%3?-1:1,d=15+(i%5)*2,x=s.p[0]+s.r[0]*side*d,z=s.p[2]+s.r[2]*side*d;
  if(!layout.clear(x,z,5)||groups.some(g=>Math.hypot(g.x-x,g.z-z)<Math.hypot(g.halfX,g.halfZ)+7))continue;
  const y=terrain.heightAt(x,z),m=pose([x,y-.3,z],[0,i*.13,0]);
  for(let k=0;k<3;k++)add(m,'rock-ridge',[(k-1)*1.6,k*.14,Math.sin(k+i)*.7],[1.9+k*.28,1.1+k*.4,1.4+k*.17,i+k],'rock','sandstone-outcrop');
  tree(x+3.8,z-2.5,i);
 }
 // Low Aravalli-inspired ridgelines frame long shots; they never occupy the
 // course footprint or replace the continuous audited terrain beneath it.
 const xs=samples.map(s=>s.p[0]),zs=samples.map(s=>s.p[2]),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2;
 const rx=(Math.max(...xs)-Math.min(...xs))/2,rz=(Math.max(...zs)-Math.min(...zs))/2;
 for(let k=0;k<11;k++){
  const a=.2+k*Math.PI*2/11,x=cx+Math.cos(a)*(rx+130),z=cz+Math.sin(a)*(rz+140),r=42+(k%3)*11;
  if(!layout.clear(x,z,r*1.6))continue;
  const base=Math.min(...Array.from({length:12},(_,j)=>terrain.heightAt(x+Math.cos(j*Math.PI/6)*r,z+Math.sin(j*Math.PI/6)*r)))-4;
  add(pose([x,base,z],[0,k*.23,0]),'rock-ridge',[0,0,0],[r,30+(k%4)*7,r*.72,k+170],'ridge','aravalli-ridge');
 }
 // Near-road details use actual all-road clearance and grade at every foot;
 // no props on racing surfaces and no support through a lower crossing.
 const road=roadClearanceVolumes(samples);
 for(let i=60;i<samples.length-60;i+=52){
  const s=samples[i];
  for(const side of [-1,1]){
   const x=s.p[0]+s.r[0]*side*9.5,z=s.p[2]+s.r[2]*side*9.5;
   if(!layout.clear(x,z,1.9)||groups.some(g=>Math.hypot(g.x-x,g.z-z)<Math.hypot(g.halfX,g.halfZ)+5))continue;
   const first=parts.length,ground=terrain.heightAt(x,z),m=pose([x,ground-.1,z],[0,Math.atan2(s.t[0],s.t[2]),0]);
   cylinder(m,[0,.22,0],.38,.48,.48,'sandstone','verge-lamp-base');
   cylinder(m,[0,1.65,0],.055,.085,2.9,'brass','verge-lamp-stem');
   cylinder(m,[0,3.09,0],.24,.24,.10,'brass','lantern-base');
   box(m,[0,3.40,0],[.27,.54,.27],'lantern','lantern-glass');
   for(const dx of [-.18,.18])for(const dz of [-.18,.18])box(m,[dx,3.4,dz],[.035,.6,.035],'brass','lantern-frame');
   add(m,'dome',[0,3.70,0],[.29,.21,12],'brass','lantern-cap');
   pot(m,1.1,.3,i);
   if(parts.slice(first).some(p=>p.kind==='box'&&!sceneryBoxClearsRoad(p,road)))parts.splice(first);
  }
 }
 let last=-Infinity;
 for(const s of samples){
  if(s.u-last<28||s.gap||samples.some(q=>q.gap&&Math.abs(q.u-s.u)<2))continue;
  const bottom=pointInFrame(s,0,-TRACK.wall-.14),[x,top,z]=bottom,foot=terrain.heightAt(x,z)-.2,h=top-foot;
  if(h<1.5)continue;
  const first=parts.length,m=pose([x,foot,z],[0,Math.atan2(s.t[0],s.t[2]),0]);
  box(m,[0,(h-.7)/2,0],[1.2,h-.7,1.8],'sandstone','viaduct-pier');
  box(m,[0,.22,0],[2.0,.44,2.6],'cream','viaduct-foot');
  const cap=new Matrix4().makeBasis(new Vector3(...s.t),new Vector3(...s.n),new Vector3(...s.r));
  cap.setPosition(new Vector3(...bottom).addScaledVector(new Vector3(...s.n),-.35));
  box(cap,[0,0,0],[2.8,.7,2*(s.w??2.1)],'cream','viaduct-cap');
  for(const y of [h*.30,h*.65])box(m,[0,y,0],[1.28,.16,1.88],'rose','pier-band');
  if(parts.slice(first).some(p=>!sceneryBoxClearsRoad(p,road)))parts.splice(first);
  else last=s.u;
 }
}
