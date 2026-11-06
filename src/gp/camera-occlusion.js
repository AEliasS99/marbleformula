import {challengeDeckGeometry} from './obstacles/raised-choice.js';
import {aiPropGeometry,aiPropMatrix,assertAiPropRoadClearance} from './ai-scene-props.js';
import {Box3,Euler,Matrix4,Quaternion,Vector3} from 'three';
import {TRACK,TRACK_DEPTH} from './trackMesh.js';
import {gridDividerGeometry} from './grid-divider.js';
import {sceneryLayout} from './scenery-layout.js';
import {buildAlpineMountainGeo} from './alpine-mountain.js';
import {checkpointLayout} from './checkpoint-layout.js';
import {spanishScenery} from './spain-scenery.js';
import {italianTerrain,italyTerrainGeometry} from './italy-terrain.js';
import {frenchScenery} from './france-scenery.js';
import {italianScenery} from './italy-scenery.js';
import {germanScenery} from './germany-scenery.js';
import {britishScenery} from './britain-scenery.js';
import {wachauScenery} from './wachau-scenery.js';
import {WACHAU_PROFILE} from './wachau-layout.js';
import {jaipurScenery,JAIPUR_TERRAIN} from './jaipur-scenery.js';
import {sceneryPartGeometry} from './scenery-mesh.js';
import {colombianScenery} from './colombia-scenery.js';
import {sydneyScenery,sydneyGeometry} from './sydney-scenery.js';
import {newYorkScenery} from './newyork-scenery.js';

const matrix=(pos=[0,0,0],rot=[0,0,0],scale=1)=>new Matrix4().compose(new Vector3(...pos),new Quaternion().setFromEuler(new Euler(...rot)),new Vector3(scale,scale,scale));
const child=(parent,pos,scale=1,yaw=0)=>parent.clone().multiply(matrix(pos,[0,yaw,0],scale));
const point=(m,x,y,z)=>[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
const hitBox=(a,b,lo,hi,pad=0)=>{let from=0,to=1;for(let i=0;i<3;i++){const d=b[i]-a[i];if(Math.abs(d)<1e-10){if(a[i]<lo[i]-pad||a[i]>hi[i]+pad)return false;continue;}let x=(lo[i]-pad-a[i])/d,y=(hi[i]+pad-a[i])/d;if(x>y)[x,y]=[y,x];from=Math.max(from,x);to=Math.min(to,y);if(from>to)return false;}return to>=0&&from<=1;};

const hitFrustum=(a,b,shape)=>{
 if(shape.sides)return intersectsFacetedFrustum(a,b,shape);
 const {height,top,bottom}=shape,dy=b[1]-a[1];let lo=0,hi=1;
 if(Math.abs(dy)<1e-12){if(Math.abs(a[1])>height/2)return false;}
 else {let x=(-height/2-a[1])/dy,y=(height/2-a[1])/dy;if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)return false;}
 const slope=(top-bottom)/height,r0=bottom+(a[1]+height/2)*slope,dr=dy*slope,dx=b[0]-a[0],dz=b[2]-a[2];
 const A=dx*dx+dz*dz-dr*dr,B=2*(a[0]*dx+a[2]*dz-r0*dr),C=a[0]*a[0]+a[2]*a[2]-r0*r0;
 const q=t=>A*t*t+B*t+C;return q(lo)<=0||q(hi)<=0||(A>0&&-B/(2*A)>=lo&&-B/(2*A)<=hi&&q(-B/(2*A))<=0);
};
// Exact convex solid of Three's faceted CylinderGeometry, including taper.
// A circumscribed smooth cylinder incorrectly fills air outside meadow edges.
export function intersectsFacetedFrustum(a,b,{height,top,bottom,sides}){
 let lo=0,hi=1;
 const clip=(x,y)=>{
  x-=1e-10;y-=1e-10;if(x<=0&&y<=0)return true;if(x>0&&y>0)return false;
  const t=x/(x-y);if(x>0)lo=Math.max(lo,t);else hi=Math.min(hi,t);return lo<=hi;
 };
 if(!clip(a[1]-height/2,b[1]-height/2)||!clip(-a[1]-height/2,-b[1]-height/2))return false;
 const slope=(top-bottom)/height,apothem=Math.cos(Math.PI/sides);
 for(let i=0;i<sides;i++){
  const angle=(i+.5)*2*Math.PI/sides,x=Math.sin(angle),z=Math.cos(angle);
  const side=p=>x*p[0]+z*p[2]-apothem*(bottom+(p[1]+height/2)*slope);
  if(!clip(side(a),side(b)))return false;
 }
 return true;
}
const hitTriangles=(a,b,vertices)=>{const d=b.map((v,i)=>v-a[i]);for(let k=0;k<vertices.length;k+=9){const v=[vertices[k],vertices[k+1],vertices[k+2]],e1=[vertices[k+3]-v[0],vertices[k+4]-v[1],vertices[k+5]-v[2]],e2=[vertices[k+6]-v[0],vertices[k+7]-v[1],vertices[k+8]-v[2]],p=[d[1]*e2[2]-d[2]*e2[1],d[2]*e2[0]-d[0]*e2[2],d[0]*e2[1]-d[1]*e2[0]],det=e1[0]*p[0]+e1[1]*p[1]+e1[2]*p[2];if(Math.abs(det)<1e-10)continue;const t=a.map((x,i)=>x-v[i]),u=(t[0]*p[0]+t[1]*p[1]+t[2]*p[2])/det;if(u<0||u>1)continue;const q=[t[1]*e1[2]-t[2]*e1[1],t[2]*e1[0]-t[0]*e1[2],t[0]*e1[1]-t[1]*e1[0]],w=(d[0]*q[0]+d[1]*q[1]+d[2]*q[2])/det;if(w<0||u+w>1)continue;const depth=(e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2])/det;if(depth>=0&&depth<=1)return true;}return false;};
/** Camera-only opaque envelopes of authored Swiss and Tokyo scenery. Never changes/removes scene assets.
 * Layout is exactly the renderer's. Roof slabs use their actual rotations; foliage uses conservative tapered envelopes,
 * mountains use the renderer’s exact triangles, and small details use opaque bounds.
 */
