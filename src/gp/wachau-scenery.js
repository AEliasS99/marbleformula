import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import {italianTerrain} from './italy-terrain.js';
import {WACHAU_PROFILE,wachauLayout} from './wachau-layout.js';
import {roadClearanceVolumes,sceneryBoxClearsRoad} from './scenery-road-clearance.js';
import {pointInFrame,TRACK} from './trackMesh.js';
const pose=(p,r=[0,0,0])=>new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(1,1,1));
export const WACHAU_MATERIALS={
 limestone:{color:'#b8b4a3',roughness:.96},cream:{color:'#eadfc3',roughness:.91},
 ochre:{color:'#d9b46d',roughness:.94},rose:{color:'#c9a28d',roughness:.93},
 roof:{color:'#944f3b',roughness:.91},copper:{color:'#60837a',roughness:.72,metalness:.25},
 wood:{color:'#67533e',roughness:.94},glass:{color:'#6c929a',roughness:.31,metalness:.12},
 iron:{color:'#384945',roughness:.67,metalness:.22},leaf:{color:'#507546',roughness:1},
 vine:{color:'#66824a',roughness:1},fruit:{color:'#d9994b',roughness:.9},
 soil:{color:'#8b7c58',roughness:1},hill:{color:'#7f9169',roughness:1},
 ridge:{color:'#718563',roughness:1},water:{color:'#447e83',roughness:.24,metalness:.16},
};
const cache=new WeakMap();
export function wachauScenery(samples,{length}={}){
 if(!(Number.isFinite(length)&&length>0))throw Error('Wachau scenery needs actual course length');
 if(cache.get(samples)?.length===length)return cache.get(samples).recipe;
 const terrain=italianTerrain(samples,{profile:WACHAU_PROFILE,length}),layout=wachauLayout(samples),parts=[],groups=[];
 const add=(m,kind,p,size,material,category,rotation=[0,0,0])=>parts.push({kind,size,material,category:'austria-'+category,matrix:m.clone().multiply(pose(p,rotation)).elements});
 const box=(m,p,size,material,category,rotation)=>add(m,'box',p,size,material,category,rotation);
 const cylinder=(m,p,r0,r1,h,material,category,sides=12)=>add(m,'cylinder',p,[r0,r1,h,sides],material,category);
 const tree=(m,x,z,i)=>{
  const h=4.1+(i%4)*.35;cylinder(m,[x,h*.3,z],.12,.22,h*.6,'wood','orchard-trunk');
  for(const [dx,dy,dz,r]of [[0,.72,0,1],[-.8,.58,.15,.7],[.65,.62,-.3,.76]])add(m,'canopy',[x+dx,h*dy,z+dz],[1.55*r,1.4*r,1.5*r,i],'leaf','orchard-crown');
  for(let k=0;k<4;k++)add(m,'sphere',[x+Math.cos(k*1.7+i)*1.1,h*.68+(k%2)*.35,z+Math.sin(k*1.7+i)*1.1],[.09,.1,.09],'fruit','apricot');
 };
 const house=(m,x,z,i)=>{
  const w=5.4,d=6,h=4.8+(i%3)*.45,material=['cream','ochre','rose'][i%3];
  box(m,[x,h/2,z],[w,h,d],material,'building');
  box(m,[x,.38,z],[w+.18,.76,d+.18],'limestone','building-plinth');
  for(const side of [-1,1]){
   box(m,[x+side*1.42,h+.95,z],[3.5,.22,d+.55],'roof','roof',[0,0,-side*.57]);
   box(m,[x,h-.12,z+side*(d/2+.1)],[w+.35,.24,.3],'cream','cornice');
   for(const dx of [-1.6,0,1.6])for(const y of [1.7,3.7]){
    box(m,[x+dx,y,z+side*(d/2+.08)],[.94,1.16,.16],'cream','window-trim');
    box(m,[x+dx,y,z+side*(d/2+.18)],[.64,.88,.06],'glass','window');
    box(m,[x+dx,y,z+side*(d/2+.22)],[.06,.9,.06],'wood','window-mullion');
   }
  }
  box(m,[x-1.6,.95,z+d/2+.25],[.82,1.9,.16],'wood','door');
  box(m,[x+1.4,h+1.1,z-1.5],[.65,1.8,.7],'cream','chimney');
 };
 for(const [i,site]of layout.sites.entries()){
  const {x,z,rotY,halfX,halfZ,kind}=site,y=terrain.heightAt(x,z),m=pose([x,y,z],[0,rotY,0]);
  groups.push({...site,y,kind:'wachau-'+kind});
  if(kind==='orchard'){
   for(let row=0;row<3;row++)for(let col=0;col<4;col++)tree(m,-7.2+col*4.8,-5+row*5,i+row+col);
  }else if(kind==='terrace'){
   // Closely fitted retaining walls and soil beds make real terraces, not
   // floating stripes; the lowest step is embedded into the graded land.
   for(let row=0;row<4;row++){
    const zz=-6+row*4,h=.8+row*.55;
    box(m,[0,h/2,zz],[19,h,3.7],'soil','terrace-bed');
    box(m,[0,h/2,zz+1.85],[19.5,h+.12,.45],'limestone','terrace-wall');
    box(m,[0,h+.15,zz+1.85],[19.7,.18,.58],'limestone','terrace-coping');
    for(let col=0;col<7;col++){
     const xx=-8+col*2.65;box(m,[xx,h+.66,zz],[.13,1.32,.13],'wood','trellis-post');
     add(m,'canopy',[xx,h+.85,zz],[.95,.35,.55,i+col],'vine','vine');
    }
    for(const yy of [.45,.95])box(m,[0,h+yy,zz],[18,.035,.035],'iron','trellis-wire');
   }
  }else{
   box(m,[0,.1,0],[halfX*2,1.2,halfZ*2],'limestone','settlement-foundation');
   const base=m.clone().multiply(pose([0,.7,0]));
   if(kind==='village'){
    for(let j=0;j<5;j++)house(base,(j%3-1)*8.2,j<3?-5.2:4.5,i+j);
    box(base,[9,.5,7],[3,1,3],'limestone','fountain-base');
    add(base,'basin',[9,1,7],[1.2,.7,24],'limestone','fountain-basin');
    cylinder(base,[9,1.7,7],.16,.22,1.6,'limestone','fountain-column');
   }else if(kind==='castle'){
    box(base,[0,3.3,0],[24,6.6,18],'limestone','castle-wall');
    box(base,[0,6.7,0],[23.2,.4,17.2],'soil','castle-court');
    for(const xx of [-11,11])for(const zz of [-8,8]){
     cylinder(base,[xx,5.2,zz],2.3,2.55,10.4,'limestone','castle-tower',16);
     for(let k=0;k<10;k++){const a=k*Math.PI/5;box(base,[xx+Math.cos(a)*2,10.8,zz+Math.sin(a)*2],[.7,1,.7],'limestone','castle-crenel');}
    }
    add(base,'arch',[0,0,9.1],[4.2,4.6,.5,.5],'cream','castle-arch');
    box(base,[0,1.8,9.3],[2.8,3.6,.15],'wood','castle-gate');
   }else{
    box(base,[0,4,-2],[22,8,13],'ochre','abbey-building');
    for(const side of [-1,1]){
     box(base,[side*5.5,9.5,-2],[12.7,.3,14.5],'roof','abbey-roof',[0,0,-side*.3]);
     box(base,[side*11,7,7],[5,14,5],'cream','abbey-tower');
     add(base,'dome',[side*11,14,7],[2.7,4,24],'copper','abbey-dome');
     cylinder(base,[side*11,18.6,7],.08,.17,1.4,'iron','abbey-spire');
     for(let floor=0;floor<3;floor++)add(base,'arch',[side*11,2+floor*3.6,9.6],[1.7,2.7,.22,.22],'limestone','abbey-window-arch');
    }
    for(const xx of [-7,-3.5,0,3.5,7]){
     add(base,'arch',[xx,1,4.7],[2.5,4.5,.3,.3],'cream','abbey-arcade');
     box(base,[xx,6.6,4.6],[1.3,1.5,.15],'glass','abbey-window');
    }
   }
  }
 }
 // The bounded river is entirely outside the route's plan footprint.
 const {points,halfWidth,waterY}=layout.river;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),yaw=Math.atan2(b[0]-a[0],b[1]-a[1]);
  const m=pose([(a[0]+b[0])/2,waterY,(a[1]+b[1])/2],[0,yaw,0]);
  box(m,[0,-.12,0],[halfWidth*2,.24,len+.4],'water','river');
 }
 // Low, grounded coping gives near cameras construction detail without
 // filling the racing line with large props. Nearby settlement pads stay free.
 for(let i=65;i<samples.length-70;i+=38){const s=samples[i];for(const side of [-1,1]){
  const x=s.p[0]+s.r[0]*side*9.8,z=s.p[2]+s.r[2]*side*9.8;
  if(!layout.clear(x,z,2)||layout.sites.some(p=>Math.hypot(p.x-x,p.z-z)<Math.hypot(p.halfX,p.halfZ)+6))continue;
  const ends=[-2.4,0,2.4].map(d=>terrain.heightAt(x+s.t[0]*d,z+s.t[2]*d));
  const foot=Math.min(...ends)-.35,h=Math.max(...ends)+.8-foot;
  const m=pose([x,foot,z],[0,Math.atan2(s.t[0],s.t[2]),0]);
  box(m,[0,h/2,0],[.55,h,4.6],'limestone','verge-wall');
  box(m,[0,h+.03,0],[.7,.18,4.8],'limestone','verge-coping');
 }}
 const xs=samples.map(s=>s.p[0]),zs=samples.map(s=>s.p[2]);
 const cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2;
 const rx=(Math.max(...xs)-Math.min(...xs))/2,rz=(Math.max(...zs)-Math.min(...zs))/2;
 for(let i=0;i<9;i++){
  const angle=.1+i/8*Math.PI*.9,x=cx+Math.cos(angle)*(rx+180),z=cz+Math.sin(angle)*(rz+185),r=85+i%3*18;
  if(!layout.clear(x,z,r+8))continue;
  const base=Math.min(...Array.from({length:9},(_,k)=>terrain.heightAt(x+Math.cos(k/8*Math.PI*2)*r,z+Math.sin(k/8*Math.PI*2)*r)))-1;
  add(pose([x,base,z]),'hill',[0,0,0],[r,38+i%4*11,r*.85],'ridge','valley-ridge');
 }
 // Shared support construction follows the banked underside and actual ground.
 const roadVolumes=roadClearanceVolumes(samples);
 let last=-Infinity;
 for(const s of samples){
  if(s.u-last<35||s.gap||samples.some(q=>q.gap&&Math.abs(q.u-s.u)<2))continue;
  const bottom=pointInFrame(s,0,-TRACK.wall-.14),[x,top,z]=bottom,foot=terrain.heightAt(x,z)-.2,h=top-foot;
  if(h<1.4)continue;
  const firstPart=parts.length;
  const m=pose([x,foot,z],[0,Math.atan2(s.t[0],s.t[2]),0]),width=h>15?2.6:1.2,depth=h>15?3.2:1.8;
  box(m,[0,(h-.7)/2,0],[width,h-.7,depth],'limestone','viaduct-pier');
  const cap=new Matrix4().makeBasis(new Vector3(...s.t),new Vector3(...s.n),new Vector3(...s.r));
  cap.setPosition(new Vector3(...bottom).addScaledVector(new Vector3(...s.n),-.35));
  box(cap,[0,0,0],[depth+1,.7,2*(s.w??3)],'limestone','viaduct-cap');
  box(m,[0,.25,0],[width+1,.5,depth+1],'limestone','viaduct-foot');
  if(parts.slice(firstPart).some(p=>!sceneryBoxClearsRoad(p,roadVolumes)))parts.splice(firstPart);
  else last=s.u;
 }
 const recipe={parts,groups,groundY:terrain.ground};cache.set(samples,{length,recipe});return recipe;
}
