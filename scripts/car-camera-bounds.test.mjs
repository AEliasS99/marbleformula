import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import * as THREE from 'three';
import {CAR_CAMERA_BOUNDS,createCameraOcclusion,carBodyVisible} from '../src/gp/camera-occlusion.js';

test('visibility bounds contain each actual production car, without imaginary margins',async()=>{
 const dir=resolve('out/tcr');mkdirSync(dir,{recursive:true});const file=resolve(dir,`.camera-mesh-${randomUUID()}.mjs`);
 const result=await build({entryPoints:['src/gp/CarModel.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',write:false});
 writeFileSync(file,result.outputFiles[0].text);
 try{
  const {CarBody,createCarGeometries}=await import(pathToFileURL(file).href),geometries=createCarGeometries();
  function visit(node,parent,bounds){
   if(Array.isArray(node)){node.forEach(n=>visit(n,parent,bounds));return;}
   if(!node||typeof node!=='object'||!node.props)return;
   const p=node.props,local=new THREE.Object3D();
   if(p.position)local.position.fromArray(p.position);if(p.rotation)local.rotation.set(...p.rotation);
   if(p.scale)typeof p.scale==='number'?local.scale.setScalar(p.scale):local.scale.fromArray(p.scale);
   local.updateMatrix();const world=parent.clone().multiply(local.matrix);
   if(node.type==='mesh'){
    let geometry=p.geometry;const children=Array.isArray(p.children)?p.children:[p.children];
    if(!geometry){const child=children.find(n=>typeof n?.type==='string'&&n.type.endsWith('Geometry'));assert.ok(child,'mesh geometry must be measured');const ctor=THREE[child.type[0].toUpperCase()+child.type.slice(1)];geometry=new ctor(...(child.props.args??[]));}
    geometry.computeBoundingBox();bounds.union(geometry.boundingBox.clone().applyMatrix4(world));
   }
   visit(p.children,world,bounds);
  }
  for(let style=0;style<4;style++){
   const actual=new THREE.Box3();visit(CarBody({carGeoms:geometries,carStyle:style,teamColor:'#fff',texture:new THREE.Texture()}),new THREE.Matrix4(),actual);
   const expected=CAR_CAMERA_BOUNDS[style];
   for(let axis=0;axis<3;axis++){
    const lo=actual.min.toArray()[axis],hi=actual.max.toArray()[axis];
    assert.ok(expected.min[axis]<=lo&&expected.max[axis]>=hi,`style${style} axis${axis} clips its mesh`);
    assert.ok(lo-expected.min[axis]<.002&&expected.max[axis]-hi<.002,`style${style} axis${axis} includes excessive empty space`);
   }
  }
 }finally{unlinkSync(file);}
});

test('checkpoint visibility follows car heading and still rejects an obscured rear',()=>{
 const samples=Array.from({length:81},(_,i)=>({u:i*.5,p:[i*.5-20,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1}));
 const geometry=createCameraOcclusion({samples,checkpoints:[{u:20,index:1}]}),centre=[.5,.3,0],camera=[.5,8,0];
 assert.equal(carBodyVisible(geometry,camera,centre,[0,0,0,1],0),false);
 const turned=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2).toArray();
 assert.equal(carBodyVisible(geometry,camera,centre,turned,0),true);
});