// Bounds of the four actual CarBody production meshes (including wheels/wings),
// rounded outwards. The mesh-bounds regression test guards changes to these assets.
export const CAR_CAMERA_BOUNDS=[
 {min:[-.747,-.303,-.356],max:[.708,.064,.356]},
 {min:[-.747,-.303,-.356],max:[.672,.064,.356]},
 {min:[-.747,-.314,-.356],max:[.672,.070,.356]},
 {min:[-.769,-.303,-.356],max:[.672,.083,.356]},
];
// The centre ray can clear a gantry while the body is hidden. Test the rendered
// body in its saved orientation; a generic world-axis square includes empty air.
export function carBodyVisible(occlusion,from,centre,quaternion,carStyle=0) {
 const p=Array.isArray(centre)?centre:[centre.x,centre.y,centre.z];
 if(quaternion){
  const q=new Quaternion(...quaternion),{min,max}=CAR_CAMERA_BOUNDS[carStyle];
  const axes=min.map((lo,i)=>[lo,(lo+max[i])/2,max[i]]);
  return axes[0].every(x=>axes[1].every(y=>axes[2].every(z=>{
   const v=new Vector3(x,y,z).applyQuaternion(q);
   return !occlusion.blocks(from,[p[0]+v.x,p[1]+v.y,p[2]+v.z]);
  })));
 }
 return [-.85,0,.85].every(x=>[0,.45].every(y=>[-.85,0,.85].every(z=>!occlusion.blocks(from,[p[0]+x,p[1]+y,p[2]+z]))));
}

