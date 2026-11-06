import {Vector3} from 'three';

const vector = value => Array.isArray(value) ? new Vector3(...value.slice(0, 3)) : value.clone();

// Sample the subject's visible disk against the other actual saved spheres.
// Scenery clearance alone can select a camera behind an entire opaque pack.
// Small overlaps during a pass are allowed; a mostly hidden subject is not.
export function marbleActorVisibility(from, centre, radius, actors) {
  const origin = vector(from), target = vector(centre);
  const toward = origin.clone().sub(target), distance = toward.length();
  if (distance <= radius) return {visible: false, blocked: 9, samples: 9, cameraInsideActor: true};
  toward.normalize();
  const right = new Vector3().crossVectors(toward, Math.abs(toward.y) > .99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(right, toward).normalize();
  const disk = target.clone().addScaledVector(toward, radius * radius / distance);
  const outline = .65 * radius * Math.sqrt(1 - radius * radius / (distance * distance));
  const points = [disk, ...Array.from({length: 8}, (_, i) => disk.clone().addScaledVector(right, outline * Math.cos(i * Math.PI / 4)).addScaledVector(up, outline * Math.sin(i * Math.PI / 4)))];
  const others = actors.map(vector).filter(p => p.distanceToSquared(target) > 1e-8);
  const cameraInsideActor = others.some(p => p.distanceToSquared(origin) <= radius * radius);
  const blocked = points.filter(point => {
    const direction = point.clone().sub(origin), length = direction.length();
    direction.divideScalar(length);
    return others.some(actor => {
      const delta = actor.clone().sub(origin), along = delta.dot(direction);
      const perpendicularSquared = delta.lengthSq() - along * along;
      if (perpendicularSquared >= radius * radius) return false;
      const halfChord = Math.sqrt(Math.max(0, radius * radius - perpendicularSquared));
      return along + halfChord > 0 && along - halfChord < length;
    });
  }).length;
  return {visible: !cameraInsideActor && blocked < 5, blocked, samples: points.length, cameraInsideActor};
}
