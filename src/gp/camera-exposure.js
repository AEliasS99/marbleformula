// Keep zoom motion blur continuous at native resolution. Two exposures can
// visibly duplicate the finish gantry during a fast fallback-lens recovery.
export function zoomBlurSamples(base, beforeFov, afterFov, width, height) {
  if (![beforeFov, afterFov, width, height].every(Number.isFinite) ||
      beforeFov <= 0 || afterFov <= 0 || beforeFov >= 179 || afterFov >= 179) return base;
  const a = Math.tan(beforeFov * Math.PI / 360);
  const b = Math.tan(afterFov * Math.PI / 360);
  const edgeTravel = Math.max(width, height) * 0.5 * Math.abs(a / b - 1);
  // At most two native pixels between exposures, bounded for render cost.
  return Math.max(base, Math.min(32, Math.ceil(edgeTravel / 2) + 1));
}
import {PerspectiveCamera,Vector3} from 'three';


// Sample real camera motion as well as zoom. A short-distance tracking rig
// can rotate enough in one shutter to duplicate distant village rooflines
// even when its lens and named shot stay unchanged. Project static anchors
// at the subject plane and farther landscape, in native drawing-buffer pixels.
export function sceneBlurSamples(base,before,after,width,height){
 if(!before||!after||before.kind!==after.kind||![width,height,...before.pos,...before.target,...after.pos,...after.target,before.fov,after.fov].every(Number.isFinite)||width<=0||height<=0)return base;
 const camera=shot=>{const c=new PerspectiveCamera(shot.fov,width/height,.01,10000);c.position.set(...shot.pos);if(shot.up)c.up.set(...shot.up);c.lookAt(...shot.target);c.updateMatrixWorld();return c;};
 const a=camera(before),b=camera(after),depth=Math.max(3,new Vector3(...before.pos).distanceTo(new Vector3(...before.target)));
 let travel=0;
 for(const d of [depth,depth*8])for(const x of [-.65,0,.65])for(const y of [-.65,0,.65]){
  const point=new Vector3(x,y,.5).unproject(a).sub(a.position).normalize().multiplyScalar(d).add(a.position),p=point.clone().project(a),q=point.clone().project(b);
  if(q.z<=-1||q.z>=1||Math.abs(q.x)>1.5||Math.abs(q.y)>1.5)continue;
  travel=Math.max(travel,Math.hypot((p.x-q.x)*width/2,(p.y-q.y)*height/2));
 }
 return Math.max(base,Math.min(32,Math.ceil(travel/2)+1));
}
