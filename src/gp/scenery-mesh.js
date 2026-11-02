import {BoxGeometry,CylinderGeometry,SphereGeometry,Matrix4,Float32BufferAttribute} from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {buildAlpineMountainGeo} from './alpine-mountain.js';
export function sceneryPartGeometry(p){
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
    local.push(q[grainAxis],q[other[0]],q[other[1]]);
    const face=[0,1,2].sort((a,b)=>Math.abs(v[b])-Math.abs(v[a]))[0];
    surface.push(...(face===1?[q[0],q[2]]:face===0?[q[2],q[1]]:[q[0],q[1]]));
   }
   g.setAttribute('sceneryLocal',new Float32BufferAttribute(local,3));g.setAttribute('scenerySurface',new Float32BufferAttribute(surface,2));
  }
  g.applyMatrix4(new Matrix4().fromArray(p.matrix));
  if(!grouped.has(p.material))grouped.set(p.material,[]);grouped.get(p.material).push(g);
 }
 return [...grouped].map(([key,parts])=>{
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  if(!geometry)throw Error('Scenery material geometry could not be merged: '+key);
  geometry.computeBoundingSphere();
  return {key,geometry,material:materials[key]};
 });
}
