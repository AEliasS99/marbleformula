import {venueLayout} from './venue.js';
import {tuscanLandscape} from './tuscany-landscape.js';
import {sceneryLayout} from './scenery-layout.js';
import {BufferGeometry,Float32BufferAttribute} from 'three';
import {TUSCAN_VENUE_PROFILE,tuscanSettlementSites} from './tuscany-sites.js';
const cache=new WeakMap();
// A continuous heightfield below the authored road, split into small tiles for
// spatially indexed camera rays. The same triangles are rendered and audited.
export function italianTerrain(samples,{profile='',length=0}={}){
 const venue=profile===TUSCAN_VENUE_PROFILE;
 if(venue&&!(Number.isFinite(length)&&length>0))throw Error('Venue terrain needs actual course length');
 const key=venue?'venue-'+length:'legacy',cached=cache.get(samples);
 if(cached?.has(key))return cached.get(key);
 const layout=sceneryLayout(samples),plots=[...layout.props,...layout.ring],xs=[...samples.map(s=>s.p[0]),...plots.map(p=>p.x)],zs=[...samples.map(s=>s.p[2]),...plots.map(p=>p.z)];
 const step=venue?4:8,minX=Math.floor((Math.min(...xs)-100)/step)*step,minZ=Math.floor((Math.min(...zs)-100)/step)*step;
 const nx=Math.ceil((Math.max(...xs)+100-minX)/step),nz=Math.ceil((Math.max(...zs)+100-minZ)/step),ground=Math.min(...samples.map(s=>s.p[1]))-1.35;
 const heights=[],eventPit=venue?venueLayout(samples,length).pit:null;
 for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
  const px=minX+x*step,pz=minZ+z*step;let y=Infinity;
  let elevation=0,weight=0,localLimit=Infinity;
  for(let i=0;i<samples.length;i+=3){
   const s=samples[i],d2=(px-s.p[0])**2+(pz-s.p[2])**2;
   y=Math.min(y,s.p[1]+.20*(venue?Math.sqrt(d2):Math.hypot(px-s.p[0],pz-s.p[2]))-5);
   if(venue){const w=1/(d2+144)**2;elevation+=s.p[1]*w;weight+=w;localLimit=Math.min(localLimit,s.p[1]+.65*Math.sqrt(d2)-4);}
  }
  // The old lowest-course envelope left the upper race on enormous stilts.
  // A smooth local elevation field supplies the actual surrounding hillside.
  // The subsequent all-road clamp still protects every lower crossing.
  const distance=eventPit?Math.hypot(px-eventPit.base[0],pz-eventPit.base[2]):Infinity;
  const blend=Math.max(0,Math.min(1,(distance-35)/45));
  // Keep the established open finish valley and service campus. Raise only
  // the outer/upper hillside, with a broad continuous transition into it.
  const local=Math.min(elevation/weight-4,localLimit),want=venue?y+(local-y)*blend*blend*(3-2*blend):y;
  heights.push(Math.max(ground,want));
 }
 const interpolate=(values,x,z)=>{
  const gx=Math.max(0,Math.min(nx-.00001,(x-minX)/step)),gz=Math.max(0,Math.min(nz-.00001,(z-minZ)/step)),ix=Math.floor(gx),iz=Math.floor(gz),fx=gx-ix,fz=gz-iz;
  const a=values[iz*(nx+1)+ix],b=values[iz*(nx+1)+ix+1],c=values[(iz+1)*(nx+1)+ix],d=values[(iz+1)*(nx+1)+ix+1];
  // Same diagonal and interpolation as the rendered triangles.
  return fx+fz<=1?a+(b-a)*fx+(c-a)*fz:d+(c-d)*(1-fx)+(b-d)*(1-fz);
 };
 if(venue){
  const original=[...heights],sites=[...tuscanSettlementSites(samples),...tuscanLandscape(samples).neighborhoods].map(p=>({...p,y:interpolate(original,p.x,p.z)}));
  const pit=eventPit;
  if(pit)sites.push({x:pit.base[0],z:pit.base[2],y:pit.base[1],halfX:18,halfZ:8.5,rotY:pit.yaw,scale:1});
  for(let z=0;z<=nz;z++)for(let x=0;x<=nx;x++){
   const px=minX+x*step,pz=minZ+z*step,k=z*(nx+1)+x;let strength=0,want=original[k];
   for(const p of sites){const dx=px-p.x,dz=pz-p.z,c=Math.cos(p.rotY),s=Math.sin(p.rotY),lx=c*dx-s*dz,lz=s*dx+c*dz;
    const distance=Math.hypot(Math.max(0,Math.abs(lx)-p.halfX*p.scale),Math.max(0,Math.abs(lz)-p.halfZ*p.scale));
    const t=Math.max(0,Math.min(1,1-distance/(9*p.scale)));const blend=t*t*(3-2*t);
    if(blend>=strength){strength=blend;want=original[k]+(p.y-original[k])*blend;}
   }
   // Grading is scenery only and must remain under every authored roadway.
   for(let i=0;i<samples.length;i+=2){const s=samples[i];if(Math.hypot(px-s.p[0],pz-s.p[2])<(s.w??2.1)+step*1.5)want=Math.min(want,s.p[1]-1.4);}
   heights[k]=want;
  }
 }
 const heightAt=(x,z)=>interpolate(heights,x,z);
 const point=(x,z)=>[minX+x*step,heights[z*(nx+1)+x],minZ+z*step];
 const tiles=[];
 for(let z=0;z<nz;z+=8)for(let x=0;x<nx;x+=8){
  const positions=[];
  for(let j=z;j<Math.min(nz,z+8);j++)for(let i=x;i<Math.min(nx,x+8);i++)positions.push(...point(i,j),...point(i,j+1),...point(i+1,j),...point(i+1,j),...point(i,j+1),...point(i+1,j+1));
  tiles.push({positions});
 }
 const out={tiles,heightAt,ground,bounds:{minX,minZ,maxX:minX+nx*step,maxZ:minZ+nz*step}};if(!cached)cache.set(samples,new Map());cache.get(samples).set(key,out);return out;
}
export function italyTerrainGeometry(tile,terrain=null){
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(tile.positions,3));
 if(terrain&&typeof terrain.heightAt==='function'){
  // Shared world-space gradients keep lighting continuous across tile seams.
  // Vertices and triangles remain byte-identical to the audited road landscape.
  const normals=[];for(let i=0;i<tile.positions.length;i+=3){
   const x=tile.positions[i],z=tile.positions[i+2],e=2;
   const dx=(terrain.heightAt(x+e,z)-terrain.heightAt(x-e,z))/(2*e),dz=(terrain.heightAt(x,z+e)-terrain.heightAt(x,z-e))/(2*e),l=Math.hypot(dx,1,dz);
   normals.push(-dx/l,1/l,-dz/l);
  }g.setAttribute('normal',new Float32BufferAttribute(normals,3));
 }else g.computeVertexNormals();
 g.computeBoundingBox();return g;
}
