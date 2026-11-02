import test from 'node:test';import assert from 'node:assert/strict';import {ShaderLib} from 'three';
import {applyRoadConditions,roadWetness} from '../src/gp/road-conditions.js';
import {waterCoverage} from '../src/gp/car-pace.js';import {buildTrackMesh} from '../src/gp/trackMesh.js';
test('wet road shading uses the exact physical pond footprint, including round ends and the dry alternative',()=>{
 const p={kind:'pond',u0:100,u1:124,lat:1.15,halfWidth:1.15};
 for(let u=98;u<=126;u+=.25)for(let lat=-3.2;lat<=3.2;lat+=.1)assert.equal(roadWetness([p],u,lat),waterCoverage(p,u,lat));
 assert.equal(roadWetness([p],112,-2),0);assert.equal(roadWetness([p],112,1.15),1);
});
test('the real standard road shader stays opaque and receives banked metre coordinates without new overlay geometry',()=>{
 const samples=[0,1,2].map(u=>({u,p:[u,0,0],r:[0,Math.sin(.4),Math.cos(.4)],n:[0,Math.cos(.4),-Math.sin(.4)],w:3.2,curv:0}));
 const mesh=buildTrackMesh(samples),g=mesh.parts.floor;assert.equal(g.roadCoordinates.length,g.position.length);assert.ok(g.roadCoordinates.every(Number.isFinite));assert.deepEqual(g.roadCoordinates.slice(0,3),[0,-3.2,.58]);
 const shader={uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader};applyRoadConditions(shader,[{kind:'pond',u0:.5,u1:1.5,lat:1,halfWidth:.8}]);
 assert.ok(shader.vertexShader.includes('vRoadCoordinates = roadCoordinates'));assert.ok(shader.fragmentShader.includes('roadWetMask()'));assert.ok(shader.fragmentShader.includes('roughnessFactor=mix'));assert.ok(!shader.fragmentShader.includes('diffuseColor.a='));assert.equal(shader.uniforms.uWetCount.value,1);
});
