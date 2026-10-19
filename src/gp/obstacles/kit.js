import { Matrix4, Quaternion, Vector3 } from "three";
import { pointInFrame, pointOnTrack, surfaceHeight, TRACK, TRACK_DEPTH } from "../trackMesh.js";

// Shared helpers for the obstacle modules. Browser-safe (no Rapier, no node):
// the renderer imports the same modules for their geometry and timing.

export { pointInFrame, pointOnTrack, surfaceHeight, TRACK, TRACK_DEPTH };
export const r3 = (n) => Math.round(n * 1000) / 1000;
export const mod = (x, m) => ((x % m) + m) % m;
export const v3 = (a) => new Vector3(a[0], a[1], a[2]);
export const quatArr = (q) => [q.x, q.y, q.z, q.w].map(r3);
/** Orientation with local x along the track, y out of the trough, z across it. */
export const frameQuat = (s) => new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(v3(s.t), v3(s.n), v3(s.r)));
/** A Rapier rotation from [x, y, z, w]. */
export const rot = (a) => ({ x: a[0], y: a[1], z: a[2], w: a[3] });
/** Collider defaults every machine uses: friction, restitution with the Min rule (a head-on hit never sends a marble back up the slope). */
export function solid(desc, RAPIER, { friction = 0.2, restitution = 0.3, group }) {
  return desc.setFriction(friction).setRestitution(restitution).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min).setCollisionGroups(group);
}
