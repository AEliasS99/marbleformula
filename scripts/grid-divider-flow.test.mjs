import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import RAPIER from '@dimforge/rapier3d-compat';
import{buildTrackMesh}from'../src/gp/trackMesh.js';import{gridDividerHull,gridDividerGeometry}from'../src/gp/grid-divider.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/italy-grid-divider-stall.json',import.meta.url)));
test('recorded lap-return jam reproduces with square divider noses; shared chamfer clears all three real poses under gravity',async()=>{
 await RAPIER.init();const result={};
 for(const variant of ['original','chamfer']){
  const world=new RAPIER.World({x:0,y:-fixture.gravity,z:0});world.timestep=1/120;
  try{
   const mesh=buildTrackMesh(fixture.samples,{endCaps:false,wallHeight:1.35}).physics;
   world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.35).setRestitution(.1));
   for(const o of fixture.dividers){const shape=variant==='original'?RAPIER.ColliderDesc.cuboid(...o.size.map(x=>x/2)):RAPIER.ColliderDesc.convexHull(new Float32Array(gridDividerHull(o.size).vertices));world.createCollider(shape.setTranslation(...o.pos).setRotation({x:o.quat[0],y:o.quat[1],z:o.quat[2],w:o.quat[3]}).setFriction(.2).setRestitution(.22));}
   const actors=fixture.poses.map(p=>{const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...p.position).setLinearDamping(.046).setCanSleep(false));world.createCollider(RAPIER.ColliderDesc.ball(fixture.radius).setFriction(.15).setDensity(2),body);return{body,start:p.position};});
   for(let k=0;k<360;k++)world.step();result[variant]=actors.map(({body,start})=>body.translation().x-start[0]);
  }finally{world.free();}
 }
 assert.ok(result.original.every(x=>Math.abs(x)<.05),'control did not reproduce the actual deadlock');
 assert.ok(result.chamfer.every(x=>x>2),'divider still pins an actual recorded arrival');
});
test('divider picture and collision use the same hull contained in its old lane footprint',()=>{
 const size=[8.25,.48,.05],hull=gridDividerHull(size),g=gridDividerGeometry(size),p=g.attributes.position;
 for(let i=0;i<p.count;i++)for(let k=0;k<3;k++)assert.ok(Math.abs(p.array[i*3+k])<=size[k]/2+1e-6);
 assert.ok(hull.vertices.length===24&&hull.indices.length===36);g.dispose();
});
