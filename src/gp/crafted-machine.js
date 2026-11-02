import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {CylinderGeometry,LatheGeometry,Vector2,Float32BufferAttribute} from 'three';
// Detail is carved/assembled inside the existing static collider envelope.
// No change to mechanism pose, time, collision shape or passing clearance.
export function craftedFinGeometry(size){
 const [w,h,d]=size,parts={wood:[],brass:[],iron:[]};
 const box=(role,x,y,z,a,b,c,r=.008)=>{const g=new RoundedBoxGeometry(a,b,c,2,Math.min(r,a/4,b/4,c/4));g.translate(x,y,z);parts[role].push(g);};
 const core=new RoundedBoxGeometry(w,h,d-.018,3,Math.min(.018,d/5));
 const pos=core.getAttribute('position'),norm=core.getAttribute('normal'),uv=[];
 for(let i=0;i<pos.count;i++){
  // Photo covers 2m. Local x follows the beam and local y crosses boards.
  const nx=Math.abs(norm.getX(i)),ny=Math.abs(norm.getY(i)),nz=Math.abs(norm.getZ(i));
  uv.push((nz>=nx&&nz>=ny?pos.getX(i):pos.getZ(i))/2+.13,(ny>=nx&&ny>nz?pos.getX(i):pos.getY(i))/2+.29);
 }core.setAttribute('uv',new Float32BufferAttribute(uv,2));parts.wood.push(core);
 const border=Math.min(.055,h*.07),edge=Math.min(.085,w*.06);
 for(const side of [-1,1]){
  const z=side*(d/2-.005);
  for(const sy of [-1,1])box('brass',0,sy*(h/2-border/2),z,w-.006,border,.009);
  for(const sx of [-1,1])box('brass',sx*(w/2-edge/2),0,z,edge,h-.006,.009);
  // Reinforcing straps carry slotted countersunk screws and thin washers.
  const straps=Math.max(2,Math.ceil(w/1.6));
  for(let j=0;j<straps;j++){
   const x=-w/2+edge+.09+j*(w-2*(edge+.09))/(straps-1);
   box('brass',x,0,z,.045,h-.075,.008);
   for(const sy of [-1,1]){
    const y=sy*(h/2-.085),head=new CylinderGeometry(.018,.023,.009,10);head.rotateX(Math.PI/2);head.translate(x,y,side*(d/2-.0046));parts.brass.push(head);
    box('iron',x,y,side*(d/2-.0006),.022,.003,.0012,.0002);
   }
  }
 }
 return Object.entries(parts).map(([role,list])=>{const flat=list.map(g=>g.index?g.toNonIndexed():g),geometry=mergeGeometries(flat,false);for(let i=0;i<list.length;i++){if(flat[i]!==list[i])flat[i].dispose();list[i].dispose();}if(!geometry)throw Error('Crafted part failed to merge: '+role);geometry.computeBoundingBox();return{role,geometry};});
}
export function craftedBumperGeometry(r,h){
 const b=Math.min(.025,r*.1,h*.1),points=[
  [0,-h/2],[r-b,-h/2],[r-b*.25,-h/2+b*.25],[r,-h/2+b],
  [r*.985,-h*.18],[r*.975,h*.18],[r*.96,h/2-b],
  [r*.96-b*.25,h/2-b*.25],[r*.96-b,h/2],[0,h/2],
 ];
 const g=new LatheGeometry(points.map(([radius,y])=>new Vector2(Math.min(radius,r*(1-.04*(y/h+.5))),y)),48),p=g.getAttribute('position'),uv=[];
 // Existing cylindrical UVs retain the scan's tangent-space normal direction.
 for(let i=0;i<p.count;i++)uv.push(Math.atan2(p.getX(i),p.getZ(i))/(Math.PI*2)+.5,(p.getY(i)+h/2)/2);
 g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.computeBoundingBox();return g;
}
