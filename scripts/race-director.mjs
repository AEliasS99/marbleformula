import {marbleActorVisibility} from '../src/gp/marble-actor-visibility.js';
import {createCameraOcclusion,carBodyVisible,marbleBodyVisible} from "../src/gp/camera-occlusion.js";
import {cockpitCamera,cockpitRoadOptions} from '../src/gp/car-cockpit.js';
import RAPIER from '@dimforge/rapier3d-compat';
import {PerspectiveCamera, Vector3} from 'three';
import {venueBlocks, venueClearance, venueLayout} from '../src/gp/venue.js';
import {pointInFrame, pointOnTrack, surfaceHeight as surfaceHeightAt, TRACK} from '../src/gp/trackMesh.js';
import {VORTEX} from '../src/gp/obstacles/vortex.js';
import {STAIR_PLINTH_EXTRA_LENGTH,STAIR_RUNG_OFFSET,STAIR_RUNG_THICKNESS} from '../src/gp/stair.js';
const v3 = a => new Vector3(a[0],a[1],a[2]);
const r3 = n => Math.round(n*1000)/1000;
const arr = v => [r3(v.x),r3(v.y),r3(v.z)];
// Camera choices must not depend on how many random draws the physics consumed.
export function cameraRandom(seed,id){
  let state=2166136261;
  for(const char of `${seed}:${id}:camera-v1`)state=Math.imul(state^char.charCodeAt(0),16777619)>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
export function liveRaceEndFrame(frameCount,finishFrames,winnerFrame,fps){
  const lastCrossing=Math.max(winnerFrame,...finishFrames.filter(Number.isFinite));
  return Math.min(frameCount,Math.max(winnerFrame+Math.round(7.5*fps),lastCrossing+Math.round(2*fps)));
}

// A measured loss of control is more valuable than a nearby routine pass.
// Keep the cut cadence, with eliminations taking priority over both.
export function selectActionWindows(actions,minGap){
  const priority=a=>a.dq?2:a.feature==='slide'?1:0;
  return [...actions].sort((a,b)=>a.start-b.start).reduce((chosen,a)=>{
    const previous=chosen.at(-1);
    if(!previous||a.start-previous.start>=minGap)chosen.push(a);
    else if(priority(a)>priority(previous))chosen[chosen.length-1]=a;
    return chosen;
  },[]);
}

export function finishCoverageWindows(crossings,fps,startFrame,lastFrame){
  return crossings.filter(Number.isFinite).sort((a,b)=>a-b).reduce((out,crossing)=>{
    const start=Math.max(startFrame,crossing-Math.round(1.8*fps)),end=Math.min(lastFrame+1,crossing+Math.round(.9*fps));
    const previous=out.at(-1);
    if(previous&&start<=previous.end)previous.end=Math.max(previous.end,end);else out.push({start,end});
    return out;
  },[]);
}

export function finishSubjectAt(crossings,f,fps){
 return crossings.map((at,i)=>({at,i})).filter(x=>Number.isFinite(x.at)&&f>=x.at-Math.round(1.8*fps)&&f<x.at+Math.round(.9*fps)).sort((a,b)=>Math.abs(a.at-f)-Math.abs(b.at-f))[0]??null;
}

// Move only a visibility-generated cut, retaining the minimum length of both
// continuous shots. Never repair an obstruction by switching rigs for one frame.
export function clearCameraBoundary({start,boundary,end,minFrames,maxShift,leftClear,rightClear}){
 for(let shift=0;shift<=maxShift;shift++)for(const cut of shift?[boundary-shift,boundary+shift]:[boundary]){
  if(cut-start<minFrames||end-cut<minFrames)continue;
  let clear=true;
  for(let f=start;f<cut&&clear;f++)clear=leftClear(f);
  for(let f=cut;f<end&&clear;f++)clear=rightClear(f);
  if(clear)return cut;
 }
 return null;
}

// If independently chosen rigs cannot share a clear cut, choose the two rigs
// together. Keep both shots at least0.75s and bound the timing adjustment.
export function clearCameraRigPair({start,boundary,end,minFrames,maxShift,rigCount,isClear,leftOrder,rightOrder}){
 for(let shift=0;shift<=maxShift;shift++)for(const cut of shift?[boundary-shift,boundary+shift]:[boundary]){
  if(cut-start<minFrames||end-cut<minFrames)continue;
  const find=(from,to,order)=>{for(const r of order??Array.from({length:rigCount},(_,i)=>i)){let clear=true;for(let f=from;f<to&&clear;f++)clear=isClear(f,r);if(clear)return r;}return null;};
  const left=find(start,cut,leftOrder);if(left===null)continue;
  const right=find(cut,end,rightOrder);if(right!==null)return {cut,left,right};
 }
 return null;
}

export function trackingShotCycle(vehicle,battle=false){
 if(vehicle==='car')return battle?['lead','chase','side','lead','chase','top']:['lead','chase','side','lead','chase','wide','lead','chase','top'];
 return battle?['wide','lead','side','top','chase']:['wide','lead','side','chase','top','lead','orbit','side'];
}

// An obstructed front/rear shot should try another clear front/rear rig before
// becoming a drone. These remain preferences; the full-body/track/scenery
// checks still decide whether each continuous rig is safe for the whole shot.
export function cameraRigOrder(rigs,kind,vehicle){
 const indices=rigs.map((_,i)=>i);
 if(vehicle!=='car'||!['lead','chase'].includes(kind))return indices;
 const direction=kind==='lead'?1:-1;
 const score=r=>r.back*direction>0&&r.height<=6
   ? (r.surface?0:100)+Math.abs(r.side)*4+Math.abs(Math.abs(r.back)-9)+Math.abs(r.height-2)*2
   : 1000;
 return indices.sort((a,b)=>score(rigs[a])-score(rigs[b])||a-b);
}

// The camera treats the complete tower as opaque. A rider is not a useful
// racing subject until its saved position leaves that same envelope, even
// when the lift animation has already ended.
export function elevatorCameraEnvelope(e) {
  // Legacy cabins retain their envelope. Stairs use the rendered plinth
  // extent with 1 cm clearance; the old extra metre hid riders already out.
  const endPadding = e.stair ? STAIR_PLINTH_EXTRA_LENGTH / 2 + 0.01 : 1;
  return {
    base: [e.center[0], e.center[1] - 2, e.center[2]],
    yaw: Math.atan2(-e.fwd[2], e.fwd[0]),
    box: {x: [-e.length / 2 - endPadding, e.length / 2 + endPadding], y: [0, e.lift + 7], z: [-e.width / 2 - 1, e.width / 2 + 1]},
  };
}
export function elevatorRiderInTransport(e, envelope, position, rider, frame) {
  return e.cycles.some(c => c.riders.includes(rider) && frame >= c.closeAt &&
    (frame < (c.closeTopAt ?? c.openAt) || venueClearance({buildings: Array.isArray(envelope)?envelope:[envelope]}, position) === 0));
}

export function elevatorCameraVolumes(e) {
  const envelope=elevatorCameraEnvelope(e);
  if(!e.stair)return [envelope];
  // The wider plinth exists only at the bottom. Extruding it through the
  // entire tower hides a rider already clear of the upper rungs/header.
  const half=e.length/2+STAIR_RUNG_OFFSET+STAIR_RUNG_THICKNESS/2+.01;
  return [
    {...envelope,box:{...envelope.box,x:[-half,half]}},
    {...envelope,base:[e.center[0],e.center[1]-.58,e.center[2]],box:{...envelope.box,y:[-.13,.13]}},
  ];
}

export function cameraRacingPool(racing, inTransport, onRaceRoad) {
  const visible = racing.filter(i => !inTransport(i));
  const running = visible.filter(onRaceRoad);
  // A visible arrival at the dock is preferable to a leader inside the
  // tower. If everyone really is inside, keep the visibility audit active.
  return running.length ? running : visible.length ? visible : racing;
}

// --- Director -----------------------------------------------------------------------
// One camera per frame, in the style of studio marble-race channels: cameras
// that travel with the marbles (behind the pack, ahead of the leader looking
// back, alongside, overhead, orbiting), shots that wait at each obstacle for
// the pack to arrive, the odd onboard, and the finish-line camera for the win.
// Every shot is smoothed with a zero-lag Gaussian (we can look ahead: it's
// offline), and every candidate shot is raycast against the track first so
// another part of the circuit never blocks the view.
export function directRace({ world, course, frames, finishFrame, crossingFrames = finishFrame, events = [], actionMoments = [], vehicle = course.vehicle, themeId = course.themeId, cockpitEnabled=false, cockpitPresentation=null, sceneryProfile, sceneProps=[], raceStart, winnerFrame, lastFrame, rand, highlights = [], elevators = [], checkpoints = [], gate }, { FPS, MARBLES, LAPS, R, GRID_LENGTH, QUERY_TRACK_ONLY, CAM_FEATURES }) {
  const { L, samples, frameAt, features } = course;
  const N = MARBLES.length;
  const sec = (x) => Math.round(x * FPS);
  const posOf = (f, i) => v3(frames[Math.min(f, lastFrame)][i]);
  const uOf = (f, i) => frames[Math.min(f, lastFrame)][i][7]; // total progress: lap * L + u
  const uLocal = (P) => ((((P + GRID_LENGTH) % L) + L) % L) - GRID_LENGTH;
  const uLoc = (f, i) => uLocal(uOf(f, i));
  const END = course.END;
  const finished = (i, f) => finishFrame[i] !== null && finishFrame[i] <= f;
  const W2 = TRACK.width / 2;
  const elevatorVolumes = elevators.map(elevatorCameraVolumes);
  const inTransport=(i,f)=>elevators.some((e,k)=>elevatorRiderInTransport(e,elevatorVolumes[k],frames[Math.min(f,lastFrame)][i],i,f));


  // Pack focus per frame: always anchored on the Lead / Podium Battle (P1–P4),
  // with continuous distance-decay + overtake-duel weighting so lead swaps never
  // jerk the camera and a marble that slows at an obstacle never drags the camera
  // backward into the mid-pack.
  const rawFocus = [];
  const rawU = [];
  const spread = [];
  const leader = [];
  const isBattle = [];
  for (let f = 0; f <= lastFrame; f++) {
    const racing = [...Array(N).keys()]
      .filter((i) => !finished(i, f))
      .sort((a, b) => uOf(f, b) - uOf(f, a));
    if (!racing.length) {
      leader.push(0);
      rawFocus.push(v3(pointOnTrack(frameAt(course.uFinish), 0, 0.3)));
      rawU.push(course.uFinish);
      spread.push(2);
      isBattle.push(false);
      continue;
    }
    // Exclude marbles queuing for or riding the stair ONLY on non-final laps.
    // On the final lap (`uOf >= (LAPS - 1) * L - GRID_LENGTH`), marbles race all the way to uFinish!
    const pool = cameraRacingPool(racing, i => inTransport(i,f), (i) => {
      const onFinalLap = uOf(f, i) >= (LAPS - 1) * L - GRID_LENGTH;
      if (onFinalLap) return true;
      return uLoc(f, i) < END - 6 && uLoc(f, i) > -GRID_LENGTH + 0.5;
    });
    const p1 = pool[0];
    leader.push(p1);
    // Keep top-4 challengers within 8.5m of P1 (and on the same lap zone so we don't average across the wrap seam).
    const pack = pool.slice(0, 4).filter((i) => uOf(f, p1) - uOf(f, i) < 8.5 && Math.abs(uLoc(f, p1) - uLoc(f, i)) < 14);
    if (!pack.length) pack.push(p1);
    const w = pack.map((i) => Math.exp(-(uOf(f, p1) - uOf(f, i)) / 4.2));
    // Overtake / wheel-to-wheel battle boost: if P1 & P2 (or P2 & P3 close to P1) are within 3.2m,
    // boost both battling marbles equally so the camera frames their duel dead-center.
    let battle = false;
    for (let k = 1; k < pack.length; k++) {
      const gap = uOf(f, pack[k - 1]) - uOf(f, pack[k]);
      if (gap < 3.5) {
        if (k === 1 || uOf(f, p1) - uOf(f, pack[k]) < 5.0) battle = true;
        const boost = 0.75 * Math.exp(-gap / 2.0);
        w[k - 1] += boost;
        w[k] += boost;
      }
    }
    isBattle.push(battle);
    const ws = w.reduce((a, b) => a + b, 0);
    const p = new Vector3();
    let u = 0;
    pack.forEach((i, k) => {
      p.addScaledVector(posOf(f, i), w[k] / ws);
      u += (uLoc(f, i) * w[k]) / ws;
    });
    rawFocus.push(p);
    rawU.push(u);
    spread.push(Math.max(1.2, ...pack.map((i) => posOf(f, i).distanceTo(p))));
  }
  const gauss = (values, sigma, a = 0, b = values.length) => {
    const isVec = values[a] instanceof Vector3;
    const out = values.slice();
    const w = Math.ceil(sigma * 3);
    const kern = Array.from({ length: 2 * w + 1 }, (_, j) => Math.exp(-((j - w) ** 2) / (2 * sigma * sigma)));
    for (let f = a; f < b; f++) {
      let ws = 0;
      const acc = isVec ? new Vector3() : [0];
      for (let j = -w; j <= w; j++) {
        const q = f + j;
        if (q < a || q >= b) continue;
        const k = kern[j + w];
        ws += k;
        if (isVec) acc.addScaledVector(values[q], k);
        else acc[0] += values[q] * k;
      }
      out[f] = isVec ? acc.multiplyScalar(1 / ws) : acc[0] / ws;
    }
    return out;
  };
  // Focus switches: frames where the followed group jumps far (another group takes over). Smoothing
  // across one flew every following camera across the circuit in ~1.4 s; instead the focus is smoothed
  // between switches, and shots are cut there (below).
  const focusSwitches = [];
  for (let f = 1; f <= lastFrame; f++) if (Math.abs(rawU[f] - rawU[f - 1]) > 10 || rawFocus[f].distanceTo(rawFocus[f - 1]) > 10) focusSwitches.push(f);
  if (process.env.GP_FOCUS) for (const f of focusSwitches) console.log(`switch f=${f} head ${leader[f - 1]}→${leader[f]} u ${rawU[f - 1].toFixed(1)}→${rawU[f].toFixed(1)}`);
  let focus = rawFocus;
  let focusU = rawU;
  {
    let a = 0;
    for (const b of [...focusSwitches, lastFrame + 1]) {
      focus = gauss(focus, sec(0.38), a, b);
      focusU = gauss(focusU, sec(0.38), a, b);
      a = b;
    }
  }

  // The venue buildings (grandstands, pits) aren't in the collider: the
  // director asks src/gp/venue.js where they stand, so no camera sits inside
  // one or looks through one.
  const venue = venueLayout(samples, L);
  // The lift towers count as buildings too: no camera inside the lattice, none looking through it.
  venue.buildings.push(...elevatorVolumes.flat());
  const finishGeometry=frameAt(course.uFinish);
  const scenery=createCameraOcclusion({samples,themeId,finishFrame:finishGeometry,width:2*(finishGeometry.w??TRACK.width/2),checkpoints,sceneryProfile,courseLength:L,sceneProps,gate});
  const clear = (from, to) => {
    const dir = to.clone().sub(from);
    const d = dir.length();
    if (d < 0.5) return true;
    if(scenery.blocks(from,to))return false;
    if (venueBlocks(venue, [from.x, from.y, from.z], [to.x, to.y, to.z])) return false;
    dir.normalize();
    const hit = world.castRay(new RAPIER.Ray(from, dir), d, true, undefined, QUERY_TRACK_ONLY);
    return !hit || hit.timeOfImpact > d - 0.8;
  };
  const clearSubject=(from,to,f)=>clear(from,to)&&(vehicle==='car'?carBodyVisible(scenery,from,to,to.carQuaternion,to.carStyle):marbleBodyVisible(scenery,from,to,R))&&(vehicle!=='marble'||to.marbleActorIndex===undefined||marbleActorVisibility(from,to,R,frames[f].filter((_,i)=>i!==to.marbleActorIndex&&!finished(i,f))).visible);
  const trackPts = samples.map((s) => v3(s.p));
  // Room around a camera: distance to the nearest other part of the track and to the venue buildings.
  const roomAt = (pos, uc) => {
    let min = Math.min(venueClearance(venue, [pos.x, pos.y, pos.z]),scenery.clearance(pos));
    samples.forEach((s, k) => {
      if (Math.abs(s.u - uc) < 6) return;
      min = Math.min(min, trackPts[k].distanceTo(pos));
    });
    return min;
  };
  const upW = new Vector3(0, 1, 0);
  const flatRight = (fr) => new Vector3(fr.r[0], 0, fr.r[2]).normalize();
  const flatFwd = (fr) => new Vector3(fr.t[0], 0, fr.t[2]).normalize();

  // Field of view for a fixed camera: zoom in until the leader is at least
  // LEADER_MIN of the frame height, but never so far that the pack's spread
  // falls out of the frame.
  const LEADER_MIN = 0.07; // was 0.14: too tight, the viewer lost the race around the marble
  const fovFor = (pos, f) => {
    const d = Math.max(0.5, pos.distanceTo(posOf(f, leader[f])));
    const forLeader = (2 * Math.atan(R / (LEADER_MIN * d)) * 180) / Math.PI;
    const forPack = (2 * Math.atan((spread[f] + 1.6) / pos.distanceTo(focus[f])) * 180) / Math.PI;
    return Math.min(55, Math.max(32, Math.max(forPack, Math.min(forLeader, 55))));
  };

  // Shot recipes: (frame) → { pos, target, fov }. Built from the smoothed focus.
  const recipes = {
    chase: (f, sh) => {
      // Close & low Marbula-One chase camera right behind the pack so speed and wheel-to-wheel moves pop.
      const nr = sh?.near;
      const fr = frameAt(focusU[f] - (nr ? 2.8 : 3.5));
      return {
        u: focusU[f] - (nr ? 2.8 : 3.5),
        pos: v3(pointInFrame(fr, 0, nr ? 1.3 : 1.55)).add(upW.clone().multiplyScalar(nr ? 0.55 : 0.7)),
        target: focus[f].clone().addScaledVector(flatFwd(frameAt(focusU[f])), 2.0),
        fov: 52,
      };
    },
    lead: (f, sh) => {
      // Low-angle Front Reverse Camera ahead of P1 looking straight back down the trough at P1 and the chasing pack.
      const nr = sh?.near;
      const uLead = Math.max(focusU[f], uLoc(f, leader[f]));
      const uCam = Math.min(uLead + (nr ? 2.8 : 3.4), END);
      const fr = frameAt(uCam);
      const frBack = frameAt(Math.max(-GRID_LENGTH, uLead - 1.5));
      const pLead = posOf(f, leader[f]);
      const pChasers = v3(pointInFrame(frBack, 0, 0.35)).lerp(focus[f], 0.55);
      return {
        u: uCam,
        pos: v3(pointInFrame(fr, 0, nr ? 1.05 : 1.28)).add(upW.clone().multiplyScalar(nr ? 0.35 : 0.45)),
        target: pLead.clone().lerp(pChasers, 0.52),
        fov: 48,
      };
    },
    side: (f, sh) => {
      const fr = frameAt(focusU[f] + 0.6);
      // Close beside the wall, just high enough to look over it — gives huge sense of speed as marbles whip by.
      const pos = v3(fr.p).addScaledVector(flatRight(fr), sh.side * (W2 + (sh.near ? 1.5 : 2.1))).add(upW.clone().multiplyScalar(sh.near ? 2.8 : 3.6));
      return { u: focusU[f] + 0.6, pos, target: focus[f], fov: fovFor(pos, f) };
    },
    top: (f, sh) => {
      const fr = frameAt(focusU[f]);
      return { pos: focus[f].clone().add(upW.clone().multiplyScalar(sh?.near ? 5.0 : 6.2)).addScaledVector(flatFwd(fr), sh?.near ? -2.0 : -2.6), target: focus[f], fov: 44 };
    },
    orbit: (f, sh) => {
      const a = sh.phase + ((f - sh.start) / FPS) * 0.52 * sh.side;
      const rr = sh.near ? 4.4 : 5.4;
      return { pos: focus[f].clone().add(new Vector3(Math.sin(a) * rr, sh.near ? 2.4 : 3.0, Math.cos(a) * rr)), target: focus[f], fov: 44 };
    },
    // Dynamic low helicopter / cable-cam behind the lead pack.
    wide: (f, sh) => {
      const fr = frameAt(focusU[f] - (sh?.near ? 4.2 : 5.6));
      return { u: focusU[f] - (sh?.near ? 4.2 : 5.6), pos: v3(fr.p).add(upW.clone().multiplyScalar(sh?.near ? 3.8 : 4.8)), target: focus[f].clone().addScaledVector(flatFwd(frameAt(focusU[f])), 2.8), fov: 48 };
    },
    feature: (f, sh) => ({ pos: sh.cam, target: focus[f], fov: fovFor(sh.cam, f) }),
    action: (f,sh) => {
      const h=sh.action,at=Math.min(f,h.dq?h.f-1:f);
      const a=posOf(at,h.marble),b=h.other===undefined?a:posOf(at,h.other),target=a.clone().lerp(b,.5);
      const fr=frameAt(uLoc(at,h.marble));
      return {pos:target.clone().addScaledVector(flatRight(fr),(h.side??1)*(h.out??W2+4)).addScaledVector(flatFwd(fr),h.back??-3).addScaledVector(upW,h.up??6),target,fov:52};
    },
    finish: (f, sh) => {
      const line=v3(fs.p).add(new Vector3(0,.42,0));
      const crossing=crossingFrames.map((at,i)=>({at,i})).filter(x=>x.at!==null&&x.at>=f-sec(.6)).sort((a,b)=>a.at-b.at)[0];
      const racer=crossing&&crossing.at-f<sec(2)?posOf(Math.min(f,crossing.at),crossing.i):line;
      const target=line.clone().lerp(racer,.5);
      const radius=Math.max(3.5,line.distanceTo(racer)*.55+1.5),distance=sh.cam.distanceTo(target);
      return {pos:sh.cam,target,fov:Math.min(72,Math.max(44,2*Math.atan(radius/distance)*180/Math.PI))};
    },
    cockpit: (f,sh)=>{
      const row=frames[f][sh.marble],next=frames[Math.min(lastFrame,f+1)][sh.marble];
      const speed=Math.hypot(...next.slice(0,3).map((v,k)=>v-row[k]))*FPS;
      const camera=cockpitCamera(row.slice(0,3),row.slice(3,7),cockpitRoadOptions(samples,uLoc(f,sh.marble),speed,cockpitPresentation));
      return {pos:v3(camera.pos),target:v3(camera.target),up:v3(camera.up),fov:camera.fov,u:uLoc(f,sh.marble)};
    },
    onboard: (f, sh) => {
      const i = sh.marble;
      const u = uLoc(f, i);
      const p = posOf(f, i);
      const fr = frameAt(u);
      const lat = v3(fr.r).dot(p.clone().sub(v3(fr.p)));
      return {
        pos: v3(pointInFrame(frameAt(u - 2.2), lat * 0.7, 0.95 + surfaceY(lat))),
        target: v3(pointInFrame(frameAt(u + 3), lat * 0.4, 0.3 + surfaceY(lat * 0.4))),
        fov: 64,
      };
    },
  };
  const surfaceY = (lat) => surfaceHeightAt(lat);
  // First person is audited against the road corridor ahead, not the driver's
  // own car (which is correctly behind/below the eye). External cameras retain
  // the full-body visibility audit unchanged.
  const seatLens=new PerspectiveCamera(64,16/9,.018,1500);
  const cockpitFrameClear=(f,sh)=>{
    if(finished(sh.marble,f)||inTransport(sh.marble,f))return false;
    const c=recipes.cockpit(f,sh),road=frameAt(Math.min(END,uLoc(f,sh.marble)+2.5));
    const ahead=v3(road.p).addScaledVector(v3(road.n),.36);
    if(scenery.clearance(c.pos)<.08||!clear(c.pos,ahead))return false;
    seatLens.fov=c.fov;seatLens.updateProjectionMatrix();
    seatLens.position.copy(c.pos);seatLens.up.copy(c.up);seatLens.lookAt(c.target);seatLens.updateMatrixWorld();
    const point=ahead.clone().project(seatLens);
    const roadClear=point.z>-1&&point.z<1&&Math.abs(point.x)<.92&&Math.abs(point.y)<.88;
    if(!roadClear||cockpitPresentation!=='race-seat-v2')return roadClear;
    for(const distance of [8,20]){
      const fr=frameAt(Math.min(END,uLoc(f,sh.marble)+distance));
      const p=v3(fr.p).addScaledVector(v3(fr.n),.5),q=p.clone().project(seatLens);
      if(q.z<=-1||q.z>=1||Math.abs(q.x)>.9||Math.abs(q.y)>.8||!clear(c.pos,p))return false;
    }
    // A clear windscreen alone adds no value. Keep a visible rival in every
    // frame of a new driver shot; otherwise let an exterior battle camera win.
    return Array.from({length:N},(_,i)=>i).some(i=>{
      const gap=uOf(f,i)-uOf(f,sh.marble);
      if(i===sh.marble||finished(i,f)||inTransport(i,f)||gap<1.5||gap>40)return false;
      const rival=posOf(f,i),q=rival.clone().project(seatLens);
      return q.z>-1&&q.z<1&&Math.abs(q.x)<.82&&Math.abs(q.y)<.72&&clear(c.pos,rival);
    });
  };
  // A shot is usable only if every sampled moment has its race subject in
  // the frame (not at the very edge), not hidden behind the trough's own wall
  // or another part of the circuit, and big enough to read.
  const lens = new PerspectiveCamera(40, 16 / 9, 0.05, 1500);
  const lvWhy = {};
  const leaderVisible = (c, f, i = leader[f]) => {
    const p = posOf(f, i);
    lens.fov = c.fov;
    lens.updateProjectionMatrix();
    lens.position.copy(c.pos);
    lens.lookAt(c.target);
    lens.updateMatrixWorld();
    const ndc = p.clone().project(lens);
    const tally = (k) => (lvWhy[k] = (lvWhy[k] ?? 0) + 1);
    if (ndc.z <= -1 || ndc.z >= 1 || Math.abs(ndc.x) > 0.8 || Math.abs(ndc.y) > 0.8) return tally(ndc.z >= 1 ? "behind" : "edge"), false;
    const d = c.pos.distanceTo(p);
    const apparent = (2 * R) / (2 * d * Math.tan((c.fov * Math.PI) / 360)); // fraction of frame height
    if (apparent < 0.025) return tally("small"), false;
    const ok = clear(c.pos, p);
    if (!ok) tally("blocked");
    return ok;
  };
  const why = {};
  const usable = (kind, sh, f0, f1) => {
    let ok = 0;
    const n = Math.max(7, Math.ceil((f1-f0) / sec(.3)));
    for (let k = 0; k < n; k++) {
      const f = Math.min(lastFrame, Math.round(f0 + ((f1 - 1 - f0) * k) / (n - 1)));
      const c = recipes[kind](f, sh);
      if (roomAt(c.pos, c.u ?? focusU[f]) < 1.35) {
        why[kind + ":room"] = (why[kind + ":room"] ?? 0) + 1;
        return false;
      }
      const subjects=kind==='action'?[sh.action.marble,sh.action.other].filter(i=>i!==undefined):[leader[f]];
      if (subjects.every(i=>leaderVisible(c,sh.action?.dq?Math.min(f,sh.action.f-1):f,i))) ok++;
    }
    if (ok < n) why[kind + ":view"] = (why[kind + ":view"] ?? 0) + 1;
    return ok === n;
  };
  if (process.env.GP_SHOTS) process.on("exit", () => console.log("rejected shots:", JSON.stringify(why), "leader not visible:", JSON.stringify(lvWhy)));

  // One locked camera per obstacle, chosen from candidates on both sides,
  // upstream and downstream, low and high: the one that sees the leader best
  // over the frames the pack actually spends there (we know them all).
  // Every obstacle, every lap: the window is each pass of the focus through its zone.
  const windows = [];
  for (const f of features) {
    if (["elevator", "lift", "regroup"].includes(f.type)) continue;
    const zoneA = f.u - f.span[0];
    const zoneB = f.u + f.span[1];
    let from = 0;
    for (let pass = 0; pass < LAPS; pass++) {
      let start = -1;
      for (let fr = from; fr <= lastFrame; fr++) {
        if (focusU[fr] >= zoneA - 2 && focusU[fr] < zoneA + 2) {
          start = fr;
          break;
        }
      }
      if (start < 0) break;
      let end = start + sec(1.5);
      while (end < start + sec(6.5) && end <= lastFrame && focusU[end] < zoneB + 1 && focusU[end] >= zoneA - 3) end++;
      windows.push({ f, start, end });
      from = end + sec(8);
    }
  }
  const featureCams = windows
    .map(({ f, start, end }) => {
      const zoneA = f.u - f.span[0];
      const zoneB = f.u + f.span[1];
      const mid = (zoneA + zoneB) / 2;
      const cands = [];
      if (f.type === "vortex") {
        const fr = frameAt(f.u + VORTEX.entry);
        for (const side of [-1, 1])
          for (const [du, lat, lift] of [[5.5, W2 + 2.2, 5.6], [-2.5, W2 + 2.5, 5.6], [4.5, 0, 6.6]]) {
            cands.push(v3(fr.p).addScaledVector(flatFwd(fr), du).addScaledVector(flatRight(fr), side * lat).add(new Vector3(0, lift, 0)));
          }
      }
      for (const side of [1, -1])
        for (const du of [-4, 4])
          for (const [lat, lift] of [[W2 + 2.2, 3.0], [W2 + 3.2, 5.0], [W2 + 1.4, 2.4]]) {
            const fr = frameAt(mid + du);
            cands.push(v3(fr.p).addScaledVector(flatRight(fr), side * lat).add(new Vector3(0, lift, 0)));
          }
      let best = null;
      for (const pos of cands) {
        if (roomAt(pos, mid) < 1.6) continue;
        let score = 0;
        const n = 8;
        for (let k = 0; k < n; k++) {
          const fr = Math.min(lastFrame, Math.round(start + ((end - 1 - start) * k) / (n - 1)));
          if (leaderVisible({ pos, target: focus[fr], fov: fovFor(pos, fr) }, fr)) score++;
        }
        if (score >= 6 && (best === null || score > best.score)) best = { pos, score };
      }
      if (process.env.GP_SHOTS) console.log(`  cam ${f.type}@${f.u.toFixed(0)}: window ${start}-${end}, best score ${best ? best.score : "none"}/8`);
      return best ? { ...f, cam: best.pos, start, end: Math.min(end, lastFrame + 1), used: false } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  const fs = frameAt(course.uFinish);
  const finishCam = (() => {
    let best = null;
    for (const side of [1, -1])
      for (const [du, out, up] of [[-8, W2 + 6, 7.5], [-5, W2 + 7, 8], [-11, W2 + 5, 8.5]]) {
        const at = frameAt(course.uFinish + du);
        const cam = v3(at.p).addScaledVector(flatRight(at), side * out).add(new Vector3(0, up, 0));
        if (roomAt(cam, course.uFinish + du) < 1.5) continue;
        let score = 0;
        for (let u = course.uFinish - 22; u <= course.uFinish + 1; u += 2) if (clear(cam, v3(frameAt(u).p).add(new Vector3(0, 0.4, 0)))) score++;
        if (best === null || score > best.score) best = { cam, score };
      }
    return best ? best.cam : v3(fs.p).addScaledVector(flatRight(fs), W2 + 3).add(new Vector3(0, 4.6, 0)).addScaledVector(flatFwd(fs), -1.5);
  })();
  const replayCam = v3(fs.p).addScaledVector(flatRight(fs), W2 + 0.9).add(new Vector3(0, 4.2, 0));
  // Drone reveal of the whole circuit.
  const box = { min: new Vector3(Infinity, Infinity, Infinity), max: new Vector3(-Infinity, -Infinity, -Infinity) };
  for (const p of trackPts) {
    box.min.min(p);
    box.max.max(p);
  }
  const center = box.min.clone().add(box.max).multiplyScalar(0.5);
  const extent = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  const heli = { center: arr(center), extent: r3(extent) };

  // --- Shot list -------------------------------------------------------------------
  const shots = [];
  const REVEAL = sec(0.5);
  shots.push({ kind: "drone", start: 0, end: REVEAL });
  const gridEnd = raceStart + sec(2.0); // hold until the ten lanes have funnelled into the track
  shots.push({ kind: "grid", start: REVEAL, end: gridEnd });
  const cycle = trackingShotCycle(vehicle);
  const battleCycle = trackingShotCycle(vehicle,true);
  let ci = 0;
  let bci = 0;
  let nextCockpitAt=gridEnd+sec(4),lastCockpitDriver=-1;
  let f = gridEnd;
  const finishWindows = finishCoverageWindows(crossingFrames,FPS,gridEnd,lastFrame);
  const liveActions = selectActionWindows([...events.filter(e=>(e.kind==='overtake'&&(e.pos<=3||vehicle==='car'))||e.kind==='dq').map(e=>({f:e.frame,marble:e.a,other:e.kind==='overtake'?e.b:undefined,overtake:e.kind==='overtake',dq:e.kind==='dq',label:e.kind==='overtake'?'OVERTAKE':'ELIMINATION'})),...actionMoments.filter(h=>h.f<winnerFrame-sec(7)&&(finishFrame[h.marble]===null||finishFrame[h.marble]>h.f+sec(2))),...highlights.filter(h=>!h.dq&&!h.overtake&&!["lift","elevator","regroup"].includes(h.feature))]
    .map(h=>({...h,start:Math.max(gridEnd,h.f-sec(1.2)),end:Math.min(lastFrame+1,h.f+sec(h.dq?.15:1.8)),used:false}))
    ,sec(3.8));
  while (f <= lastFrame) {
    let sh = null;
    const finishWindow=finishWindows.find(w=>f>=w.start-sec(.8)&&f<w.end);
    if (finishWindow) sh={kind:'finish',cam:finishCam,start:f,end:finishWindow.end};
    else {
      const action=liveActions.find(a=>!a.used&&f>=a.start-sec(1.2)&&f<a.end-sec(.3));
      if(action){
        action.used=true;
        // The old single right-side rig rejected every action shot in the
        // Alpine village. Try both sides and clear overhead rigs before
        // returning to normal coverage; the final full-body audit still runs.
        const rigs=[...[-1,1].flatMap(side=>[3.8,6,9,13].map(up=>({side,up,out:W2+3,back:-3}))),{side:1,up:10,out:0,back:-4},{side:1,up:15,out:0,back:-5}];
        for(const rig of rigs){
          const cand={kind:'action',action:{...action,...rig},marble:action.marble,label:action.label,start:f,end:action.end};
          if(usable('action',cand,f,cand.end)){sh=cand;break;}
        }
      }
      if(!sh&&vehicle==='car'&&cockpitEnabled&&f>=nextCockpitAt&&f<winnerFrame-sec(5)){
        const nextAction=liveActions.find(a=>!a.used&&a.start>f),nextFinish=finishWindows.find(w=>w.start>f);
        const end=Math.min(f+sec(2.6),nextAction?.start??Infinity,nextFinish?.start??Infinity,lastFrame+1);
        const featureDue=featureCams.some(c=>!c.used&&CAM_FEATURES.includes(c.type)&&c.start<end&&c.end>f);
        if(!featureDue&&end-f>=sec(2)){
          const candidates=Array.from({length:N},(_,i)=>i).filter(i=>!finished(i,f)&&!inTransport(i,f)).map(i=>{
            const gap=Math.min(...Array.from({length:N},(_,j)=>j).filter(j=>j!==i&&!finished(j,f)&&uOf(f,j)>uOf(f,i)+1).map(j=>uOf(f,j)-uOf(f,i)));
            return {i,score:(gap<22?gap:50)+(i===lastCockpitDriver?8:0)};
          }).sort((a,b)=>a.score-b.score);
          for(const {i}of candidates){
            const candidate={kind:'cockpit',start:f,end,marble:i,label:'DRIVER CAM'};
            let clearShot=true;for(let at=f;at<end&&clearShot;at++)clearShot=cockpitFrameClear(at,candidate);
            if(clearShot){sh=candidate;lastCockpitDriver=i;nextCockpitAt=end+sec(11);break;}
          }
        }
      }
      // Marbula-One style dynamic cutting: obstacle cameras and 3.8s-5.0s tracking/lead/side shots
      const settled = shots.length === 0 || f - shots[shots.length - 1].start >= sec(4.0);
      const fc = sh || !settled ? null : featureCams.find((c) => !c.used && CAM_FEATURES.includes(c.type) && f >= c.start - sec(1.0) && f < c.end - sec(1.5));
      if (fc) {
        fc.used = true;
        sh = { kind: "feature", cam: fc.cam, label: fc.label, feature: fc.type, start: f, end: Math.max(f + sec(3.6), fc.end) };
      }
      const nextFc = featureCams.find((c) => !c.used && CAM_FEATURES.includes(c.type) && c.start > f);
      const nextAction=liveActions.find(a=>!a.used&&a.start>f);
      const nextFinish=finishWindows.find(w=>w.start>f);
      const capAt = Math.min(nextFc ? Math.max(f + sec(2.5), nextFc.start) : Infinity,nextAction?.start??Infinity,nextFinish?.start??Infinity);
      let battleCount = 0;
      const checkEnd = Math.min(lastFrame, f + sec(4));
      for (let q = f; q <= checkEnd; q++) if (isBattle[q]) battleCount++;
      const useBattle = battleCount >= (checkEnd - f + 1) * 0.35 || winnerFrame - f <= sec(10);
      const activeCycle = useBattle ? battleCycle : cycle;
      for (let tries = 0; !sh && tries < activeCycle.length; tries++) {
        const kind = activeCycle[(useBattle ? bci++ : ci++) % activeCycle.length];
        const len = sec(kind === "top" ? 3.6 : 3.8 + rand() * 1.4);
        const cand = { kind, start: f, end: f + len, side: rand() < 0.5 ? 1 : -1, phase: rand() * Math.PI * 2 };
        cand.end = Math.min(cand.end, capAt);
        if (usable(kind, cand, f, Math.min(cand.end, lastFrame + 1))) sh = cand;
        else {
          cand.near = true;
          if (usable(kind, cand, f, Math.min(cand.end, lastFrame + 1))) sh = cand;
        }
      }
      if (!sh) sh = { kind: "top", start: f, end: Math.min(f + sec(3), capAt) };
      sh.end=Math.min(sh.end,capAt);

    }
    sh.end = Math.min(Math.max(sh.end, f + 1), lastFrame + 1);
    shots.push(sh);
    f = sh.end;
  }

  // --- Frames ------------------------------------------------------------------------
  const pos = [];
  const target = [];
  const fov = [];
  const kind = [];
  const marble = [];
  const droneAt = (k) => {
    const a = -0.5 + k * 0.6;
    return center.clone().add(new Vector3(Math.sin(a) * extent * 0.62, extent * 0.55, Math.cos(a) * extent * 0.62));
  };
  // A shot that follows the focus is cut where the focus switches group (see focusSwitches).
  // Never shift or split the "finish" shot!
  const FOLLOWING = ["chase", "lead", "side", "top", "orbit", "wide", "feature"];
  // A switch near a shot's start or end moves that cut onto the switch (the neighbouring shot absorbs
  // the difference) instead of leaving a sliver of a shot: never a piece under MIN_PIECE.
  const MIN_PIECE = sec(1.5);
  for (let k = 0; k < shots.length; k++) {
    const sh = shots[k];
    if (!FOLLOWING.includes(sh.kind)) continue;
    const at = focusSwitches.find((x) => x > sh.start && x < sh.end);
    if (at === undefined) continue;
    const prev = shots[k - 1];
    const next = shots[k + 1];
    const head = at - sh.start;
    const tail = sh.end - at;
    if (head < MIN_PIECE && prev && FOLLOWING.includes(prev.kind) && (tail >= head || !next)) {
      prev.end = at;
      sh.start = at;
      k--; // look at this shot again (another switch may follow)
      continue;
    }
    if (tail < MIN_PIECE && next && FOLLOWING.includes(next.kind)) {
      next.start = at;
      sh.end = at;
      continue;
    }
    shots.splice(k + 1, 0, { ...sh, start: at });
    sh.end = at;
  }
  for (let k = 1; k < shots.length; k++) {
    const prev = shots[k - 1];
    const cur = shots[k];
    if (FOLLOWING.includes(prev.kind) && prev.kind === cur.kind && Boolean(prev.near) === Boolean(cur.near) && !focusSwitches.includes(cur.start) && cur.end - prev.start <= sec(8.5)) {
      prev.end = cur.end;
      shots.splice(k, 1);
      k--;
    }
  }
  // Behind the grid, looking past the marbles to the start gantry.
  const gridPos = v3(pointInFrame(frameAt(-11.5), 0, 4.6));
  const gridTarget = v3(pointOnTrack(frameAt(0.5), 0, 0.4));
  for (const sh of shots) {
    for (let fr = sh.start; fr < sh.end; fr++) {
      let c;
      if (sh.kind === "drone") c = { pos: droneAt((fr - sh.start) / (sh.end - sh.start)), target: center, fov: 40 };
      else if (sh.kind === "grid") c = { pos: gridPos, target: gridTarget, fov: 36 };
      else c = recipes[sh.kind](fr, sh);
      pos.push(c.pos.clone());
      target.push(c.target.clone());
      fov.push(c.fov);
      kind.push(sh.kind);
      marble.push(sh.marble ?? null);
    }
  }
  // Smooth inside each shot (cuts stay hard).
  let sp = pos;
  let st = target;
  let sf = fov;
  for (const sh of shots) {
    if(sh.kind==='cockpit')continue; // Eye stays attached to the actual chassis.
    const sigma = sh.kind === "onboard" ? sec(0.25) : sec(0.75);
    sp = gauss(sp, sigma, sh.start, sh.end);
    st = gauss(st, sigma, sh.start, sh.end);
    sf = gauss(sf, sec(0.75), sh.start, sh.end);
  }
  // Smoothing is not proof of framing. Re-aim after it, and zoom out just enough
  // to keep the leader (or both action subjects) inside the picture's safe area.
  const framingAudit={correctedFrames:0,unresolvedFramingFrames:[],unresolvedOcclusionFrames:[],cockpitFrames:0,cockpitShots:shots.filter(s=>s.kind==='cockpit').length,bodyEnvelope:vehicle==='car'?{horizontal:1,vertical:.5,minDistance:3.5}:null,sceneryEnvelopes:scenery.counts,themeId:themeId??null,fallbackShots:[],occlusionCuts:[]};
  const subjects=new Map(),fallbackShots=new Set();
  const fits=(f,points)=>{lens.fov=sf[f];lens.updateProjectionMatrix();lens.position.copy(sp[f]);lens.lookAt(st[f]);lens.updateMatrixWorld();const fullBody=vehicle==='car'&&kind[f]!=='onboard';return points.every(p=>{
      if(fullBody&&sp[f].distanceTo(p)<3.5)return false;
      const bounds=fullBody?[-1,1].flatMap(x=>[-.5,.5].flatMap(y=>[-1,1].map(z=>p.clone().add(new Vector3(x,y,z))))):[p];
      return bounds.every(point=>{const q=point.clone().project(lens);return q.z>-1&&q.z<1&&Math.abs(q.x)<.78&&Math.abs(q.y)<.76;});
    });};
  for(let f=gridEnd;f<=lastFrame;f++){
    const sh=shots.find(s=>f>=s.start&&f<s.end);
    if(sh.kind==='cockpit'){
      framingAudit.cockpitFrames++;
      if(!cockpitFrameClear(f,sh))framingAudit.unresolvedOcclusionFrames.push(f);
      continue;
    }
    const finishSubject=sh.kind==='finish'?finishSubjectAt(crossingFrames,f,FPS):null;
    const ids=finishSubject?[finishSubject.i]:sh.kind==='action'?[sh.action.marble,sh.action.other].filter(i=>i!==undefined&&!finished(i,f)):[leader[f]];
    if(!ids.length||(!finishSubject&&ids.every(i=>finished(i,f))))continue;
    // A close chaser is part of the story. Frame the duel, not only P1's centre.
    if(vehicle==='car'&&['lead','chase','side','wide','top','orbit'].includes(sh.kind)){
      const head=ids[0],chaser=Array.from({length:N},(_,i)=>i).filter(i=>i!==head&&!finished(i,f)&&!inTransport(i,f)&&Math.abs(uOf(f,head)-uOf(f,i))<=7).sort((a,b)=>Math.abs(uOf(f,head)-uOf(f,a))-Math.abs(uOf(f,head)-uOf(f,b)))[0];
      if(chaser!==undefined)ids.push(chaser);
    }
    const points=ids.map(i=>{const at=finishSubject?Math.min(f,finishSubject.at):f,p=posOf(at,i);if(vehicle==='marble')p.marbleActorIndex=i;if(vehicle==='car'){p.carQuaternion=frames[Math.min(at,lastFrame)][i].slice(3,7);p.carStyle=({F1:0,GT:1,BGY:2,JET:3})[MARBLES[i].stats?.cls]??i%4;}return p;});
    if(sh.kind==='finish'){points.push(v3(fs.p).add(new Vector3(0,.42,0)));if(!finished(leader[f],f)&&!ids.includes(leader[f])&&Math.abs(uOf(f,leader[f])-course.uFinish)<=22)points.push(posOf(f,leader[f]));}
    subjects.set(f,points);
    if(!fits(f,points))framingAudit.correctedFrames++;
    st[f]=points.reduce((sum,p)=>sum.add(p),new Vector3()).multiplyScalar(1/points.length);
    while(!fits(f,points)&&sf[f]<74)sf[f]+=2;
    if(!fits(f,points)||scenery.clearance(sp[f])<.35||!points.every(p=>clearSubject(sp[f],p,f)))fallbackShots.add(sh);
  }
  // Keep aim and fallback rigs continuous across the entire authored shot.
  // A blocked single frame must not make a camera jump up and down for one frame.
  for(const sh of shots)if(sh.kind!=='cockpit')st=gauss(st,sec(.15),sh.start,sh.end);
  // Aim smoothing can create a new framing/occlusion failure at a shot boundary.
  // Recheck the final aim before choosing one continuous rig for the whole shot.
  for(const [f,points]of subjects){const savedFov=sf[f];sf[f]=78;const valid=fits(f,points)&&scenery.clearance(sp[f])>=.35&&points.every(p=>clearSubject(sp[f],p,f));sf[f]=savedFov;if(!valid)fallbackShots.add(shots.find(s=>f>=s.start&&f<s.end));}
  // Low bumper-height tracking can see beneath a checkpoint board on a slope.
  // These are last-resort continuous rigs, subject to the same track, scenery,
  // clearance and full-body framing checks as the higher cameras.
  const rigs=[];for(const height of [8,12,16,22,10,14,18,20,6,4,2.2,2.8,3.4,1,1.5,.5,.75])for(const back of [-6,6,-12,12,-3,3,-9,9,-18,18])for(const side of [0,6,-6,12,-12,3,-3,9,-9])rigs.push({height,side,back});
  // On a descending bend, a low camera at a fixed world height may be inside
  // the uphill road. Last-resort tracking rigs follow the actual road normal
  // at their own longitudinal position, retaining a continuous clear shot.
  for(const height of [1.2,1.6,2])for(const back of [-6,6,-9,9,-12,12])for(const side of [0,-3,3])rigs.push({height,side,back,surface:true});
  // Fast final approaches can span more ground than a 22m rig can frame.
  // Reserve taller continuous drones for finish coverage; the same full-body,
  // road and scenery gates still decide whether any candidate is usable.
  const normalRigCount=rigs.length;
  for(const height of [28,36,48])for(const back of [-6,6,-12,12,-18,18])for(const side of [0,6,-6,12,-12])rigs.push({height,side,back});
  const rigOrders=new Map(shots.map(sh=>[sh.kind,cameraRigOrder(rigs,sh.kind,vehicle).filter(i=>sh.kind==='finish'||i<normalRigCount)]));
  // A rig/frame test is unchanged when a shot is split. Cache those booleans
  // in bounded byte arrays instead of repeating expensive scenery ray casts.
  const rigValidity=rigs.map(()=>new Int8Array(lastFrame+1));
  // After a finisher change, focusU can jump to a different road tangent.
  // Anchor finish-shot orientation to the line while retaining the moving aim.
  const rigPosition=(f,rig)=>{if(rig.surface)return v3(pointInFrame(frameAt(focusU[f]+rig.back),rig.side,rig.height));const fr=frameAt(kind[f]==='finish'?course.uFinish:focusU[f]);return st[f].clone().addScaledVector(flatRight(fr),rig.side).addScaledVector(flatFwd(fr),rig.back).addScaledVector(upW,rig.height);};
  const rigClear=(f,index)=>{
    if(!subjects.has(f))return true;
    const cached=rigValidity[index];
    if(cached[f]===0){const p=rigPosition(f,rigs[index]),originalPos=sp[f],originalFov=sf[f];sp[f]=p;sf[f]=78;const framed=fits(f,subjects.get(f));sp[f]=originalPos;sf[f]=originalFov;cached[f]=framed&&scenery.clearance(p)>=.35&&subjects.get(f).every(q=>clearSubject(p,q,f))?1:-1;}
    return cached[f]>0;
  };
  const shotOrigins=new Map(shots.map(sh=>[sh,sh])),selectedRigs=new Map();
  const pendingRigs=[...fallbackShots];
  for(let index=0;index<pendingRigs.length;index++){
    const sh=pendingRigs[index];
    const span=Array.from({length:sh.end-sh.start},(_,i)=>sh.start+i).filter(f=>subjects.has(f));let best=null;
    for(const rigIndex of rigOrders.get(sh.kind)){
      const rig=rigs[rigIndex];
      const path=new Map();let blocked=0;
      for(const f of span){path.set(f,rigPosition(f,rig));if(!rigClear(f,rigIndex))blocked++;if(best&&blocked>best.blocked)break;}
      if(!best||blocked<best.blocked)best={rig,rigIndex,path,blocked};if(blocked===0)break;
    }
    // A tall drone may be necessary only for the distant final approach.
    // Cut once the cars approach the line so the crossing can use a closer rig,
    // instead of keeping the entire arrival in a distant aerial for eight seconds.
    if(best?.blocked===0&&best.rig.height>22&&sh.kind==='finish'&&sh.end-sh.start>=sec(3)){
      const cut=sh.start+sec(1.2),next={...sh,start:cut};
      shotOrigins.set(next,shotOrigins.get(sh));sh.end=cut;
      shots.splice(shots.indexOf(sh)+1,0,next);pendingRigs.push(sh,next);
      framingAudit.occlusionCuts.push(cut);continue;
    }
    // A long moving shot may have no single unobstructed rig. Make an authored
    // cut into two shots of at least0.75s. Checkpoint crossings need short
    // continuous approach/departure shots, never a one-frame rescue/pop.
    if(best?.blocked&&sh.end-sh.start>=sec(1.5)){
      const cut=Math.floor((sh.start+sh.end)/2),next={...sh,start:cut};
      shotOrigins.set(next,shotOrigins.get(sh));
      sh.end=cut;shots.splice(shots.indexOf(sh)+1,0,next);pendingRigs.push(sh,next);
      framingAudit.occlusionCuts.push(cut);continue;
    }
    if(best){for(const f of span){if(best.path.has(f))sp[f]=best.path.get(f);sf[f]=55;}selectedRigs.set(sh,best);}
  }
  framingAudit.occlusionBoundaryAdjustments=[];
  for(let i=1;i<shots.length;i++){
    const left=shots[i-1],right=shots[i];let a=selectedRigs.get(left),b=selectedRigs.get(right);
    if(!a||!b||shotOrigins.get(left)!==shotOrigins.get(right))continue;
    let cut=clearCameraBoundary({start:left.start,boundary:left.end,end:right.end,minFrames:sec(.75),maxShift:sec(.5),leftClear:f=>rigClear(f,a.rigIndex),rightClear:f=>rigClear(f,b.rigIndex)});
    if(cut===null){
      const pair=clearCameraRigPair({start:left.start,boundary:left.end,end:right.end,minFrames:sec(.75),maxShift:sec(.5),rigCount:rigs.length,isClear:rigClear,leftOrder:rigOrders.get(left.kind),rightOrder:rigOrders.get(right.kind)});
      if(pair){cut=pair.cut;a={rig:rigs[pair.left],rigIndex:pair.left};b={rig:rigs[pair.right],rigIndex:pair.right};selectedRigs.set(left,a);selectedRigs.set(right,b);}
    }
    if(cut===null)continue;
    const before=left.end;left.end=cut;right.start=cut;
    framingAudit.occlusionCuts=framingAudit.occlusionCuts.map(f=>f===before?cut:f);
    framingAudit.occlusionBoundaryAdjustments.push({from:before,to:cut});
    for(const [sh,choice]of [[left,a],[right,b]])for(let f=sh.start;f<sh.end;f++)if(subjects.has(f)){sp[f]=rigPosition(f,choice.rig);sf[f]=55;}
  }
  framingAudit.fallbackShots=[...selectedRigs].map(([sh,choice])=>({start:sh.start,end:sh.end,...choice.rig,blocked:Array.from({length:sh.end-sh.start},(_,i)=>sh.start+i).filter(f=>!rigClear(f,choice.rigIndex)).length}));
  for(const [f,points]of subjects){while(!fits(f,points)&&sf[f]<78)sf[f]+=1;if(!fits(f,points))framingAudit.unresolvedFramingFrames.push(f);if(scenery.clearance(sp[f])<.35||!points.every(p=>clearSubject(sp[f],p,f)))framingAudit.unresolvedOcclusionFrames.push(f);}
  const cams = sp.map((p, k) => [...arr(p), ...arr(st[k]), r3(sf[k]), kind[k], marble[k]]);
  const origCams = cams.map((c) => c.slice());

  // Replay cameras for the highlights: a close tracking camera in the trough for overtakes,
  // or a fixed low camera beside the impact for obstacle hits.
  const highlightCams = highlights.map((h) => {
    // A drained marble is moved out of the world on its DQ frame: frame it where it last was.
    const until = (g) => (h.dq ? Math.min(g, h.f - 1) : g);
    const pointAt = (g) => {
      const pA = posOf(until(g), h.marble);
      if (h.overtake && h.other !== undefined) {
        const pB = posOf(until(g), h.other);
        return pA.clone().lerp(pB, 0.45);
      }
      return pA;
    };
    if (h.overtake) {
      // Dynamic close tracking camera right above the trough so both battling marbles are framed clearly with zero occlusion:
      const rawPos = [];
      const rawTgt = [];
      for (let g = h.from; g <= h.to; g++) {
        const uMid = 0.55 * uLoc(until(g), h.marble) + 0.45 * uLoc(until(g), h.other ?? h.marble);
        const fr = frameAt(Math.max(1, uMid - 3.8));
        const pCam = v3(pointInFrame(fr, 0, 1.85)).add(upW.clone().multiplyScalar(0.95));
        rawPos.push(pCam);
        rawTgt.push(pointAt(g).addScaledVector(flatFwd(frameAt(uMid)), 1.2));
      }
      const smPos = gauss(rawPos, sec(0.2));
      const smTgt = gauss(rawTgt, sec(0.18));
      return smTgt.map((t, idx) => [...arr(smPos[idx]), ...arr(t), 44]);
    }
    const u = uLoc(until(h.f), h.marble); // lap-local: on laps 2 and 3 the total progress put the camera at the track's end
    const fr = frameAt(u + 0.8);
    let best = null;
    for (const side of [1, -1])
      for (const [lat, lift] of [[W2 + 1.6, 2.2], [W2 + 2.6, 3.4]]) {
        const pos = v3(fr.p).addScaledVector(flatRight(fr), side * lat).add(new Vector3(0, lift, 0));
        if (roomAt(pos, u) < 1.4) continue;
        let score = 0;
        for (let g = h.from; g <= h.to; g += 6) if (clear(pos, pointAt(g))) score++;
        if (best === null || score > best.score) best = { pos, score };
      }
    const pos = best ? best.pos : v3(pointInFrame(frameAt(Math.max(1, u - 3.6)), 0, 1.9)).add(new Vector3(0, 1.0, 0));
    const path = [];
    for (let g = h.from; g <= h.to; g++) path.push(pointAt(g));
    const sm = gauss(path, sec(0.15));
    // At a machine, the machine is in the shot too (a tight frame on the marble
    // showed "THE HAMMER" with no hammer): aim between them and open the lens to fit both.
    const machine = course.features
      .filter((g) => g.type === h.feature && !["drop", "jump", "bumps", "crest", "lift", "elevator", "regroup"].includes(g.type))
      .sort((a, b) => Math.abs(a.u - uLoc(h.f, h.marble)) - Math.abs(b.u - uLoc(h.f, h.marble)))[0];
    const anchor = machine && Math.abs(machine.u - uLoc(h.f, h.marble)) < 12 ? v3(frameAt(machine.u + 1).p).add(new Vector3(0, 1.0, 0)) : null;
    return sm.map((t) => {
      const d = Math.max(0.5, pos.distanceTo(t));
      let fov = Math.min(40, Math.max(18, (2 * Math.atan(R / (0.2 * d)) * 180) / Math.PI));
      let target = t;
      if (anchor && anchor.distanceTo(t) < 9) {
        target = t.clone().lerp(anchor, 0.4);
        const a = pos.clone().sub(t).normalize().angleTo(pos.clone().sub(anchor).normalize());
        fov = Math.min(58, Math.max(fov, (a * 180) / Math.PI * 1.5 + 12));
      }
      return [...arr(pos), ...arr(target), r3(fov)];
    });
  });
  // --- Split screen ----------------------------------------------------------------
  // Replays share the frame with the live lead camera. Neither transport
  // machinery nor another replay may displace an ongoing live action shot.
  const p1 = [];
  for (let f = 0; f <= lastFrame; f++) {
    let best = -1;
    for (let i = 0; i < N; i++) if (!finished(i, f) && (best < 0 || uOf(f, i) > uOf(f, best))) best = i;
    p1.push(best < 0 ? 0 : best);
  }
  // Which cabin is carrying marble i at frame f (null if none).
  const cabinOf = (i, f) => {
    for (const [k, e] of elevators.entries())
      for (const c of e.cycles) if (c.riders.includes(i) && f >= c.closeAt - sec(0.6) && f < (c.closeTopAt ?? c.openAt + sec(2)) + sec(0.4)) return k;
    return null;
  };
  const raw = [];
  // Split the screen 50:50 for spectacular overtake replays, hardest obstacle hits, and DQ replays:
  // P1 live on the left, 0.4× slow-motion action replay on the right.
  highlights.forEach((h, k) => {
    raw.push({ kind: "replay", start: h.insert, end: h.insert + h.frames, highlight: k, prio: h.overtake ? 4 : 3 });
  });
  // Resolve overlaps by priority; nothing shorter than 1.5 s, nothing after the win.
  const taken = new Array(lastFrame + 2).fill(null);
  // While P1 rides the stair there is no split (its left half would have to show the stair, which is
  // never shown): those frames are blocked, and a replay waits until P1 is back on the track.
  const blocked = { kind: "stair" };
  for (let f = 0; f <= lastFrame; f++) if (cabinOf(p1[f], f) !== null || kind[f] === "action" || kind[f] === "cockpit") for (let g = Math.max(0, f - sec(0.5)); g <= Math.min(lastFrame, f + sec(0.5)); g++) taken[g] = blocked;
  for (const sp of [...raw].sort((a, b) => b.prio - a.prio || a.start - b.start)) {
    let a = Math.max(sp.start, raceStart + sec(2));
    let b = Math.min(sp.end, winnerFrame - sec(12), lastFrame + 1);
    if (b - a < sec(2.2)) continue;
    let free = true;
    for (let f = a; f < b; f++) if (taken[f]) free = false;
    if (!free) {
      if (sp.kind !== "replay") continue;
      // A replay waits for the slot to clear, keeping its length.
      const len = b - a;
      let s0 = a;
      while (s0 + len < winnerFrame - sec(12) && taken.slice(s0, s0 + len).some(Boolean)) s0 += sec(0.5);
      if (s0 + len >= winnerFrame - sec(12)) continue;
      sp.start = s0;
      sp.end = s0 + len;
    } else {
      sp.start = a;
      sp.end = b;
    }
    for (let f = sp.start; f < sp.end; f++) taken[f] = sp;
  }
  const splits = [...new Set(taken.filter((x) => x && x !== blocked))].sort((a, b) => a.start - b.start);
  // Cameras: keep the smooth main camera on the left (only tagging leader), the right half's own.
  for (const sp of splits) {
    const span = Array.from({ length: sp.end - sp.start }, (_, j) => sp.start + j);
    for (const f of span) cams[f] = [...origCams[f].slice(0, 7), "leader", p1[f]];
    delete sp.prio;
  }
  return {
    cams,
    framingAudit,
    highlightCams,
    splits,
    shots: shots.map(({ kind, start, end, marble, label, feature }) => ({ kind, start, end, marble: marble ?? null, label: label ?? null, feature: feature ?? null })),
    replayCam: arr(replayCam),
    heli,
  };
}
