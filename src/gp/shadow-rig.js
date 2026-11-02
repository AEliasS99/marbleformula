import {Vector3} from 'three';

// A fixed projection and a light-space texel grid: neither may depend on the
// previous frame/seek or the lens distance. Otherwise the terrain shadows
// swim and segmented render tabs disagree at their first frame.
export const SHADOW_SPAN = 40;
export const SHADOW_MAP_SIZE = 4096;
export function stableShadowRig(target, night = true) {
  const offset = new Vector3(...(night ? [8, 40, 10] : [30, 21, 14]));
  const forward = offset.clone().normalize();
  const right = new Vector3(0, 1, 0).cross(forward).normalize();
  const up = forward.clone().cross(right).normalize();
  const center = new Vector3(...target);
  const texel = 2 * SHADOW_SPAN / SHADOW_MAP_SIZE;
  for (const axis of [right, up]) {
    const coordinate = center.dot(axis);
    center.addScaledVector(axis, Math.round(coordinate / texel) * texel - coordinate);
  }
  return {target: center.toArray(), position: center.clone().add(offset).toArray(), span: SHADOW_SPAN, far: 200};
}
