import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Quaternion,Vector3} from 'three';
import {buildRaisedChoice,challengeDeckGeometry,FORK_INTAKE_BEFORE} from '../src/gp/obstacles/raised-choice.js';
import {liftFrameAt} from '../src/gp/route-path.js';
import {liftCleatPose} from '../src/gp/trackMesh.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
import {rollingContact} from './marble-contact-audio.mjs';
import {buildCourse,buildObstacles} from './season.mjs';
import round from '../src/gp/circuits/r13-jaipur.js';
import {roadClearanceVolumes,sceneryBoxClearsRoad} from '../src/gp/scenery-road-clearance.js';
import {CHALLENGE_RIBS} from '../src/gp/obstacles/challenge-ribs.js';
const frameAt=u=>({u,p:[u,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1,curv:0});
const samples=Array.from({length:101},(_,i)=>frameAt(i*.5-10));
const build=side=>{const out={rollers:[]},statics=[];buildRaisedChoice({type:'route-choice',u:0,side},{frameAt,out,statics});return {out,statics};};
test('open guides leave camera sightlines between physical crossbars smaller than a marble',()=>{
 const {statics}=build(1),ribs=statics.filter(o=>o.kind==='challenge-rib');
 assert.ok(ribs.length>0);
 assert.ok(ribs.filter(o=>o.role==='post').every(o=>Math.abs(o.pos[2])>2.1),'No support post may narrow the lower branch entrance');
 assert.ok(CHALLENGE_RIBS.pitch-CHALLENGE_RIBS.thickness<.7);
 assert.ok(CHALLENGE_RIBS.thickness/CHALLENGE_RIBS.pitch<.15,'Keep most of the overhead view open');
 assert.ok(CHALLENGE_RIBS.clearance>.7+.17,'A rolling marble must clear the actual carrier');
 const model=createCameraOcclusion({samples,themeId:'unknown',obstacles:statics});
 assert.equal(model.blockedBy([0,5,-1.54],[0,.35,-1.54]),'mechanism-challenge-rib');
 assert.equal(model.blocks([.3,5,-1.54],[.3,.35,-1.54]),false);
});
test('both mirrored decks have outward top faces and exact camera occlusion with an open lower branch',()=>{
 for(const side of [1,-1]){
  const {statics}=build(side),deck=statics.find(o=>o.kind==='challenge-deck'),g=challengeDeckGeometry(deck);
  // Top triangles occupy index positions 6..11 in the common closed hull.
  for(let i=6;i<12;i++)assert.ok(g.attributes.normal.getY(i)>.9,'Inverted deck top would disappear from the production picture');
  g.dispose();
  const model=createCameraOcclusion({samples,themeId:'unknown',obstacles:statics});
  assert.equal(model.blockedBy([11,6,.6*side],[11,.1,.6*side]),'mechanism-challenge-deck');
  assert.equal(model.blocks([11,6,-1.54*side],[11,.4,-1.54*side]),false);
 }
});
test('saved branch offsets elevate the real carrier while legacy lifts retain their original frame',()=>{
 const {out}=build(1),lift=out.lifts[0],crest=liftFrameAt(lift,11,frameAt);
 assert.deepEqual(crest.p,[11,2.4,.64]);
 const legacy={...lift};delete legacy.path;
 assert.deepEqual(liftFrameAt(legacy,11,frameAt),frameAt(11));
 const raised=liftCleatPose(lift,0,3.5,frameAt),flat=liftCleatPose(legacy,0,3.5,frameAt);
 assert.ok(raised.pos[1]-flat.pos[1]>2.39);
 assert.equal(raised.pos[2],.64);
});
test('rolling audio recognizes the upper deck while flight and an under-platform passage stay silent',()=>{
 const {out}=build(1),data={fps:60,info:{length:100},timeline:{raceStart:0},marbleRadius:.35,samples,challengeZones:out.challengeZones,marbles:[{}]};
 const contact=y=>rollingContact({...data,frames:[[[10.95,y,.6,0,0,0,1,10.95]],[[11,y,.6,0,0,0,1,11]]]},0,1);
 assert.equal(contact(2.75).supported,true);
 assert.equal(contact(3.5).supported,false);
 assert.equal(contact(.35).supported,false);
});
test('all authored Jaipur guides preserve other road levels and branches persist their physical carriers',()=>{
 const course=buildCourse(round),built=buildObstacles(course);
 const zones=built.challengeZones;assert.equal(zones.filter(z=>z.topology==='raised-main-v1').length,6);assert.equal(zones.length,18);
 for(const zone of zones){
  if(zone.topology==='raised-main-v1')assert.ok(built.lifts.some(l=>l.challengeZone===zone.id&&l.path));
  const otherRoad=roadClearanceVolumes(course.samples.filter(s=>s.u<zone.u0-5||s.u>zone.u1+5));
  const intakeParts=built.statics.filter(p=>p.challengeZone===zone.id&&p.role==='fork-intake');
  const intakeRoad=intakeParts.length
   ? roadClearanceVolumes(course.samples.filter(s=>s.u<zone.u0-FORK_INTAKE_BEFORE-2||s.u>zone.u0))
   : otherRoad;
  for(const p of built.statics.filter(p=>p.challengeZone===zone.id&&p.shape!=='cylinder')){
   const matrix=new Matrix4().compose(new Vector3(...p.pos),new Quaternion(...p.quat),new Vector3(1,1,1)).elements;
   assert.ok(sceneryBoxClearsRoad({...p,matrix},p.role==='fork-intake'?intakeRoad:otherRoad),'Branch intersects another road level: '+zone.id);
  }
 }
 assert.deepEqual([...new Set(built.statics.filter(p=>p.role==='fork-intake').map(p=>p.challengeZone))],
  ['route-choice-745','route-choice-1053','route-choice-1365']);
});
