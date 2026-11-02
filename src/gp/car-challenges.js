// Shared circuit conditions. Randomness is seeded before simulation; rendering
// consumes the same baked patches. No position-dependent catch-up or forced spins.
import {contactWaterCoverage} from './car-pace.js';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const noise = (seed, index) => {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
};

export function bakeCarConditions(preset, seed) {
  if (!preset) return null;
  return {
    version: preset.racecraft ? 2 : 1,
    seed,
    model: 'surface-constrained touring cars; seeded meltwater and driver decisions',
    patches: preset.patches.map((p, i) => ({...p, grip: p.grip??(0.52 + noise(seed, i) * 0.18)})),
    ...(preset.racecraft ? {racecraft:{...preset.racecraft}} : {}),
    ...(preset.gates ? {gates:preset.gates.map(g=>({...g}))} : {}),
    ...(preset.variant ? {variant:preset.variant} : {}),
  };
}

// Tyre footprint blends over the edge instead of flickering at a point boundary.
export function surfaceGrip(conditions, u, lat) {
  let grip = 1;
  for (const p of conditions?.patches ?? []) {
    const along = p.kind==='pond'?contactWaterCoverage(conditions,p,u,lat):clamp(Math.min(u - p.u0, p.u1 - u) / 1.2, 0, 1);
    const across = p.kind==='pond'?1:clamp((p.halfWidth + 0.28 - Math.abs(lat - p.lat)) / 0.56, 0, 1);
    grip = Math.min(grip, 1 - (1 - p.grip) * along * across);
  }
  return grip;
}

export function driverDecision(seed, driver, sector) {
  return noise(seed + Math.imul(driver + 1, 7919), sector + 101);
}

// A dry, longer outside line competes with the wet, shorter inside line.
// This plans intent only: traffic can prevent reaching the requested line.
export function challengeLine(conditions, u, baseLat, driver, intelligence, stability) {
  const p = conditions?.patches.find(p => u >= p.u0 - 20 && u <= p.u1 + 7);
  if (!p) return null;
  const choice = driverDecision(conditions.seed, driver, p.u0);
  const avoid = choice < 0.30 + intelligence * 0.42 - stability * 0.12;
  const target = avoid ? -Math.sign(p.lat) * 1.18 : Math.sign(p.lat) * 0.85;
  const blend = clamp((u - (p.u0 - 20)) / 12, 0, 1) * clamp((p.u1 + 7 - u) / 7, 0, 1);
  return baseLat + (target - baseLat) * blend;
}

export function attackLaneActive(booster, u, lat) {
  return u >= booster.u0 && u <= booster.u1 &&
    Math.abs(lat - (booster.latCenter ?? 0)) <= (booster.width ?? 1.42) / 2;
}

// Route around the same physical islands that the obstacle module renders.
// Both sides of a central island stay available; choice is seeded, never rank-based.
export function carObstacleLine(conditions,u,requested,halfWidth,halfLength,wMax,driver) {
  let target=requested;
  for(const gate of conditions?.gates??[]) {
    const clear=gate.length/2+halfLength+.5;
    if(u<gate.u-26||u>gate.u+clear)continue;
    const lo=gate.lat-gate.width/2-halfWidth-.18;
    const hi=gate.lat+gate.width/2+halfWidth+.18;
    if(target>lo&&target<hi) {
      const left=lo>=-wMax,right=hi<=wMax;
      if(!left&&!right)throw Error('Car obstacle leaves no clear route');
      const chooseLeft=left&&(!right||driverDecision(conditions.seed,driver,Math.round(gate.u))<.5);
      const safe=chooseLeft?lo:hi;
      const k=clamp((u-(gate.u-26))/16,0,1);
      target=target+(safe-target)*k*k*(3-2*k);
    }
    break; // Finish this island before planning a conflicting route around the next.
  }
  return clamp(target,-wMax,wMax);
}

// Combined acceleration budget: steering and braking share tyre grip.
export function lateralBudget(grip, longitudinalAcceleration, stability, cornerAcceleration=8.4) {
  const budget = (cornerAcceleration + stability * 0.8) * grip;
  return Math.sqrt(Math.max(0, budget * budget - Math.min(budget, Math.abs(longitudinalAcceleration)) ** 2));
}

// Driver commitment is fixed before entering a sector; it never reads rank.
// A bolder entry can exceed the available grip, rather than being corrected
// immediately into exactly the same safe corner speed as every other driver.
export function brakingCommitment(conditions, driver, sector, intelligence) {
  if(!conditions?.racecraft) return 0.94 + driverDecision(conditions?.seed??0,driver,sector)*0.06;
  return (conditions.racecraft.brakingBase??0.98) + driverDecision(conditions.seed,driver,sector)*(conditions.racecraft.brakingSpread??0.13) - intelligence*0.025;
}

// A persistent, damped response to actual tyre overload. Road curvature and
// longitudinal braking consume the same available tyre force. No timed spins.
export function tyreResponse({drift=0,speed,curvature,grip,acceleration,stability,dt,cornerAcceleration=8.4}) {
  const capacity=(cornerAcceleration+stability*0.8)*grip;
  const cornerForce=speed*speed*Math.abs(curvature);
  const available=Math.sqrt(Math.max(0,capacity*capacity-Math.min(capacity,Math.abs(acceleration))**2));
  const excess=Math.max(0,cornerForce-available);
  const outward=-Math.sign(curvature);
  const next=clamp((drift+outward*excess*0.6*dt)*Math.exp(-(1.0+stability)*dt),-3.2,3.2);
  return {drift:next,excess,drag:Math.min(4,excess*0.45+Math.abs(next)*0.18)};
}
