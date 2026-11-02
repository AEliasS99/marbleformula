// Presentation clock only. Never shifts baked physics, results or audio events.
export const CAR_SHOWCASE_SECONDS = 1.5;
export function productionIntro(storedIntro, isCar) {
  return isCar && storedIntro?.vehicle !== 'car' ? null : storedIntro ?? null;
}
export function carShowcasePlan(count, fps = 60) {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(fps) || fps < 1) throw Error('A car presentation needs entrants and a valid frame rate');
  const carFrames = Math.round(CAR_SHOWCASE_SECONDS * fps);
  const scenes = [{id:'title',frames:fps},{id:'cars',frames:count*carFrames},{id:'lineup',frames:fps}];
  let at = 0;
  for (const scene of scenes) {scene.at = at; at += scene.frames;}
  return {vehicle:'car',carFrames,scenes,total:at,highlight:null,L:0,cards:[]};
}
export function carShowcaseAt(frame, count, framesPerCar) {
  const bounded = Math.max(0, Math.min(count * framesPerCar - 1, frame));
  const index = Math.floor(bounded / framesPerCar);
  const local = bounded - index * framesPerCar;
  // A short settled pose at either end; a full revolution between them.
  const hold = Math.round(framesPerCar * .08);
  const t = Math.max(0, Math.min(1, (local - hold) / (framesPerCar - 1 - 2 * hold)));
  const progress = t * t * (3 - 2 * t);
  return {index,local,progress,angle:Math.PI*.22 + progress*Math.PI*2};
}
