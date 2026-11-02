import test from'node:test';import assert from'node:assert/strict';
import{naturalLighting,motorsportMaterials,realismMaterials,daylightPixels,visibleBoost}from'../src/gp/visual-realism.js';
import{applyRealismSurface}from'../src/gp/realism-surfaces.js';
import{applyRoadConditions}from'../src/gp/road-conditions.js';
import{italyTerrainGeometry}from'../src/gp/italy-terrain.js';
test('natural presentation is opt-in and historical motorsport material identity stays supported',()=>{
 const old={visualQuality:{tyreContact:true,materials:'motorsport-v1'}},next={visualQuality:{tyreContact:true,materials:'motorsport-v2',lighting:'natural-v1'}};
 assert.ok(motorsportMaterials(old));assert.ok(!realismMaterials(old));assert.ok(!naturalLighting(old));assert.ok(realismMaterials(next)&&motorsportMaterials(next)&&naturalLighting(next));assert.ok(!naturalLighting({}));
});
test('exhaust follows the physical powered lane, including lateral choice, rather than road speed',()=>{
 const d={frames:[[[10,.4,2,0,0,0,1,10],[10,.4,-2,0,0,0,1,10]],[[11,.4,2,0,0,0,1,11],[11,.4,-2,0,0,0,1,11]]],samples:[{u:0,p:[0,0,0],r:[0,0,1]},{u:20,p:[20,0,0],r:[0,0,1]}],boosters:[{u0:9,u1:12,latCenter:2,latHalf:.88}]},before=JSON.stringify(d);
 assert.equal(visibleBoost(d,0,0),1);assert.equal(visibleBoost(d,1,0),0);assert.equal(visibleBoost({...d,boosters:[]},0,1),0);assert.equal(JSON.stringify(d),before);
});
test('daylight and cloud environment is deterministic, horizontally seamless and opaque',()=>{
 const a=daylightPixels(128,64),b=daylightPixels(128,64);assert.deepEqual(a,b);
 for(let y=0;y<64;y++)for(let c=0;c<3;c++)assert.ok(Math.abs(a.pixels[(y*128)*4+c]-a.pixels[(y*128+127)*4+c])<=3);
 assert.ok([...a.pixels].filter((_,i)=>i%4===3).every(v=>v===255));assert.ok(a.pixels[(63*128)*4+2]>a.pixels[(63*128)*4]);assert.ok(a.pixels[1]>a.pixels[2]);
});
test('natural terrain normals preserve every audited triangle and meet across tile seams',()=>{
 const t={heightAt:(x,z)=>.1*x+.2*z},tile={positions:[0,0,0,0,.2,1,1,.1,0]},old=italyTerrainGeometry(tile),next=italyTerrainGeometry(tile,t),callback=italyTerrainGeometry(tile,2);
 assert.deepEqual(next.attributes.position.array,old.attributes.position.array);assert.deepEqual(callback.attributes.position.array,old.attributes.position.array);
 const n=next.attributes.normal.array;for(let i=3;i<n.length;i++)assert.ok(Math.abs(n[i]-n[i%3])<1e-6);for(const g of[old,next,callback])g.dispose();
});
test('world surface variation composes with wet-road uniforms and uses no frame/random clock',()=>{
 const s={vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>',uniforms:{}};
 applyRoadConditions(s,[{u0:1,u1:20,lat:1,halfWidth:1,kind:'pond'}]);applyRealismSurface(s,'asphalt');const copy=JSON.stringify(s);applyRealismSurface(s,'asphalt');assert.equal(JSON.stringify(s),copy);assert.ok(s.fragmentShader.includes('roadWetMask'));assert.ok(s.fragmentShader.includes('dFdx'));assert.ok(!s.fragmentShader.includes('time'));assert.equal(s.uniforms.uWetCount.value,1);
});
