import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Vector3,Quaternion,Ray,Box3,PerspectiveCamera} from 'three';
import {marbleLineupShot} from '../src/gp/marble-presentation.js';
const f=JSON.parse(fs.readFileSync(new URL('./fixtures/tuscany-lineup-camera.json',import.meta.url)));
const g=f.geometry,clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>x*x*(3-2*x);
function old(p){const sign=Math.sign(g.pole.lat||1),swept=-sign*g.wide*.96+2*sign*g.wide*.96*clamp((p-.02)/.78),lat=swept+(g.pole.lat-swept)*smooth(clamp((p-.82)/.16)),push=smooth(clamp((p-.82)/.18));return g.c.map((v,i)=>v+g.t[i]*(g.front+3.8-1.4*push)+g.r[i]*lat+(i===1?1.8-.5*push:0));}
function blocked(pos,target){const inv=new Quaternion(...f.gate.quat).normalize().invert(),local=p=>new Vector3(...p).sub(new Vector3(...f.gate.hinge)).applyQuaternion(inv),a=local(pos),b=local(target);const hit=new Ray(a,b.clone().sub(a).normalize()).intersectBox(new Box3(new Vector3(-.1,-f.gate.height,-f.halfWidth),new Vector3(.1,0,f.halfWidth)),new Vector3());return !!hit&&hit.distanceTo(a)<b.distanceTo(a);}
test('saved Tuscany lineup reproduces the opaque gate defect and clears every sweep exposure',()=>{
 const centre=g.place.slice().sort((a,b)=>Math.abs(a.lat)-Math.abs(b.lat))[0];
 assert.ok(blocked(old(.5),centre.pos),'old midpoint must hit the closed physical flap');
 let checked=0;
 for(let frame=0;frame<240;frame++)for(const offset of [-.175,0,.175]){
  const sh=marbleLineupShot(g,(frame+offset)/240),lat=sh.pos.reduce((n,v,i)=>n+(v-g.c[i])*g.r[i],0);
  const nearest=g.place.slice().sort((a,b)=>Math.abs(a.lat-lat)-Math.abs(b.lat-lat)).slice(0,2);
  const camera=new PerspectiveCamera(sh.fov,16/9,.05,1500);camera.position.set(...sh.pos);camera.lookAt(...sh.target);camera.updateMatrixWorld();
  for(const m of nearest){assert.equal(blocked(sh.pos,m.pos),false,`gate at ${frame}+${offset}`);
   for(const x of [-f.radius,f.radius])for(const y of [-f.radius,f.radius])for(const z of [-f.radius,f.radius]){
    const q=new Vector3(m.pos[0]+x,m.pos[1]+y,m.pos[2]+z).project(camera);
    assert.ok(q.z>-1&&q.z<1&&Math.abs(q.x)<.88&&Math.abs(q.y)<.86,`sphere framing at ${frame}+${offset}: ${q.toArray()}`);
   }checked++;
  }
 }
 assert.equal(checked,1440);
 assert.ok(Math.abs(marbleLineupShot(g,1).pos.reduce((n,v,i)=>n+(v-g.c[i])*g.r[i],0)-g.pole.lat)<1e-9,'tour ends over actual pole entrant');
});
