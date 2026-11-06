import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import {Matrix4,Quaternion,Vector3} from 'three';
import gallery,{romanGalleryParts,ROMAN_GALLERY} from '../src/gp/obstacles/roman-gallery.js';
import {OBSTACLES,BY_TYPE} from '../src/gp/obstacles/index.js';
import {buildTrackMesh} from '../src/gp/trackMesh.js';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';
const q=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),-.10),inv=q.clone().invert();
const V=p=>new Vector3(...p).applyQuaternion(q).toArray();
const frameAt=u=>({u,p:V([u,0,0]),t:V([1,0,0]),n:V([0,1,0]),r:[0,0,1],w:2.1,curv:0});
const samples=Array.from({length:91},(_,i)=>frameAt(-10+i*.5));
const parts=romanGalleryParts({u:0},frameAt);
test('the gallery is an explicit new module with identical visible and physical stone records',()=>{
 assert.equal(BY_TYPE[gallery.type],gallery);assert.ok(!OBSTACLES.includes(gallery));
 const statics=[];gallery.build({u:0},{frameAt,statics});assert.deepEqual(statics,parts);
 assert.equal(parts.length,ROMAN_GALLERY.bays*(ROMAN_GALLERY.voussoirs+7));
 for(const p of parts)assert.ok([...p.pos,...p.quat,...p.size].every(Number.isFinite));
});
test('the actual stone vault blocks a roof camera ray but its racing throat stays open',()=>{
 const model=createCameraOcclusion({samples,themeId:'unknown',obstacles:parts});
 const a=V([3.6,6,0]),b=V([3.6,.5,0]);
 assert.equal(model.blockedBy(a,b),'mechanism-roman-stone');
 assert.equal(model.blocks(V([-.2,.7,0]),V([15,.7,0])),false);
 assert.equal(model.counts['mechanism-roman-stone'],parts.length);
 assert.equal(model.blocks(V([1.8,6,0]),V([1.8,.5,0])),false,'An open bay must expose the race');
 for(const p of parts.filter(p=>p.role==='deck-tie')){
  const local=new Vector3(...p.pos).applyQuaternion(inv);assert.ok(local.y+p.size[1]/2<0,'Tie beam enters racing surface');
 }
});
test('a full twenty-marble pack physically traverses the covered road at three entry speeds',async()=>{
 await RAPIER.init();const evidence=[];
 for(const speed of [2.5,5,9]){
  const world=new RAPIER.World({x:0,y:-25,z:0});world.timestep=1/120;
  try{
   const mesh=buildTrackMesh(samples,{endCaps:false,wallHeight:1.4}).physics;
   const add=(d,b)=>world.createCollider(d.setFriction(.15).setRestitution(.12).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),b);
   add(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));
   for(const p of parts){const b=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...p.pos).setRotation(new Quaternion(...p.quat)));add(RAPIER.ColliderDesc.cuboid(...p.size.map(x=>x/2)),b);}
   const actors=Array.from({length:20},(_,i)=>{
    const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...V([-2-Math.floor(i/5)*.8,.36,(i%5-2)*.72])).setLinvel(...V([speed,0,0])).setLinearDamping(.046).setCanSleep(false).setCcdEnabled(true));
    add(RAPIER.ColliderDesc.ball(.35).setDensity(2),b);return b;
   });
   const finish=Array(20).fill(null);let fallen=0;const frames=[];
   for(let step=0;step<120*10;step++){
    world.step();
    if(step%2)continue;
    const row=actors.map((b,i)=>{const p=b.translation(),local=new Vector3(p.x,p.y,p.z).applyQuaternion(inv);if(finish[i]===null&&local.x>15)finish[i]=step/120;if(finish[i]===null&&local.y<-.5)fallen++;return[p.x,p.y,p.z];});frames.push(row);
    if(finish.every(x=>x!==null))break;
   }
   evidence.push({speed,finish,fallen,frames});
   assert.ok(finish.every(x=>x!==null&&x<8),'Physical jam at entry speed'+speed);assert.equal(fallen,0);
  }finally{world.free();}
 }
 if(process.env.ROMAN_GALLERY_EVIDENCE){fs.mkdirSync(process.env.ROMAN_GALLERY_EVIDENCE,{recursive:true});fs.writeFileSync(process.env.ROMAN_GALLERY_EVIDENCE+'/physical-passage.json',JSON.stringify({samples,parts,evidence}));}
});
