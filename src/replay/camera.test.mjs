import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {planCameras,cameraAt} from './camera.mjs';
const finish={position:[0,0,120],tangent:[0,0,1],normal:[0,1,0],right:[1,0,0],width:6};
function fixture(){const r={duration:12,participants:['a','b','c'].map(id=>({id})),standings:[{id:'a',status:'finished',time:10},{id:'b',status:'finished',time:11},{id:'c',status:'finished',time:12}],events:[],frames:[]};for(let k=0;k<=360;k++){const t=k/30;const u=[t*12, t*12-2+Math.max(0,t-2),t*11-4];r.frames.push({t,racers:u.map((z,i)=>[i*1.5,0,z,0,0,0,1]),fixtures:[],wheels:[[],[],[]],telemetry:u.map(z=>({u:z,speed:12,up:1}))});}return r;}
test('director protects finishes, tracks actual live order, remains deterministic and frames its subjects',()=>{
 const r=fixture(),plan=planCameras(r);assert.equal(plan[0].kind,'drone');assert.ok(plan.some(s=>s.kind==='overtake'));assert.equal(plan.at(-1).kind,'finish');assert.ok(plan.at(-1).start<=7);
 assert.ok(!cameraAt(r,plan,10.2,finish).ids.includes(0),'do not keep a frozen finisher as camera target');
 const times=Array.from({length:721},(_,i)=>i/60),expected=times.map(t=>cameraAt(r,plan,t,finish));
 for(const t of times.reverse()){const shot=cameraAt(r,plan,t,finish);assert.deepEqual(shot,expected[Math.round(t*60)]);const camera=new PerspectiveCamera(shot.fov,16/9,.05,1500);camera.position.set(...shot.position);camera.lookAt(...shot.target);camera.updateMatrixWorld();for(const p of shot.points){const q=new Vector3(...p).project(camera);assert.ok(Math.abs(q.x)<.9&&Math.abs(q.y)<.9&&q.z<1,`${shot.kind}: ${q.toArray()}`);}}
 const shift=[400,30,-200],translated=structuredClone(r);for(const f of translated.frames)for(const p of f.racers)for(let a=0;a<3;a++)p[a]+=shift[a];const shiftedFinish={...finish,position:finish.position.map((v,i)=>v+shift[i])};const a=cameraAt(r,plan,5,finish),b=cameraAt(translated,plan,5,shiftedFinish);a.position.forEach((v,i)=>assert.ok(Math.abs(v+shift[i]-b.position[i])<1e-8));
});
test('incident comes from telemetry, removed competitors do not retain the camera',()=>{
 const r=fixture();r.standings[1]={id:'b',status:'eliminated',time:5};r.events=[{participantId:'b',status:'eliminated',time:5}];for(const f of r.frames)if(f.t>=2&&f.t<2.5)f.telemetry[2].up=0;
 const plan=planCameras(r);assert.ok(plan.some(s=>s.kind==='incident'&&s.ids.includes(2)));for(let t=5;t<6.5;t+=.05)assert.ok(!cameraAt(r,plan,t,finish).ids.includes(1));
 assert.ok(!plan.some(s=>['lift','elevator','approach'].includes(s.kind)));
});

test('a stopped crash is covered briefly, then the camera returns to moving racers',()=>{
 const r=fixture();for(const f of r.frames)if(f.t>=2){f.telemetry[1].speed=0;f.telemetry[1].up=0;f.telemetry[1].u=24;f.racers[1][2]=24;}r.standings[1]={id:'b',status:'stuck',time:11};
 const plan=planCameras(r),incident=plan.find(s=>s.kind==='incident'&&s.ids.includes(1));assert.ok(incident);assert.ok(incident.end-incident.start>=1.5&&incident.end-incident.start<=3.25);assert.ok(!cameraAt(r,plan,6,finish).ids.includes(1));
});
