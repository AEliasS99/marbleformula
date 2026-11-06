// Internal physical regression on recorded production dock geometry; never a video deliverable.
import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import {buildTrackMesh} from '../src/gp/trackMesh.js';
import {STAIR,stairLocal,stairLoop} from '../src/gp/stair.js';
export function replayDockArrival(fixture,arrival,slowSpeed,phaseIndex=0){
 const {frame:f,position,quaternion,velocity,angularVelocity:ang}=arrival;
 const start=[...position,...quaternion],e={...fixture.elevator,...(slowSpeed===undefined?{}:{slowSpeed})};
 const loop=stairLoop(e),phase=phaseIndex*loop.dt/12,world=new RAPIER.World({x:0,y:-fixture.gravity,z:0});world.timestep=1/120;
 try{
 // This fixture is the actual +X-facing, positive-lateral Tuscany bay.
 if(e.fwd[0]!==1||e.fwd[1]!==0||e.fwd[2]!==0||e.lat<=0)throw Error('Unsupported dock fixture orientation');
 const add=(desc,body)=>world.createCollider(desc.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),body);
 const mesh=buildTrackMesh(fixture.samples,{endCaps:false,wallHeight:1.35}).physics;
 add(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.35).setRestitution(.12),undefined,'track');
 for(const o of fixture.obstacles){
 const b=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...o.pos).setRotation(new Quaternion(...o.quat)));
 const shape=o.shape==='box'?RAPIER.ColliderDesc.cuboid(o.size[0]/2,o.size[1]/2,(o.depth??o.size[2])/2):o.shape==='cylinder'?RAPIER.ColliderDesc.cylinder(o.height/2,o.radius):null;if(!shape)continue;
 if(o.depth)shape.setTranslation(0,0,o.side*(o.depth/2-o.size[2]/2));add(shape.setFriction(o.friction??.2).setRestitution(o.kind==='guard'?.2:.22),b,o.kind);
 }
 const at=(x,y,z)=>new Vector3(...e.center).add(new Vector3(x,y,z));
 const wall=(x,y0,y1,z,hx,hz,label)=>{const p=at(x,(y0+y1)/2,z);add(RAPIER.ColliderDesc.cuboid(hx,(y1-y0)/2,hz).setTranslation(p.x,p.y,p.z).setFriction(.05).setRestitution(.1),undefined,label);};
 wall(e.length/2+.15,loop.yb-.4,e.lift-e.slope*(e.length/2)-.02,0,.15,e.width/2+.1,'front');
 const entry=fixture.samples.at(-1).p[1]-e.center[1];wall(-e.length/2-.15,Math.max(1.1,entry+1.6),loop.yt+1.2,0,.15,e.width/2+.1,'back-upper');wall(-e.length/2-.15,loop.yb-.6,Math.min(-.12,entry-.12),0,.15,e.width/2+.1,'back-lower');wall(0,loop.yb-.55,loop.yb-.35,0,e.length/2+.3,e.width/2+.2,'catch-floor');wall(0,-1.1,e.lift+.6,e.width/2+.1,e.length/2+.3,.07,'side-outer');wall(0,loop.yb-.4,loop.yt+1.2,-e.width/2-.1,e.length/2+.3,.07,'side-inner');
 const q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-STAIR.tilt);
 const plates=Array.from({length:loop.count},(_,k)=>{const p=at(...stairLocal(e,loop,k,f/60+phase)),b=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,p.y,p.z).setRotation(q));add(RAPIER.ColliderDesc.cuboid(e.length/2-.03,STAIR.plate/2,e.width/2-.03).setTranslation(0,-STAIR.plate/2,0).setFriction(.6).setRestitution(.1),b,'plate-'+k);return b;});
 const actor=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...start.slice(0,3)).setRotation(new Quaternion(...start.slice(3,7))).setLinvel(...velocity).setAngvel({x:ang[0],y:ang[1],z:ang[2]}).setLinearDamping(.046).setCanSleep(false));add(RAPIER.ColliderDesc.ball(fixture.radius).setFriction(.15).setRestitution(.48).setDensity(2),actor,'AUT');
 const rows=[];let board=null;for(let step=0;step<120*8;step++){
 const t=f/60+(step+1)/120;plates.forEach((b,k)=>{const p=at(...stairLocal(e,loop,k,t+phase));b.setNextKinematicTranslation(p);});world.step();const p=actor.translation();
 if(p.y>e.center[1]+3&&board===null)board=t-f/60;
 if(step%2===0){rows.push({f:f+step/2,p:[p.x,p.y,p.z]});}
 }
  let stationaryFrames=0;
 for(let a=120;a<rows.length;a++){
  const p=rows[a].p;if(p[1]>e.center[1]+1)continue;
  let spread=0;for(let b=a-120;b<a;b++)spread=Math.max(spread,Math.hypot(...p.map((v,j)=>v-rows[b].p[j])));
  if(spread<.45)stationaryFrames++;
 }
 return {stationaryFrames,boardSeconds:board,final:actor.translation()};
 }finally{world.free();}
}
