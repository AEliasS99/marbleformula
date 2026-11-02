import {CAR_BODY_SCALE,CAR_WHEEL_LAYOUT} from './car-dimensions.js';
// Metres, seconds and measured world velocity throughout. This profile is opt-in
// for new exhibition bakes; saved races and official qualifiers stay immutable.
export const RACE_PACE = Object.freeze({
 paceModel:'race-pace-v2',topSpeed:44,maximumSpeed:58,
 acceleration:14,braking:22,cornerAcceleration:22,
 boostSpeed:14,boostSeconds:2.8,boostAccelerationMultiplier:10,
 brakingBase:.97,brakingSpread:.055,
 drivingModel:'lookahead-driver-v1',cockpitCamera:true,cockpitPresentation:'race-seat-v2',
});
export const improvedPace = tuning => tuning?.paceModel==='race-pace-v2';
export const variedBoost = tuning => tuning?.boostModel==='lane-charge-v2';
export function boostProfile(tuning,lane){
 if(!variedBoost(tuning))return {seconds:tuning.boostSeconds,bonus:tuning.boostSpeed,acceleration:tuning.acceleration*(tuning.boostAccelerationMultiplier??1),target:tuning.maximumSpeed};
 return {seconds:lane?.boostSeconds??tuning.boostSeconds,bonus:Math.max(0,(lane?.target??tuning.topSpeed)-tuning.topSpeed),acceleration:lane?.accel??tuning.acceleration,target:lane?.target??tuning.topSpeed};
}
export function brakingLookahead(speed,braking,grip=1){
 // Reaction + full stopping distance, including wet braking. Never a fixed
 // 34/55-metre horizon that misses a bend or stopped car at racing speed.
 return Math.max(36,Math.min(260,speed*.55+speed*speed/(2*Math.max(2,braking*grip))+14));
}
export function cornerSpeedLimit(curvature,acceleration,grip=1){
 return Math.sqrt(acceleration*grip/Math.max(1e-5,Math.abs(curvature)));
}
export function poweredAcceleration(tuning,onLane,charged,lane){
 const normal=tuning.acceleration??6.4;
 if(variedBoost(tuning)&&onLane)return boostProfile(tuning,lane).acceleration;
 return normal*(improvedPace(tuning)?onLane?(tuning.boostAccelerationMultiplier??1):charged?2:1:1);
}

// Rounded shallow water, not a solid collider. Shared by tyre grip, water drag,
// lane planning and the render footprint. A complete dry route stays available.
export function pondHalfWidth(p,u){
 const x=(u-(p.u0+p.u1)/2)/((p.u1-p.u0)/2);
 return Math.abs(x)>=1?0:p.halfWidth*Math.sqrt(Math.max(0,1-x*x));
}
export function waterCoverage(p,u,lat){
 if(u<=p.u0||u>=p.u1)return 0;
 const half=pondHalfWidth(p,u);
 return Math.max(0,Math.min(1,(half+.22-Math.abs(lat-p.lat))/.44));
}
export function tyreWaterCoverage(p,u,lat){
 // Neutral wheel contact locations share the render/contact solver's exact
 // wheelbase and track width, rather than a second hardcoded chassis size.
 return CAR_WHEEL_LAYOUT.reduce((sum,w)=>sum+waterCoverage(p,u+w[0]*CAR_BODY_SCALE[0],lat+w[2]*CAR_BODY_SCALE[2]),0)/CAR_WHEEL_LAYOUT.length;
}
export function contactWaterCoverage(conditions,p,u,lat){return conditions?.racecraft?.waterModel==='tyre-water-v2'?tyreWaterCoverage(p,u,lat):waterCoverage(p,u,lat);}
export function waterResponse(conditions,u,lat,speed){
 const coverage=Math.max(0,...(conditions?.patches??[]).filter(p=>p.kind==='pond').map(p=>contactWaterCoverage(conditions,p,u,lat)));
 return {coverage,throttleMultiplier:conditions?.racecraft?.waterModel==='tyre-water-v2'?1-.65*coverage:1,drag:waterDrag(conditions,u,lat,speed)};
}
export function waterDrag(conditions,u,lat,speed){
 return Math.max(0,...(conditions?.patches??[]).filter(p=>p.kind==='pond')
  .map(p=>contactWaterCoverage(conditions,p,u,lat)*Math.min(conditions?.racecraft?.waterModel==='tyre-water-v2'?26:14,(p.drag??.0075)*speed*speed)));
}
