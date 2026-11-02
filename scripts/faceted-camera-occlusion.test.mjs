import test from 'node:test';
import assert from 'node:assert/strict';
import {CylinderGeometry,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3} from 'three';
import {intersectsFacetedFrustum} from '../src/gp/camera-occlusion.js';

test('faceted scenery visibility agrees with actual CylinderGeometry ray intersections',()=>{
 let seed=38;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(const shape of [{top:1.6,bottom:1.68,height:.2,sides:10},{top:2.1,bottom:2.18,height:.22,sides:10},{top:1.65,bottom:2.35,height:1.6,sides:8},{top:4.968,bottom:5.292,height:.36,sides:12}]){
  const {top,bottom,height,sides}=shape,mesh=new Mesh(new CylinderGeometry(top,bottom,height,sides),new MeshBasicMaterial({side:DoubleSide}));mesh.updateMatrixWorld();
  for(let i=0;i<400;i++){
   const angle=rand()*Math.PI*2,origin=new Vector3(Math.sin(angle)*bottom*3,(rand()-.5)*height*4,Math.cos(angle)*bottom*3),to=new Vector3((rand()-.5)*bottom*3,(rand()-.5)*height*4,(rand()-.5)*bottom*3),direction=to.clone().sub(origin),distance=direction.length();
   const ray=new Raycaster(origin,direction.normalize(),0,distance),expected=ray.intersectObject(mesh).length>0;
   assert.equal(intersectsFacetedFrustum(origin.toArray(),to.toArray(),shape),expected,JSON.stringify({shape,origin,to}));
  }
  const mid=(top+bottom)/2,theta=Math.PI/sides,r=mid*(1+Math.cos(theta))/2,air=[Math.sin(theta)*r,0,Math.cos(theta)*r];
  assert.equal(intersectsFacetedFrustum(air,air,shape),false,'air outside polygon but inside smooth cylinder is clear');
  assert.equal(intersectsFacetedFrustum([0,0,0],[0,0,0],shape),true,'solid centre remains opaque');
 }
});
