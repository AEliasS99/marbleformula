import {sampleReplay} from '/replay.js';
import * as THREE from 'three';
import {buildCourse,surfaceTypes,typeOf} from './course.js';
import {OrbitControls} from '/vendor/OrbitControls.js';
export function createWorld(canvas,onPick,onPlace){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#e6ecdf');
 const camera=new THREE.PerspectiveCamera(43,1,.1,700);camera.position.set(106,108,130);
 const controls=new OrbitControls(camera,canvas);controls.target.set(0,6,0);controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=3;controls.maxDistance=280;controls.maxPolarAngle=Math.PI/2-.08;
 scene.add(new THREE.HemisphereLight('#ffffff','#7d9c7d',1.8));const sun=new THREE.DirectionalLight('#fff7e5',2.8);sun.position.set(-70,120,50);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-100,right:100,top:100,bottom:-100,near:1,far:300});sun.shadow.bias=-.0005;scene.add(sun);
 const fill=new THREE.DirectionalLight('#dceaf1',1.1);fill.position.set(70,35,-40);scene.add(fill);
 let world=new THREE.Group(),racers=new THREE.Group();scene.add(world,racers);let curve=null,samples=[],project,assets,selected,play=false,speed=1,clock=0,placement=false,moving=[],simulation=null,fixtureGroups=[],course=null;
 const mat=(color,roughness=.72)=>new THREE.MeshStandardMaterial({color,roughness,metalness:.02});
 function mesh(geo,color,parent=world){const m=new THREE.Mesh(geo,mat(color));m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 const box=(w,h,d,color,p,pos)=>{const m=mesh(new THREE.BoxGeometry(w,h,d),color,p);m.position.set(...pos);return m;};
 const cylinder=(r1,r2,h,color,p,pos,segments=12)=>{const m=mesh(new THREE.CylinderGeometry(r1,r2,h,segments),color,p);m.position.set(...pos);return m;};
 function dispose(group){group.traverse(x=>{x.geometry?.dispose();if(x.material)(Array.isArray(x.material)?x.material:[x.material]).forEach(m=>m.dispose());});group.clear();}
 function pine(p,x,y,z,scale=1,color='#4f8065'){const g=new THREE.Group();g.position.set(x,y,z);g.scale.setScalar(scale);p.add(g);cylinder(.32,.42,2.4,'#987759',g,[0,1.2,0]);cylinder(0,2.3,4.6,color,g,[0,3.8,0],7);cylinder(0,1.9,3.9,color,g,[0,5.5,0],7);return g;}
 function assetMesh(asset){const g=new THREE.Group();const color=asset?.color||'#c7975f',shape=asset?.shape||'rock';
 if(shape==='pine')pine(g,0,0,0,1,color);
 else if(shape==='rock'){const m=mesh(new THREE.DodecahedronGeometry(2.6,0),color,g);m.position.y=1.3;m.scale.set(1.3,.8,1);}
 else if(shape==='vortex'){for(let k=0;k<5;k++){const m=mesh(new THREE.TorusGeometry(1+k*.6,.3,8,28),k%2?color:'#f1d493',g);m.rotation.x=Math.PI/2;m.position.y=.4+k*.55;}}
 else if(['checkpoint','tube'].includes(shape)){const w=(project?.width||4.2)+1;box(.35,4,.4,color,g,[-w/2,2,0]);box(.35,4,.4,color,g,[w/2,2,0]);box(w+.4,.4,.5,color,g,[0,4,0]);if(shape==='checkpoint'){const beam=mesh(new THREE.BoxGeometry(w,.05,.05),'#e4b79a',g);beam.position.y=1.4;}}
 else if(shape==='regroup'){box(project.width,.9,.6,color,g,[0,.47,0]);}
 else if(shape==='fan'){const at=project.width/2+1.1;box(.36,1.3,.36,'#6e827a',g,[at,.65,2.5]);const rotor=new THREE.Group();rotor.position.set(at,1.3,2.5);g.add(rotor);box(.1,.12,1.5,color,rotor,[0,0,0]);box(.1,1.5,.12,color,rotor,[0,0,0]);rotor.userData.spinAxis='x';moving.push(rotor);}
 else if(['hammer','spinner','turntable'].includes(shape)){cylinder(.5,.6,2.5,'#f1e5d1',g,[0,1.2,0]);const rotor=new THREE.Group();rotor.position.y=2.8;g.add(rotor);box(5,.45,.65,color,rotor,[0,0,0]);if(shape!=='hammer')box(.65,.45,5,color,rotor,[0,0,0]);else box(1.3,1,1.5,color,rotor,[2,0,0]);moving.push(rotor);}
 else if(['jump','drop','crest','bumps'].includes(shape)){const m=box(project.width*.8,.55,5,color,g,[0,.6,0]);m.rotation.x=-.18;for(let k=0;k<3;k++)box(project.width*.8,.2,.25,'#fff4d8',g,[0,.7+k*.2,k-1]);}
 else if(shape==='stand'){for(let k=0;k<3;k++)box(7,.8,2,color,g,[0,.4+k*.8,k*1.5]);for(let i=0;i<7;i++)box(.5,.9,.5,i%2?'#577e76':'#f1d487',g,[i-3,2.9,3]);}
 else if(shape==='barrier')box(5,1,.6,color,g,[0,.5,0]);
 else if(shape==='booster'){box(project.width*.85,.15,5,'#87b3a2',g,[0,.1,0]);for(let k=0;k<3;k++){const a=box(.14,.1,1.4,'#f9e9b5',g,[-.45,.25,k*1.1-1]);a.rotation.y=-.65;const b=box(.14,.1,1.4,'#f9e9b5',g,[.45,.25,k*1.1-1]);b.rotation.y=.65;}}
 else{for(let i=0;i<5;i++)cylinder(shape==='rollers'?.5:0,.55,shape==='rollers'?1:1.8,color,g,[(i%3-1)*1.2,.9,Math.floor(i/3)*1.7-.8],9);}
 return g;
 }
 function rebuild(p,lib,sel){simulation=null;fixtureGroups=[];project=p;assets=lib;selected=sel;dispose(world);dispose(racers);moving=[];
 const palette={alpine:{ground:'#b7c7a2',base:'#a0b28c',bg:'#e5ebdd',road:'#f4ead7',rail:'#75a593'},desert:{ground:'#dac39b',base:'#c3aa83',bg:'#f0e5d2',road:'#f5e6cc',rail:'#b88660'},night:{ground:'#a2b2b5',base:'#879ca3',bg:'#dce4e6',road:'#4e6371',rail:'#c2c8a6'}}[p.theme];scene.background.set(palette.bg);
 curve=new THREE.CatmullRomCurve3(p.points.map(q=>new THREE.Vector3(q.x,q.y,q.z)),true,'centripetal',.5);curve.arcLengthDivisions=2400;curve.updateArcLengths();samples=curve.getSpacedPoints(400);const len=curve.getLength();
 course=buildCourse(p,lib);
 const groundY=Math.min(0,...course.samples.map(s=>s.p[1]))-1;
 const radius=Math.max(83,...p.points.map(q=>Math.hypot(q.x,q.z)+18));cylinder(radius,radius*.98,3,palette.base,world,[0,groundY-2,0],64);cylinder(radius*.997,radius,1,palette.ground,world,[0,groundY-.3,0],64);
 const pool=mesh(new THREE.CircleGeometry(17,48),'#98baba');pool.rotation.x=-Math.PI/2;pool.position.set(-radius*.65,.25,-radius*.5);pool.scale.set(1,.7,1);
 for(let i=0;i<48;i++){const x=Math.sin(i*7.71)*radius*.88,z=Math.cos(i*4.91)*radius*.85;if(Math.hypot(x,z)>radius-7||samples.some(s=>Math.hypot(s.x-x,s.z-z)<p.width+4))continue;pine(world,x,0,z,.7+(i%4)*.13,p.theme==='desert'?'#9caa79':p.theme==='night'?'#587d76':'#5c896b');}
 for(let i=0;i<5;i++){const m=mesh(new THREE.ConeGeometry(10+i%2*4,12+i%3*4,5),p.theme==='desert'?'#bc9b7d':'#a0b2a2');m.position.set(-50+i*21,5,-radius+12+(i%2)*5);m.rotation.y=i*.8;}
 if(course.mesh){const road=physicalMesh({type:'trimesh',vertices:course.mesh.physics.vertices,indices:course.mesh.physics.indices},palette.road,world);road.material.side=THREE.DoubleSide;
  for(const extra of course.extra){const m=physicalMesh({type:'trimesh',vertices:extra.vertices,indices:extra.indices},extra.color,world);m.userData.elementId=extra.elementId;if(course.features.find(f=>f.id===extra.elementId)?.type==='tube'){m.material.transparent=true;m.material.opacity=.32;m.material.depthWrite=false;}}
 }
 if(p.mode==='cars'){for(let i=0;i<80;i++){const t=i/80,pos=curve.getPointAt(t),tan=curve.getTangentAt(t);const dash=box(.14,.025,1,'#e7e4cb',world,[pos.x,pos.y+.025,pos.z]);dash.rotation.y=Math.atan2(tan.x,tan.z);}}
 const start=curve.getPointAt(0),tangent=curve.getTangentAt(0);const startGroup=new THREE.Group();startGroup.position.copy(start);startGroup.rotation.y=Math.atan2(tangent.x,tangent.z);world.add(startGroup);for(let x=0;x<8;x++)for(let z=0;z<2;z++)box(p.width/8,.04,.45,(x+z)%2?'#436558':'#fffae9',startGroup,[(x-3.5)*p.width/8,.06,(z-.5)*.45]);
 for(const e of p.elements){const asset=lib.find(a=>a.id===e.assetId);const surface=surfaceTypes.has(typeOf(asset)),fs=course.frameAt?.(e.at*len),at=fs?new THREE.Vector3(...fs.p):curve.getPointAt(e.at),t=fs?new THREE.Vector3(...fs.t):curve.getTangentAt(e.at),n=new THREE.Vector3(-t.z,0,t.x).normalize();const g=surface?new THREE.Group():assetMesh(asset);g.position.copy(at.addScaledVector(n,e.offset));g.rotation.y=Math.atan2(t.x,t.z);g.scale.setScalar(e.scale*(asset?.scale||1));g.traverse(m=>m.userData.elementId=e.id);world.add(g);if(sel?.type==='element'&&sel.id===e.id){const ring=mesh(new THREE.TorusGeometry(3.7,.12,6,40),'#fff6a3',g);ring.rotation.x=Math.PI/2;ring.position.y=.15;ring.userData.elementId=e.id;}}
 for(const [i,r] of p.participants.filter(r=>r.enabled).entries()){const g=new THREE.Group();g.userData.runner=i;g.userData.size=r.size;g.userData.color=r.color;
 if(p.mode==='marbles'){const m=mesh(new THREE.SphereGeometry(.55*r.size,20,14),r.color,g);m.material.roughness=.22;const band=mesh(new THREE.TorusGeometry(.53*r.size,.07*r.size,6,24),'#fff3db',g);band.rotation.x=Math.PI/2;}
 else{const buggy=r.vehicleClass==='BGY',jet=r.vehicleClass==='JET',f1=r.vehicleClass==='F1';g.scale.setScalar(r.size);box(f1?.48:jet?.95:.8,buggy?.6:jet?.28:.45,jet?1.95:1.5,r.color,g,[0,buggy?.3:.15,0]);box(f1?.32:.58,jet?.2:.35,.65,'#dce8e5',g,[0,buggy?.8:jet?.38:.5,-.1]);for(const x of [-.48,.48])for(const z of [-.5,.5]){const wheel=cylinder(buggy?.32:.23,buggy?.32:.23,buggy?.25:.18,'#35443e',g,[x,0,z]);wheel.rotation.z=Math.PI/2;}if(f1||jet){box(1.1,.12,.25,r.color,g,[0,.55,-.78]);box(1,.12,.22,r.color,g,[0,.1,.73]);}}
 racers.add(g);}
 if(sel?.type==='node'){const q=p.points.find(q=>q.id===sel.id);if(q){const m=mesh(new THREE.SphereGeometry(.9,14,10),'#e9a45d');m.position.set(q.x,q.y+.7,q.z);}}
 positionRacers();return {length:len,elevation:Math.max(...p.points.map(q=>q.y))-Math.min(...p.points.map(q=>q.y))};
 }
 function positionRacers(){if(simulation){simulationPose();return;}if(!curve)return;for(const g of racers.children){const i=g.userData.runner;const t=play?((clock*.022-i*.006+10)%1):(.005+i*.0025);const pos=curve.getPointAt(t),tan=curve.getTangentAt(t),n=new THREE.Vector3(-tan.z,0,tan.x).normalize();g.position.copy(pos.addScaledVector(n,((i%3)-1)*project.width*.22));g.position.y+=project.mode==='marbles'?.58*g.userData.size:.3;g.rotation.y=Math.atan2(tan.x,tan.z);}}
 function nearest(point){let best=0,d=Infinity;for(let i=0;i<samples.length;i++){const a=samples[i],dist=(a.x-point.x)**2+(a.z-point.z)**2;if(dist<d){best=i;d=dist;}}return Math.min(.9999,best/400);}
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
 canvas.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});canvas.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const hits=ray.intersectObjects(world.children,true);if(placement){const hit=hits[0];if(hit)onPlace(nearest(hit.point));}else{const hit=hits.find(h=>h.object.userData.elementId);if(hit)onPick(hit.object.userData.elementId);else onPick(null);}});
 function fitCamera(){
 if(!project)return;
 const points=project.points.map(p=>new THREE.Vector3(p.x,p.y,p.z));
 for(const e of project.elements){const p=curve.getPointAt(e.at),t=curve.getTangentAt(e.at);p.add(new THREE.Vector3(-t.z,0,t.x).normalize().multiplyScalar(e.offset));p.y+=4;points.push(p);}
 const bounds=new THREE.Box3().setFromPoints(points).expandByScalar(5),center=bounds.getCenter(new THREE.Vector3());
 const dir=new THREE.Vector3(.67,.75,.82).normalize(),right=new THREE.Vector3().crossVectors(dir.clone().negate(),new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(right,dir.clone().negate());
 const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;let distance=30;
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const v=new THREE.Vector3(x,y,z).sub(center);distance=Math.max(distance,v.dot(dir)+Math.max(Math.abs(v.dot(right))/tanH,Math.abs(v.dot(up))/tanV));}
 controls.target.copy(center);camera.position.copy(center.clone().addScaledVector(dir,distance*1.12));controls.maxDistance=Math.max(280,distance*2);controls.update();
 }
 const resize=new ResizeObserver(()=>{const {width,height}=canvas.getBoundingClientRect();if(width&&height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(project)fitCamera();}});resize.observe(canvas);
 let last=performance.now();function animate(now){const dt=Math.min(.05,(now-last)/1000);last=now;if(play){clock+=dt*speed;if(simulation&&clock>simulation.duration){clock=simulation.duration;play=false;}for(const rotor of moving)rotor.rotation[rotor.userData.spinAxis||'y']+=dt*.8;positionRacers();}controls.update();if(canvas.offsetParent!==null)renderer.render(scene,camera);requestAnimationFrame(animate);}requestAnimationFrame(animate);

 function physicalMesh(part,color,parent){let geometry;
  if(part.type==='box')geometry=new THREE.BoxGeometry(...part.size);
  else if(part.type==='ball')geometry=new THREE.SphereGeometry(part.radius,20,14);
  else if(part.type==='trimesh'){geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.vertices,3));geometry.setIndex(Array.from(part.indices));geometry.computeVertexNormals();}
  else if(part.type==='cylinder')geometry=new THREE.CylinderGeometry(part.radius,part.radius,part.height,20);
  const m=mesh(geometry,color,parent);if(part.type==='trimesh')m.material.side=THREE.DoubleSide;m.position.fromArray(part.pos||[0,0,0]);m.quaternion.fromArray(part.quat||[0,0,0,1]);return m;
 }
 function loadSimulation(result,time=0){
  simulation=result;clock=time;play=false;moving=[];dispose(world);dispose(racers);fixtureGroups=[];controls.minDistance=3;
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(result.track.vertices,3));geo.setIndex(result.track.indices);geo.computeVertexNormals();const road=mesh(geo,'#e7ddc8');road.material.side=THREE.DoubleSide;
  for(const spec of result.fixtures){const group=new THREE.Group();world.add(group);for(const part of spec.parts){const m=physicalMesh(part,spec.color,group);m.userData.elementId=spec.elementId;if(spec.kind==='tube'){m.material.transparent=true;m.material.opacity=.32;m.material.depthWrite=false;}}group.position.fromArray(spec.pose);group.quaternion.fromArray(spec.pose,3);if(spec.movingIndex>=0)fixtureGroups[spec.movingIndex]=group;}
  for(const d of result.decoration||[]){const group=assetMesh({shape:d.type,color:d.color});group.position.fromArray(d.pos);group.quaternion.fromArray(d.quat);group.scale.setScalar(d.scale);world.add(group);}
  for(const spec of result.markers)physicalMesh({...spec,type:'box'},spec.color,world);
  for(const [i,r] of result.participants.entries()){
   const group=new THREE.Group();group.userData.runner=i;racers.add(group);
   if(result.mode==='marbles'){physicalMesh({type:'ball',radius:.55*r.size},r.color,group);const band=mesh(new THREE.TorusGeometry(.53*r.size,.04*r.size,6,24),'#fff5d9',group);band.rotation.x=Math.PI/2;}
   else{physicalMesh({type:'box',size:[.8*r.size,.4*r.size,1.6*r.size]},r.color,group);const window=box(.55*r.size,.08*r.size,.4*r.size,'#324a50',group,[0,.22*r.size,.25*r.size]);group.userData.wheels=[];for(const z of [.55,-.55])for(const x of [-.45,.45]){const pivot=new THREE.Group();pivot.position.set(x*r.size,0,z*r.size);group.add(pivot);const wheel=cylinder(.23*r.size,.23*r.size,.15*r.size,'#273b34',pivot,[0,0,0]);wheel.rotation.z=Math.PI/2;group.userData.wheels.push({pivot,wheel});}}
  }
  simulationPose();
 }
 function simulationPose(){
  const state=sampleReplay(simulation,clock);
  const pose=(object,p)=>{object.position.fromArray(p);object.quaternion.fromArray(p,3);};
  racers.children.forEach((r,i)=>{pose(r,state.racers[i]);r.visible=clock<=simulation.standings.find(s=>s.id===simulation.participants[i].id).time+.15;if(r.userData.wheels)r.userData.wheels.forEach(({pivot,wheel},k)=>{const w=state.wheels[i][k];pivot.position.y=-w[2];pivot.rotation.y=w[0];wheel.rotation.x=w[1];});});
  fixtureGroups.forEach((group,i)=>pose(group,state.fixtures[i]));
 }
 return {rebuild,loadSimulation,focusElement(id){const e=project.elements.find(e=>e.id===id);if(!e)return;const f=course?.features.find(f=>f.id===id),center=new THREE.Vector3(...(f?.bowl?.center||course?.frameAt(e.at*curve.getLength()).p||curve.getPointAt(e.at).toArray()));const dist=Math.max(12,(f?.bowl?.radius||project.width*(f?.scale||1))*4);controls.maxDistance=Math.max(controls.maxDistance,dist*2);controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(.6,.65,.8).normalize().multiplyScalar(dist));controls.update();},seek(time){if(simulation){clock=Math.max(0,Math.min(simulation.duration,time));simulationPose();}},playback(){return {time:clock,playing:play,physical:!!simulation};},setPlacement(v){placement=v;canvas.style.cursor=v?'crosshair':'grab';},setPlay(v){if(simulation&&clock>=simulation.duration)clock=0;play=v;positionRacers();},setSpeed(v){speed=v;},fit:fitCamera,getCurve(){return curve;},nearest};
}
