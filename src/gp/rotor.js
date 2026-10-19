import { Quaternion, Vector3 } from "three";

// The whirlwind (the "spinner" obstacle): a rotor whose blades end in hooks.
// Shared by the physics (scripts/season.mjs) and the renderer (src/gp/Scene.tsx).

/**
 * The whirlwind's blades and hooks in the rotor's own frame (y up): each blade
 * a box from the hub out along its direction, each hook a box at the tip on the
 * leading side (the side the rotor turns toward). Shared by the physics and the renderer.
 */
export function spinnerParts(sp) {
  const parts = [];
  const n = sp.arms;
  const [th, h, reach] = sp.size;
  const lead = sp.dir ?? 1; // rotation about +y: positive turns +x toward -z
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const d = [Math.cos(a), 0, -Math.sin(a)]; // blade direction
    const tng = [-Math.sin(a) * lead, 0, -Math.cos(a) * lead]; // leading direction at the tip
    const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a);
    const mid = (0.2 + reach) / 2;
    parts.push({ pos: [d[0] * mid, 0, d[2] * mid], quat: [yaw.x, yaw.y, yaw.z, yaw.w], size: [reach - 0.2, h, th], kind: "blade" });
    const hl = sp.hook ?? 0;
    if (hl > 0) {
      const rh = reach - th / 2;
      const c = [d[0] * rh + tng[0] * (hl / 2), 0, d[2] * rh + tng[2] * (hl / 2)];
      parts.push({ pos: c, quat: [yaw.x, yaw.y, yaw.z, yaw.w], size: [th, h, hl], kind: "hook" });
    }
  }
  return parts;
}

