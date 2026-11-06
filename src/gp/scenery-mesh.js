import {BoxGeometry,CylinderGeometry,SphereGeometry,LatheGeometry,Vector2,Matrix4,Float32BufferAttribute,Shape,ExtrudeGeometry} from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {buildAlpineMountainGeo} from './alpine-mountain.js';
export function sceneryPartGeometry(p){
 if(p.kind==='rock-ridge'){
  const [rx,h,rz,seed=0]=p.size;
  if(!(rx>0&&h>0&&rz>0))throw Error('Invalid sandstone ridge dimensions');
  // Dense, continuous eroded relief; the old eight-sided alpine peak reads
  // as a giant dark polygon beside the smaller crafted Rajasthan buildings.
  const g=new SphereGeometry(1,48,24,0,Math.PI*2,0,Math.PI/2),a=g.getAttribute('position');
  for(let i=0;i<a.count;i++){
   const x=a.getX(i),z=a.getZ(i),r=Math.min(1,Math.hypot(x,z)),angle=Math.atan2(z,x);
   const skirt=(1-r*r)**1.8,fold=.78+.13*Math.sin(x*6+z*3+seed*.4)+.09*Math.cos(z*8-x*2+seed);
   const edge=1+.09*r*Math.sin(angle*5+seed)+.045*r*Math.cos(angle*9-seed);
   a.setXYZ(i,x*rx*edge,h*skirt*fold,z*rz*edge);
  }
  g.computeVertexNormals();return g;
 }
 if(p.kind==='dome'||p.kind==='basin'){
  const [r,h,segments=32]=p.size;if(!(r>0&&h>0&&segments>=8))throw Error('Invalid landmark revolved surface');
  const profile=p.kind==='dome'?[[1,0],[.98,.18],[.86,.48],[.62,.78],[.30,.95],[0,1]]:[[0,.02],[.80,.02],[.97,.18],[1,.87],[.98,1],[.87,1],[.85,.87],[.77,.22],[0,.22]];
  return new LatheGeometry(profile.map(([x,y])=>new Vector2(x*r,y*h)),segments);
 }
 if(p.kind==='arch'){
  const [width,height,depth,wall=.3]=p.size,r=width/2,inner=r-wall,spring=height-r;
  if(!(inner>0&&spring>=0&&depth>0))throw Error('Invalid masonry arch dimensions');
  // A real opening, not a dark rectangle painted onto a solid box. Both the
  // renderer and camera tests use these exact bevelled stone triangles.
  const s=new Shape();s.moveTo(-r,0);s.lineTo(-r,spring);s.absarc(0,spring,r,Math.PI,0,true);
  s.lineTo(r,0);s.lineTo(inner,0);s.lineTo(inner,spring);s.absarc(0,spring,inner,0,Math.PI,false);s.lineTo(-inner,0);s.closePath();
  return new ExtrudeGeometry(s,{depth,steps:1,curveSegments:12,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:1}).translate(0,0,-depth/2);
 }
 if(p.kind==='canopy'){
  const g=new SphereGeometry(1,12,8),a=g.getAttribute('position'),seed=p.size[3]??0;
  for(let i=0;i<a.count;i++){
   const x=a.getX(i),y=a.getY(i),z=a.getZ(i),angle=Math.atan2(z,x),r=1+.10*Math.sin(angle*5+seed+y*2)+.07*Math.cos(angle*7-seed*.7+y*4);
   a.setXYZ(i,x*r*p.size[0],y*(1+.12*Math.sin(angle*4+seed))*p.size[1],z*r*p.size[2]);
  }g.computeVertexNormals();return g;
 }
 if(p.kind==='sphere')return new SphereGeometry(1,16,10).scale(...p.size);
 if(p.kind==='hill'){
  // A hemisphere makes a conspicuous dome with a vertical rim. A broad,
  // irregular height profile meets the ground with a zero-slope skirt.
  const g=new SphereGeometry(1,32,20,0,Math.PI*2,0,Math.PI/2),position=g.getAttribute('position');
  for(let i=0;i<position.count;i++){
   const x=position.getX(i),z=position.getZ(i),r=Math.min(1,Math.hypot(x,z)),angle=Math.atan2(z,x);
   const relief=(1-r*r)**2*(1+r*(.16*Math.sin(angle*3+r*2)+.09*Math.cos(angle*5-r*3)));
   position.setXYZ(i,x*p.size[0],relief*p.size[1],z*p.size[2]);
  }
  position.needsUpdate=true;g.computeVertexNormals();return g;
 }
 return p.kind==='mountain'?buildAlpineMountainGeo(...p.size).clone():p.kind==='box'?new BoxGeometry(...p.size):new CylinderGeometry(...p.size);
}
export function buildSceneryMeshes(parts,materials,{localCoordinates=false}={}){
 const grouped=new Map();
 for(const p of parts){
  let g=sceneryPartGeometry(p);
  g.deleteAttribute('color');
  // Authored rock geometry has no UVs; untextured surfaces still need matching
  // attribute sets when merged with the village's boxes/cylinders.
  if(!g.getAttribute('uv'))g.setAttribute('uv',new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
  if(g.index){const old=g;g=g.toNonIndexed();old.dispose();}
  if(localCoordinates){
   const p0=g.getAttribute('position'),n=g.getAttribute('normal'),local=[],surface=[];
   const grainAxis=p.kind==='cylinder'?1:[0,1,2].sort((a,b)=>p.size[b]-p.size[a])[0],other=[0,1,2].filter(k=>k!==grainAxis);
   for(let i=0;i<p0.count;i++){
    const q=[p0.getX(i),p0.getY(i),p0.getZ(i)],v=[n.getX(i),n.getY(i),n.getZ(i)];
    const seed=p.material==='marbleStone'?31*Math.sin(p.matrix[12]*1.73+p.matrix[14]*.91):0;
    local.push(q[grainAxis]+seed,q[other[0]],q[other[1]]);
    const face=[0,1,2].sort((a,b)=>Math.abs(v[b])-Math.abs(v[a]))[0];
    surface.push(...(face===1?[q[0],q[2]]:face===0?[q[2],q[1]]:[q[0],q[1]]));
   }
   g.setAttribute('sceneryLocal',new Float32BufferAttribute(local,3));g.setAttribute('scenerySurface',new Float32BufferAttribute(surface,2));
  }
  g.applyMatrix4(new Matrix4().fromArray(p.matrix));
  if(localCoordinates&&p.kind==='hill'){
   const a=g.attributes.position,uv=[];for(let i=0;i<a.count;i++)uv.push(a.getX(i)/8,a.getZ(i)/8);g.setAttribute('uv',new Float32BufferAttribute(uv,2));
  }
  if(!grouped.has(p.material))grouped.set(p.material,[]);grouped.get(p.material).push(g);
 }
 return [...grouped].map(([key,parts])=>{
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  if(!geometry)throw Error('Scenery material geometry could not be merged: '+key);
  geometry.computeBoundingSphere();
  return {key,geometry,material:materials[key]};
 });
}
