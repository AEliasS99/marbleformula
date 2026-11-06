import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
// Explicit opt-in: accepted saved races retain their original materials.
export const AI_CRAFT_PROFILE='italian-craft-v1';
export function aiMaterialFiles(profile,kind){
 if(profile!==AI_CRAFT_PROFILE)return null;
 if(!['travertine','oak','bronze'].includes(kind))throw Error('Unknown AI-assisted surface');
 const root=`materials/ai/${AI_CRAFT_PROFILE}/${kind}`;
 return {basecolor:`${root}/basecolor.png`,normal:`${root}/normal.png`,roughness:`${root}/roughness.png`};
}
// Metre-space UVs make tiny pores stay tiny on both short and long voussoirs.
// Frame-independent and repeat-safe; colour/map preparation records provenance.
export function physicalBoxUVs(geometry,metres){
 if(!(metres>0&&Number.isFinite(metres)))throw Error('Material needs physical tile size');
 const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  const [u,v]=Math.abs(n.getY(i))>.8?[x,z]:Math.abs(n.getX(i))>.8?[z,y]:[x,y];
  uv.setXY(i,u/metres,v/metres);
 }
 uv.needsUpdate=true;return geometry;
}
export function aiStoneGeometry(size){
 if(size.length!==3||!size.every(x=>Number.isFinite(x)&&x>0))throw Error('Invalid stone dimensions');
 const radius=Math.min(.018,Math.min(...size)*.12);
 return physicalBoxUVs(new RoundedBoxGeometry(...size,2,radius),1.2);
}
