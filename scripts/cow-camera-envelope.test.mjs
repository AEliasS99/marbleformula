import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import * as THREE from 'three';
import {createCameraOcclusion} from '../src/gp/camera-occlusion.js';

test('cow occlusion contains the real SwissCow mesh while leaving leg gaps open',async()=>{
 const samples=Array.from({length:101},(_,i)=>({u:i,p:[i,0,0],t:[1,0,0],n:[0,1,0],r:[0,0,1],w:2.1}));
 const o=createCameraOcclusion({samples,themeId:'alps'}),cow=o.boxes.find(b=>b.category==='cow');assert.ok(cow);
 const contains=p=>cow.parts.some(part=>{const q=new THREE.Vector3(...p).sub(new THREE.Vector3(0,.68,.2)).applyMatrix4(new THREE.Matrix4().fromArray(part.inverse)).toArray();return q.every((v,i)=>v>=part.lo[i]-1e-7&&v<=part.hi[i]+1e-7);});
 assert.equal(contains([0,.15,0]),false,'air between legs must stay clear');assert.equal(contains([0,.68,0]),true,'torso remains opaque');
 const source=readFileSync('src/gp/Themes.tsx','utf8'),start=source.indexOf('function SwissCow('),end=source.indexOf('function SwissChalet(',start);
 const code='export '+source.slice(start,end);const built=await build({stdin:{contents:code,loader:'tsx',resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',write:false});
 const file=resolve('out/tcr',`.cow-camera-${randomUUID()}.mjs`);writeFileSync(file,built.outputFiles[0].text);
 try{
  const {SwissCow}=await import(pathToFileURL(file).href);let vertices=0;
  function visit(node,parent){
   if(Array.isArray(node)){node.forEach(n=>visit(n,parent));return;}if(!node?.props)return;
   const p=node.props,local=new THREE.Object3D();if(p.position)local.position.fromArray(p.position);if(p.rotation)local.rotation.set(...p.rotation);for(const axis of ['x','y','z'])if(p['rotation-'+axis]!==undefined)local.rotation[axis]=p['rotation-'+axis];if(p.scale)typeof p.scale==='number'?local.scale.setScalar(p.scale):local.scale.fromArray(p.scale);local.updateMatrix();const world=parent.clone().multiply(local.matrix);
   if(node.type==='mesh'){
    const children=Array.isArray(p.children)?p.children:[p.children],g=children.find(n=>typeof n?.type==='string'&&n.type.endsWith('Geometry'));assert.ok(g);
    const geometry=new THREE[g.type[0].toUpperCase()+g.type.slice(1)](...(g.props.args??[])),positions=geometry.attributes.position;
    for(let i=0;i<positions.count;i++){const v=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(world).toArray();assert.ok(v.every((x,j)=>x>=[-.4,0,-.75][j]-1e-7&&x<=[.4,1.36,1.15][j]+1e-7),`cow broad box clips geometry: ${v}`);assert.ok(contains(v),`rendered cow vertex omitted: ${v}`);vertices++;}
   }visit(p.children,world);
  }
  visit(SwissCow({}),new THREE.Matrix4());assert.ok(vertices>100);
 }finally{unlinkSync(file);}
});
