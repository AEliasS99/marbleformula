import {Quaternion,Vector3} from 'three';
import {frameQuat,pointInFrame,quatArr,r3} from './kit.js';

export const ROMAN_GALLERY={length:14.4,bays:6,coveredBays:[1,4],voussoirs:18,spring:1.15,wall:.38,clearance:.44};
// A traversable barrel-vault gallery built on the existing sampled roadway.
// Stone records ARE the colliders and the picture, with an actual open throat.
// Authored opt-in only: no changes to historical random plans or saved races.
export function romanGalleryParts(feature,frameAt){
 const parts=[],C=ROMAN_GALLERY;
 const add=(du,lat,y,size,roll=0,role='vault')=>{
  const s=frameAt(feature.u+du),q=frameQuat(s).multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),roll));
  parts.push({kind:'roman-stone',shape:'box',pos:pointInFrame(s,lat,y).map(r3),quat:quatArr(q),size:size.map(r3),role,friction:.35,restitution:.12,architectureZone:'roman-gallery-'+feature.u});
 };
 const pitch=C.length/C.bays;
 for(let bay=0;bay<C.bays;bay++){
  const u=(bay+.5)*pitch,s=frameAt(feature.u+u),inside=s.w+C.clearance,r=inside+C.wall/2;
  // Tie the outboard masonry into the roadway's supporting deck. The beam
  // stays below the racing floor; footings are not suspended beside the rail.
  add(u,0,-.28,[.9,.48,2*(inside+C.wall)+.3],0,'deck-tie');
  for(const side of [-1,1]){
   add(u,side*r,C.spring/2,[.65,C.spring,C.wall],0,'pier');
   add(u,side*r,.10,[.85,.28,C.wall+.12],0,'plinth');
   add(u,side*r,C.spring-.10,[.75,.18,C.wall+.14],0,'impost');
  }
  const da=Math.PI/C.voussoirs;
  for(let k=0;k<C.voussoirs;k++){
   const a=(k+.5)*da;
   // Adjacent convex stones overlap at their inner chord enough to close the
   // vault; physical and rendered opening use identical rounded records.
   add(u,Math.cos(a)*r,C.spring+Math.sin(a)*r,[C.coveredBays.includes(bay)?pitch-.12:.30,C.wall,2*(r+C.wall/2)*Math.tan(da/2)+.018],Math.PI/2-a,k===C.voussoirs/2?'keystone':'vault');
  }
 }
 return parts;
}
export default {
 type:'roman-gallery',label:'THE AQUEDUCT GALLERY',dq:false,
 place:{before:3,after:17,maxCurv:.012},
 card:{difficulty:2,chaos:2,seconds:3,summary:'An open six-rib stone arcade with two short covered passages. Open sections keep racing action readable between the tunnels; no invisible route or artificial speed change.'},
 build(feature,{frameAt,statics}){statics.push(...romanGalleryParts(feature,frameAt));},
};