// Sample the visible circular outline of the actual sphere, not a square that
// contains empty space. This catches a hinge crossing below a clear centre ray.
export function marbleBodyVisible(occlusion,from,centre,radius) {
 const origin=Array.isArray(from)?new Vector3(...from):from;
 const target=Array.isArray(centre)?new Vector3(...centre):centre;
 const toward=origin.clone().sub(target),distance=toward.length();
 if(distance<=radius)return false;
 toward.normalize();
 const right=new Vector3().crossVectors(toward,Math.abs(toward.y)>.99?new Vector3(1,0,0):new Vector3(0,1,0)).normalize();
 const up=new Vector3().crossVectors(right,toward).normalize();
 const offset=radius*radius/distance,outline=radius*Math.sqrt(1-radius*radius/(distance*distance));
 const centreVisible=target.clone().addScaledVector(toward,offset);
 for(let i=0;i<16;i++){
  const angle=i*Math.PI/8;
  const point=centreVisible.clone().addScaledVector(right,outline*Math.cos(angle)).addScaledVector(up,outline*Math.sin(angle));
  if(occlusion.blocks(origin,point))return false;
 }
 return !occlusion.blocks(origin,target);
}

export function createCameraOcclusion({samples,themeId,finishFrame,width,checkpoints=[],sceneryProfile,courseLength,obstacles=[],sceneProps=[],gate}){
 const boxes=[];
 const add=(parent,pos,size,category,rotation=[0,0,0])=>{
  const transform=parent.clone().multiply(matrix(pos,rotation)),half=size.map(v=>v/2),lo=half.map(v=>-v),hi=half;
  const bounds=new Box3(new Vector3(...lo),new Vector3(...hi)).applyMatrix4(transform);
  boxes.push({category,lo,hi,inverse:transform.clone().invert().elements,min:bounds.min.toArray(),max:bounds.max.toArray(),center:bounds.getCenter(new Vector3()).toArray()});
 };
 const frustum=(parent,pos,top,bottom,height,category,sides)=>{add(parent,pos,[Math.max(top,bottom)*2,height,Math.max(top,bottom)*2],category);boxes.at(-1).shape={top,bottom,height,sides};};
 assertAiPropRoadClearance(sceneProps,samples);
 for(const prop of sceneProps){
  const indexed=aiPropGeometry(prop.geometryId),g=indexed.toNonIndexed(),m=aiPropMatrix(prop),box=indexed.boundingBox,bounds=box.clone().applyMatrix4(m);
  boxes.push({category:'ai-'+prop.geometryId,lo:box.min.toArray(),hi:box.max.toArray(),inverse:m.clone().invert().elements,min:bounds.min.toArray(),max:bounds.max.toArray(),center:bounds.getCenter(new Vector3()).toArray(),triangles:g.attributes.position.array});
  indexed.dispose();g.dispose();
 }
 for(const o of obstacles){
  if(o.kind==='guard')continue;
  if(!o.pos?.every(Number.isFinite)||!o.quat?.every(Number.isFinite))throw Error('Invalid visible mechanism pose');
  const parent=new Matrix4().compose(new Vector3(...o.pos),new Quaternion(...o.quat),new Vector3(1,1,1));
  if(o.size?.length===3){
   add(parent,[0,0,0],o.size,'mechanism-'+o.kind);
   if(o.kind==='challenge-deck'){const g=challengeDeckGeometry(o);boxes.at(-1).triangles=g.attributes.position.array;g.dispose();}
   if(o.profile==='flow-nose-v1'){
    const g=gridDividerGeometry(o.size);boxes.at(-1).triangles=g.attributes.position.array;g.dispose();
   }
  }
  else if(o.radius>0&&o.height>0)frustum(parent,[0,0,0],o.radius,o.radius,o.height,'mechanism-'+o.kind);
  else throw Error('Missing visible mechanism bounds: '+o.kind);
 }
 const mountain=(parent,r,peak,h,seed)=>{const geometry=buildAlpineMountainGeo(r,peak,h,seed);geometry.computeBoundingBox();const box=geometry.boundingBox,bounds=box.clone().applyMatrix4(parent);boxes.push({category:'mountain',lo:box.min.toArray(),hi:box.max.toArray(),inverse:parent.clone().invert().elements,min:bounds.min.toArray(),max:bounds.max.toArray(),center:bounds.getCenter(new Vector3()).toArray(),triangles:geometry.attributes.position.array});};
 const chalet=(parent)=>{
  add(parent,[0,.9,0],[4.6,1.8,4],'chalet');add(parent,[0,2.75,0],[4.8,2.1,4.2],'chalet');
  add(parent,[0,4.15,0],[4.4,1.3,4.4],'chalet-attic');add(parent,[0,2.25,2.66],[5.1,.65,.08],'chalet-balcony');
  for(const side of [-1,1]){const roof=parent.clone().multiply(matrix([side*1.48,4.15,0],[0,0,-side*.52]));add(roof,[0,-.12,0],[3.45,.18,5.1],'chalet-roof');add(roof,[0,.1,0],[3.55,.32,5.2],'chalet-snow');}
  add(parent,[1.35,4.905,-.9],[.72,1.61,.72],'chalet-chimney');add(parent,[0,1.85,2.35],[5.1,.16,.7],'chalet-balcony');for(const x of [-1.6,0,1.6])add(parent,[x,2.62,2.74],[1.05,.34,.24],'chalet-flowers');
 };
 const pine=(parent)=>{frustum(parent,[0,.85,0],.2,.32,1.7,'pine-trunk');for(const [y,r,h]of [[2.2,1.65,2.6],[2.75,1.38,1.85],[3.65,1.22,2.2],[4.15,.98,1.55]])frustum(parent,[0,y,0],0,r,h,'pine-canopy');};
 const flag=(parent,h,size)=>{add(parent,[0,h*.5,0],[.12,h,.12],'flag-pole');add(parent,[size*1.12*.5+.03,h-size*.52,0],[size*1.12,size,.06],'flag-cloth');};
 const cow=(parent)=>{
  // SwissCow is not a solid cuboid: preserve the air beside the narrow head
  // and between legs. The outer box is only a broad-phase accelerator.
  add(parent,[0,.68,.2],[.8,1.36,1.9],'cow');const box=boxes.at(-1);box.parts=[];
  const part=(transform,pos,size,rotation=[0,0,0])=>{const m=transform.clone().multiply(matrix(pos,rotation)),half=size.map(v=>v/2);box.parts.push({lo:half.map(v=>-v),hi:half,inverse:m.invert().elements});};
  const body=new Matrix4();
  for(const [pos,size]of [[[0,.68,0],[.66,.56,1.22]],[[0,.72,.1],[.69,.38,.48]],[[.02,.66,-.36],[.68,.34,.34]],[[0,.36,-.22],[.28,.14,.3]]])part(body,pos,size);
  for(const x of [-.22,.22])for(const z of [-.42,.42]){part(body,[x,.24,z],[.14,.44,.14]);part(body,[x,.04,z],[.15,.08,.16]);}
  const head=matrix([0,.88,.66],[.18,0,0]);
  for(const [pos,size]of [[[0,0,-.08],[.42,.42,.38]],[[0,.06,.14],[.44,.38,.36]],[[0,-.04,.34],[.36,.22,.14]]])part(head,pos,size);
  for(const side of [-1,1]){part(head,[side*.28,.12,.08],[.2,.09,.1],[0,0,-side*.35]);part(head,[side*.22,.28,.08],[.09,.22,.09],[.2,0,-side*.45]);}
  part(head,[0,-.06,-.04],[.46,.1,.42],[.2,0,0]);part(head,[0,-.26,.06],[.22,.2,.22]);
  // Parts above are cow-local; the broad box is centred away from its origin.
  // Compose that translation when converting its local ray to each part.
  for(const p of box.parts)p.inverse=new Matrix4().fromArray(p.inverse).multiply(matrix([0,.68,.2])).elements;
 };
 const knoll=(parent,h,top,bottom,cap=top,capH=.4,capY=.1,capTop=cap,rockSides=8,capSides=10)=>{frustum(parent,[0,-h/2,0],top,bottom,h,'knoll',rockSides);frustum(parent,[0,capY,0],capTop,cap,capH,'meadow',capSides);};
 let layout;
 if(themeId==='alps'){
  layout=sceneryLayout(samples);
  layout.alpsTrackFlags.forEach((fl,i)=>{
   const m=matrix([fl.x,fl.y,fl.z],[0,fl.rotY,0]);
   if(fl.variant===0){knoll(m,1.6,1.65,2.35,1.68,.2,.04,1.6);cow(child(m,[-.42,.14,.35],1.15,.45));cow(child(m,[.55,.14,.22],1.05,-.65));flag(child(m,[.05,.14,-.55]),2.65,.95);pine(child(m,[-.85,.14,-.55],.52));}
   else if(fl.variant===1){knoll(m,1.9,2.15,2.95,2.18,.22,.04,2.1);chalet(child(m,[-.25,.15,-.35],.44));cow(child(m,[.78,.15,.65],1.12,-.55));flag(child(m,[1.15,.15,-.25]),2.75,.98);pine(child(m,[-1.25,.15,.35],.56));}
   else{knoll(m,1.3,1.15,1.65,1.18,.18,.03,1.1);flag(m,2.6,.92);cow(child(m,[.35,.12,.32],.98,-.4));pine(child(m,[-.55,.12,-.28],.46));}
  });
  layout.alpsPastures.forEach((ap,i)=>{
   const m=matrix([ap.x,ap.y,ap.z],[0,ap.rotY,0]),s=ap.scale;knoll(m,4.8*s,5.4*s*.96,5.4*s*.42,5.4*s*.98,.36,.14,5.4*s*.92,9,12);
   if(i%2===0){chalet(child(m,[0,.28,-.5*s],s*.82));flag(child(m,[2.45*s,.28,1.7*s],1,.4),4.2,1.28);flag(child(m,[-2.55*s,.28,1.5*s],1,-.3),3.8,1.15);for(const [x,z,k,r]of [[-1.55,2.55,1.45,.65],[.45,3.05,1.38,-.85],[1.85,2.45,1.32,-.45]])cow(child(m,[x*s,.28,z*s],k*s,r));pine(child(m,[-2.4*s,.28,-1.2*s],.92*s));pine(child(m,[2.5*s,.28,-1.1*s],.85*s));}
   else{chalet(child(m,[1.1*s,.28,-1.1*s],s*.68));flag(child(m,[-1.8*s,.28,-.6*s],1,.2),4.4,1.35);for(const [x,z,k,r]of [[-1.75,2.15,1.52,.45],[-.15,2.85,1.48,-.6],[1.55,2.35,1.42,-1.15],[2.45,1.05,1.34,-.75]])cow(child(m,[x*s,.28,z*s],k*s,r));pine(child(m,[-2.2*s,.28,-1.5*s],.98*s));pine(child(m,[-.6*s,.28,-2.1*s],.84*s));}
  });
  layout.alpsGondolas.forEach(g=>{
   const m=matrix(g.pos,[0,g.rotY,0]),h=4.65;
   for(const side of [-1,1]){add(m,[side*g.spanW,.15,0],[.85,.9,.85],'cable-foundation');add(m,[side*g.spanW,h*.5,0],[.56,h,.56],'cable-pylon');add(m,[side*g.spanW,h,0],[.5,.18,1.1],'cable-crossbar');flag(child(m,[side*g.spanW+side*.25,h+.05,0],1,side>0?-Math.PI/2:Math.PI/2),1.55,.68);}
   for(const [y,z,r]of [[h+.05,-.18,.025],[h-.08,.18,.02]])add(m,[0,y,z],[g.spanW*2+.4,r*2,r*2],'cable');
   const cab=child(m,[g.cabOffset,h-1.15,0]);add(cab,[0,-.12,0],[1.55,1.15,1.09],'gondola');add(cab,[0,.48,0],[1.48,.1,.98],'gondola-roof');add(cab,[0,.65,0],[.55,.48,.22],'gondola-hanger');
  });
  layout.props.forEach((p,i)=>{
   const s=p.scale,y=p.y+2.8,h=Math.min(12*s,Math.max(3.5,y-p.groundY)),m=matrix([p.x,y,p.z],[0,p.rotY,0]);
   if(i%3===0){const peak=(16.5+(i%4)*4)*s,r=(6.4+(i%3)*1.6)*s;mountain(m,r,peak,h,i+103);return;}
   knoll(m,h,5.6*s*.94,5.6*s*.55,5.6*s*.95,.32,.12,5.6*s*.9,9,12);if(i%3===1){chalet(child(m,[0,.25,-.4],s*.88));flag(child(m,[2.6*s,.25,1.5*s]),4.6,1.35);cow(child(m,[-2*s,.25,1.8*s],1.25*s,.5));cow(child(m,[.3*s,.25,2.3*s],1.2*s,-.7));}
   else{const cluster=child(m,[0,0,0],s);flag(child(cluster,[0,.25,1.6]),4.2,1.25);for(const [x,z,k]of [[0,-.4,1.05],[-1.8,.9,.85],[1.7,.8,.9]])pine(child(cluster,[x,.2,z],k));}
  });
  layout.ring.forEach((p,i)=>{const peak=(26+(i%4)*8)*p.scale,r=(11.5+(i%3)*3.5)*p.scale,h=Math.max(4,p.y-p.groundY),m=matrix([p.x,p.y,p.z],[0,p.rotY,0]);mountain(m,r,peak,h,i+11);mountain(child(m,[r*.56,0,r*.22],1,1.1),r*.65,peak*.72,h,i+47);});
 }
 if(themeId==='tokyo'){
  layout=sceneryLayout(samples);
  // Same placements and archetype dimensions as WorldScenery. Conservative
  // solid envelopes also cover neon signs/eaves, so cameras never thread them.
  [...layout.ring,...layout.props.filter((_,i)=>i%2===0)].forEach((b,i)=>{
   const totalH=Math.max(14,b.y+(11+(i%4)*5)*b.scale-b.groundY),w=(5.2+(i%3)*1.8)*b.scale;
   const m=matrix([b.x,b.groundY,b.z],[0,b.rotY,0]),style=i%5;
   if(style===3){const h=Math.max(2,b.y-b.groundY-1)+16.3;add(m,[0,h/2,0],[w*1.64,h,w*1.64],'tokyo-pagoda');}
   else if(style===4){
    for(let j=0;j<6;j++){const h=totalH*1.15/6;frustum(m,[0,(j+.5)*h,0],w*.58*.76**(j+1),w*.58*.76**j,h,'tokyo-tower');}
    add(m,[0,totalH*.48,0],[w*.68,2.1,w*.68],'tokyo-tower-deck');
    frustum(m,[0,totalH*.86,0],w*.24,w*.24,1.5,'tokyo-tower-deck');
    frustum(m,[0,totalH*1.15+3.2,0],.08,.22,6.4,'tokyo-spire');
   }else{const h=totalH*1.1+(style===2?.4:6);add(m,[0,h/2,0],[w*(style===2?1.6:1.4),h,w*1.3],'tokyo-building');}
  });
 }
 if(themeId==='newyork')for(const b of newYorkScenery(samples)){
  const m=matrix([b.x,b.groundY,b.z],[0,b.rotY,0]);
  for(const p of b.parts){
   if(p.kind==='box')add(m,p.pos,p.size,p.category);
   else frustum(m,p.pos,p.size[0],p.size[1],p.size[2],p.category,p.size[3]);
  }
 }
 if(themeId==='sydney')for(const p of sydneyScenery(samples).parts){
  const m=new Matrix4().fromArray(p.matrix);
  if(p.kind==='box'){add(m,[0,0,0],p.size,p.category);continue;}
  // Actual triangles keep the harbour arch openings open to the camera.
  const indexed=sydneyGeometry(p),geometry=indexed.toNonIndexed();indexed.dispose();
  geometry.computeBoundingBox();const box=geometry.boundingBox,bounds=box.clone().applyMatrix4(m);
  boxes.push({category:p.category,lo:box.min.toArray(),hi:box.max.toArray(),inverse:m.clone().invert().elements,min:bounds.min.toArray(),max:bounds.max.toArray(),center:bounds.getCenter(new Vector3()).toArray(),triangles:geometry.attributes.position.array});
  geometry.dispose();
 }
 if(['italy','germany','britain','france','austria','india'].includes(themeId))for(const tile of italianTerrain(samples,themeId==='india'?{profile:JAIPUR_TERRAIN,length:courseLength}:themeId==='austria'?{profile:WACHAU_PROFILE,length:courseLength}:themeId==='italy'?{profile:sceneryProfile,length:courseLength}:undefined).tiles){
  const geometry=italyTerrainGeometry(tile),box=geometry.boundingBox,m=new Matrix4();
  boxes.push({category:themeId+'-terrain',lo:box.min.toArray(),hi:box.max.toArray(),inverse:m.elements,min:box.min.toArray(),max:box.max.toArray(),center:box.getCenter(new Vector3()).toArray(),triangles:geometry.attributes.position.array});
  geometry.dispose();
 }
 if(['spain','colombia','italy','germany','britain','france','austria','india'].includes(themeId))for(const p of (themeId==='india'?jaipurScenery(samples,{length:courseLength}):themeId==='austria'?wachauScenery(samples,{length:courseLength}):themeId==='britain'?britishScenery(samples,{profile:sceneryProfile}):themeId==='italy'?italianScenery(samples,{profile:sceneryProfile,length:courseLength}):(themeId==='france'?frenchScenery:themeId==='germany'?germanScenery:themeId==='colombia'?colombianScenery:spanishScenery)(samples)).parts){
  const m=new Matrix4().fromArray(p.matrix);
  if(['sphere','hill','canopy','arch','dome','basin','rock-ridge'].includes(p.kind)){
   const indexed=sceneryPartGeometry(p),geometry=indexed.index?indexed.toNonIndexed():indexed;if(geometry!==indexed)indexed.dispose();geometry.computeBoundingBox();const box=geometry.boundingBox,bounds=box.clone().applyMatrix4(m);
   boxes.push({category:p.category,lo:box.min.toArray(),hi:box.max.toArray(),inverse:m.clone().invert().elements,min:bounds.min.toArray(),max:bounds.max.toArray(),center:bounds.getCenter(new Vector3()).toArray(),triangles:geometry.attributes.position.array});
  }else if(p.kind==='mountain')mountain(m,p.size[0],p.size[1],p.size[2],p.size[3]);
  else if(p.kind==='box')add(m,[0,0,0],p.size,p.category);
  else frustum(m,[0,0,0],p.size[0],p.size[1],p.size[2],p.category,p.size[3]);
 }
 // Match Gantries.arch's sampled frame and static Gate hardware. The moving
 // flap is not represented by these static parts.
 const start=samples[Math.max(0,Math.min(samples.length-1,Math.round((-.15-samples[0].u)/.5)))];
 if(start){
  const right=new Vector3(...start.r).normalize(),up=new Vector3(...start.n).normalize();
  const m=new Matrix4().makeBasis(right,up,new Vector3().crossVectors(right,up).normalize()).setPosition(...start.p);
  const w=(start.w??TRACK.width/2)+TRACK.wall,h=TRACK_DEPTH+1.3;
  for(const side of [-1,1])add(m,[side*(w+.15),h/2,0],[.18,h,.18],'start-post');
  add(m,[0,h,0],[2*w+.5,.34,.28],'start-beam');
  add(m,[0,h,-.15],[2*(start.w??TRACK.width/2)+.4,.3,.002],'start-banner');
 }
 if(gate){
  const m=new Matrix4().compose(new Vector3(...gate.hinge),new Quaternion(...gate.quat),new Vector3(1,1,1));
  const w=(samples[0].w??TRACK.width/2)+TRACK.wall;
  // Cylinder axis is local z, matching Gate's rotation-x=PI/2.
  frustum(m.clone().multiply(matrix([0,0,0],[Math.PI/2,0,0])),[0,0,0],.07,.07,2*w+.5,'start-hinge',32);
  for(const side of [-1,1])add(m,[0,-gate.height/2-.2,side*(w+.25)],[.18,gate.height+.6,.18],'gate-post');
 }
 if(finishFrame){const f=finishFrame,m=new Matrix4().makeBasis(new Vector3(...f.t).normalize(),new Vector3(...f.n).normalize(),new Vector3(...f.r).normalize());m.setPosition(...f.p);const span=width+.9,h=3.82;for(const side of [-1,1]){add(m,[0,h/2,side*span/2],[.16,h,.16],'finish-post');add(m,[0,.12,side*span/2],[.48,.24,.36],'finish-base');}add(m,[0,3.51,0],[.26,.68,span+.16],'finish-beam');}
 for(const arch of checkpointLayout(samples,checkpoints)){
  const parent=new Matrix4().fromArray(arch.matrix);
  for(const part of arch.parts)add(parent,part.pos,part.size,part.category);
 }
 // X/Z spatial index keeps camera planning cheap despite the dense authored villages.
 const cellSize=12,index=new Map();
 boxes.forEach((box,i)=>{for(let x=Math.floor(box.min[0]/cellSize);x<=Math.floor(box.max[0]/cellSize);x++)for(let z=Math.floor(box.min[2]/cellSize);z<=Math.floor(box.max[2]/cellSize);z++){const key=x+','+z;if(!index.has(key))index.set(key,[]);index.get(key).push(i);}});
 const candidates=(a,b,pad=0)=>{const set=new Set();for(let x=Math.floor((Math.min(a[0],b[0])-pad)/cellSize);x<=Math.floor((Math.max(a[0],b[0])+pad)/cellSize);x++)for(let z=Math.floor((Math.min(a[2],b[2])-pad)/cellSize);z<=Math.floor((Math.max(a[2],b[2])+pad)/cellSize);z++)for(const i of index.get(x+','+z)??[])set.add(i);return set;};
 const blockedBy=(from,to)=>{const a=Array.isArray(from)?from:[from.x,from.y,from.z],b=Array.isArray(to)?to:[to.x,to.y,to.z];for(const i of candidates(a,b)){const box=boxes[i];if(!hitBox(a,b,box.min,box.max))continue;const x=point(box.inverse,...a),y=point(box.inverse,...b);if(box.parts?box.parts.some(part=>hitBox(point(part.inverse,...x),point(part.inverse,...y),part.lo,part.hi)):box.triangles?hitTriangles(x,y,box.triangles):box.shape?hitFrustum(x,y,box.shape):hitBox(x,y,box.lo,box.hi))return box.category;}return null;};
 // Clearance is capped at3m; the director only needs a safe camera/body margin.
 const clearance=pos=>{const p=Array.isArray(pos)?pos:[pos.x,pos.y,pos.z];let min=3;for(const i of candidates(p,p,3)){const box=boxes[i],d=Math.hypot(...p.map((v,j)=>Math.max(box.min[j]-v,0,v-box.max[j])));if(d>=min)continue;const q=point(box.inverse,...p),local=Math.hypot(...q.map((v,j)=>Math.max(box.lo[j]-v,0,v-box.hi[j])));min=Math.min(min,local);}return min;};
 return {boxes,blockedBy,blocks:(a,b)=>blockedBy(a,b)!==null,clearance,counts:Object.fromEntries([...new Set(boxes.map(b=>b.category))].map(c=>[c,boxes.filter(b=>b.category===c).length])),layout};
}
