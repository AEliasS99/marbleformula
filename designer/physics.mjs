// Isolated design bake. No season mutation, rendering, rescue, or publishing.
import RAPIER from '@dimforge/rapier3d-compat';
import {Vector3,Quaternion,Matrix4} from 'three';
import {buildCourse,baseGeometry,courseFeatures,surfaceTypes,typeOf} from './public/course.js';
import {scaledWorld} from './scaled-world.mjs';
import {fanGust} from '../src/gp/obstacles/fan.js';
import {OBSTACLES,BY_TYPE} from '../src/gp/obstacles/index.js';
import {frameQuat,pointInFrame,surfaceHeight} from '../src/gp/obstacles/kit.js';
import {validateProject} from './model.mjs';
export const ENGINE='racecraft-rapier-3';
const shared=new Set(['pegs','bumpers','splitter','spinner','hammer','turntable','pusher','rollers','switch']);
const simple=new Set(['checkpoint','pine','stand','rock','arch','barrier','chicane','booster','drs']);
const V=a=>new Vector3(...a), arr=v=>[v.x,v.y,v.z], quat=q=>[q.x,q.y,q.z,q.w];
const mod=(x,n)=>(x%n+n)%n, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const geometry=baseGeometry;
export function preflight(p,assets,settings={}){
 validateProject(p);settings=settings&&typeof settings==='object'?settings:{};const errors=[],warnings=[];
 const duration=settings.duration??60,launchSpeed=settings.launchSpeed??12;
 if(!Number.isFinite(duration)||duration<5||duration>180||!Number.isFinite(launchSpeed)||launchSpeed<0||launchSpeed>25)errors.push({message:'Duración: 5–180 s. Impulso inicial: 0–25 m/s.'});
 const racers=p.participants.filter(r=>r.enabled);
 if(!racers.length)errors.push({message:'Activa al menos un participante.'});
 if(racers.some(r=>1.1*r.size>p.width-.4))errors.push({message:'El ancho no deja espacio para el participante más grande.'});
 const resolved=p.elements.map(e=>({...e,type:typeOf(assets.find(a=>a.id===e.assetId)),effectiveScale:e.scale*(assets.find(a=>a.id===e.assetId)?.scale||1)}));
 for(const e of resolved){const a=assets.find(a=>a.id===e.assetId);
  if(!a||!a.modes.includes(p.mode)||(!shared.has(e.type)&&!simple.has(e.type)&&!surfaceTypes.has(e.type)&&!['fan','regroup'].includes(e.type)))errors.push({elementId:e.id,message:`${e.name}: no tiene un comportamiento físico reconocido.`});
  if(a?.custom)warnings.push(`${e.name}: usa la física de «${e.type}», con la escala y el color de tu variante. La descripción escrita no añade movimientos nuevos.`);
 }
 const g=geometry(p);
 if(!Number.isFinite(g.length)||g.length<20||g.length>1800)errors.push({message:'La longitud física debe estar entre 20 y 1800 metros.'});
 if(p.points.some((q,i)=>V([q.x,q.y,q.z]).distanceTo(new Vector3(p.points[(i+1)%p.points.length].x,p.points[(i+1)%p.points.length].y,p.points[(i+1)%p.points.length].z))<.5))errors.push({message:'Separa los puntos consecutivos al menos 0,5 m.'});
 if(g.samples.some(s=>Math.abs(s.t[1])>.85||!s.r.every(Number.isFinite)))errors.push({message:'Hay un tramo casi vertical: suaviza su pendiente.'});
 if(g.samples.some(s=>Math.abs(s.curv)*p.width/2>.85))errors.push({message:'Una curva es demasiado cerrada para este ancho. Abre el trazado o reduce el ancho.'});
 const checkpoints=resolved.filter(e=>e.type==='checkpoint').sort((a,b)=>a.at-b.at);
 if(checkpoints.some((e,i)=>Math.abs(e.offset)>.01||Math.abs(e.effectiveScale-1)>.01||(i&&e.at-checkpoints[i-1].at<.01)))errors.push({message:'Los checkpoints deben estar centrados, en escala 1 y separados al menos un 1% del recorrido.'});
 const features=courseFeatures(p,assets,g),surfaces=features.filter(f=>surfaceTypes.has(f.type));
 for(const f of surfaces){
  if(f.start<2||f.end>g.length-2)errors.push({elementId:f.id,message:`${f.name}: su tramo físico cruza la salida. Desplázalo hacia el interior del recorrido.`});
  if(Math.abs(f.offset)>.01&&f.type!=='vortex')errors.push({elementId:f.id,message:`${f.name}: modifica todo el ancho del suelo y debe estar centrado (desplazamiento 0).`});
  if(f.type==='vortex'&&f.bowl.hole<Math.max(.275,...racers.map(r=>.55*r.size))+.12)errors.push({elementId:f.id,message:`${f.name}: la garganta no deja pasar al participante mayor. Aumenta la escala o reduce su tamaño.`});
  if(f.type==='vortex'&&p.mode==='cars')errors.push({elementId:f.id,message:`${f.name}: el embudo es para canicas; usa saltos, túneles o rampas en coches.`});
  if(f.type==='tube'&&p.width*f.scale/2<Math.max(.55,...racers.map(r=>1.1*r.size))+.1)errors.push({elementId:f.id,message:`${f.name}: aumenta el ancho para dejar altura libre en el túnel.`});
  if(checkpoints.some(e=>e.at*g.length>f.start&&e.at*g.length<f.end))errors.push({elementId:f.id,message:`${f.name}: un checkpoint está dentro de su tramo. Separa la puerta de la entrada, hueco y recepción.`});
 }
 for(let i=0;i<surfaces.length;i++)for(let j=i+1;j<surfaces.length;j++){const a=surfaces[i],b=surfaces[j];if(a.start<b.end&&b.start<a.end)errors.push({elementId:b.id,message:`${b.name}: su tramo se solapa con ${a.name}. Separa las piezas para que sus superficies no se crucen.`});}
 if(surfaces.length)warnings.push('Rampas, huecos, túneles y drenajes modifican el suelo entre sus entradas y salidas; se ven antes de calcular. El vórtice recupera después la cota del trazado: comprueba que hay energía para subir.');
 if(checkpoints.length!==3||racers.length<4)warnings.push('Ensayo sin eliminación: se requieren tres checkpoints y al menos cuatro participantes.');
 warnings.push('Ensayo de diseño, no aprobación para producción: física a 120 Hz y reproducción a 30 fps. No equivale al controlador de temporada.');
 warnings.push('Pinos y gradas son decorativos; no tienen colisión. No hay rescates ni reposicionamientos.');
 if(p.mode==='cars')warnings.push('Coches: chasis rígido con cuatro ruedas por rayos, suspensión y piloto automático. Las clases visuales comparten chasis; VEL/EST/INT ajustan velocidad, agarre y anticipación. DRS es una zona de potencia, no aerodinámica.');
 else warnings.push('Canicas: gravedad, contacto y giro libres; los atributos VEL/EST/INT no se aplican. Un circuito cerrado con ascensos puede detenerlas sin aceleradores.');
 return {errors,warnings,settings:{duration,launchSpeed},length:g.length};
}
export async function simulate(p,assets,settings={},progress=()=>{}){
 const check=preflight(p,assets,settings);if(check.errors.length)throw Error(check.errors.map(e=>e.message).join('\n'));
 await RAPIER.init();const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/120;
 world.integrationParameters.numSolverIterations=8;
 try{
 const g=buildCourse(p,assets),{length,frameAt,samples,mesh}=g;
 const track=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.physics.vertices,mesh.physics.indices).setFriction(.65).setRestitution(.08),track);
 const fixtureBodies=[],kinematics=[],zones=[],markers=[],fans=[],regroups=[],decoration=[];
 const recordBodies=(before,color,elementId)=>{world.forEachRigidBody(b=>{if(b.handle===track.handle||before.has(b.handle))return;fixtureBodies.push({body:b,color,elementId});});};
 const bodyHandles=()=>{const set=new Set();world.forEachRigidBody(b=>set.add(b.handle));return set;};
 const solid=(desc,pos,q,color,id)=>{const b=world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...pos).setRotation(q));world.createCollider(desc.setFriction(.5).setRestitution(.2),b);fixtureBodies.push({body:b,color,elementId:id});};
 for(const extra of g.extra){const b=world.createRigidBody(RAPIER.RigidBodyDesc.fixed());world.createCollider(RAPIER.ColliderDesc.trimesh(extra.vertices,extra.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(extra.friction).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(.1),b);fixtureBodies.push({body:b,kind:extra.kind,color:extra.color,elementId:extra.elementId});}
 for(const original of p.elements){const a=assets.find(a=>a.id===original.assetId),e={...original,assetId:typeOf(a)},scale=e.scale*(a.scale||1),u=e.at*length;
  const offsetFrame=x=>{const s=frameAt(x);s.p=V(s.p).addScaledVector(V(s.r),e.offset).toArray();return s;};
  const s=offsetFrame(u),q=frameQuat(s),pos=(forward,up,lateral)=>V(s.p).addScaledVector(V(s.t),forward).addScaledVector(V(s.n),up).addScaledVector(V(s.r),lateral).toArray();
  if(shared.has(e.assetId)){
   const sw=scaledWorld(world,s.p,scale);
   const out=Object.fromEntries(OBSTACLES.filter(o=>o.collection).map(o=>[o.collection,[]])),statics=[],before=bodyHandles(),o=BY_TYPE[e.assetId];
   o.build({type:e.assetId,u,label:e.name,span:5},{frameAt:offsetFrame,statics,out,sync:{},cylinder:(kind,u,lat,radius,height,restitution)=>{const fs=offsetFrame(u);statics.push({kind,shape:'cylinder',pos:pointInFrame(fs,lat,surfaceHeight(lat,fs.w)+height/2),quat:quat(frameQuat(fs)),radius,height,restitution});}});
   for(const st of statics){const d=st.shape==='cylinder'?RAPIER.ColliderDesc.cylinder(st.height/2,st.radius):RAPIER.ColliderDesc.cuboid(...st.size.map(x=>x/2));const b=sw.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(...st.pos).setRotation(new Quaternion(...st.quat)));sw.createCollider(d.setFriction(.2).setRestitution(st.restitution??.3),b);}
   for(const list of Object.values(out))for(const item of list)if(Number.isFinite(item.phase))item.phase+=(p.seed%997)/997*Math.PI*2;
   if(o.physics){const h=o.physics(sw,out[o.collection],{RAPIER,groups:{track:0xffffffff,clear:0xffffffff},trackBody:track,samples,GRID_LENGTH:0,SAMPLE:length/g.count,FPS:120});if(h.kinematics)kinematics.push(h.kinematics);}
   for(const z of out.boosters||[]){zones.push({u:u+(z.u0-u)*scale,span:(z.u1-z.u0)*scale,offset:e.offset+(z.latCenter||0)*scale,half:(z.latHalf||z.width/2)*scale,target:z.target,accel:z.accel});markers.push({pos:V(s.p).add(V(z.pos).sub(V(s.p)).multiplyScalar(scale)).toArray(),quat:z.quat,size:[z.length*scale,.04,z.width*scale],color:'#83b989'});}
   recordBodies(before,a.color,e.id);
  }else if(['booster','drs'].includes(e.assetId)){zones.push({u,span:4*scale,offset:e.offset,half:p.width*.43*scale,target:e.assetId==='drs'?20:16,accel:e.assetId==='drs'?8:50});markers.push({pos:pos(2*scale,.03,0),quat:quat(q),size:[4*scale,.05,p.width*.86*scale],color:a.color});}
  else if(e.assetId==='fan'){
   const fan={u0:u,u1:u+5*scale,offset:e.offset,half:p.width/2,scale,accel:6,period:1.6,phase:(p.seed%997)/997*2*Math.PI};fans.push(fan);
   const fanPos=pos(2.5*scale,1.3*scale,-p.width/2-1.1*scale);
   solid(RAPIER.ColliderDesc.cuboid(.18*scale,.65*scale,.18*scale),pos(2.5*scale,.65*scale,-p.width/2-1.1*scale),q,'#6e827a',e.id);
   const b=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...fanPos).setRotation(q));
   for(const size of [[1.5,.12,.1],[.12,1.5,.1]])world.createCollider(RAPIER.ColliderDesc.cuboid(...size.map(x=>x*scale/2)),b);
   fixtureBodies.push({body:b,color:a.color,elementId:e.id});kinematics.push(t=>b.setNextKinematicRotation(q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),t*8))));
   markers.push({pos:pos(2.5*scale,.025,0),quat:quat(q),size:[5*scale,.04,p.width],color:'#8ac8d0'});
  }
  else if(e.assetId==='regroup'){
   const height=.9*scale,barPos=pos(0,height/2+.02,0),b=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...barPos).setRotation(q));
   world.createCollider(RAPIER.ColliderDesc.cuboid(.3*scale,height/2,p.width*scale/2-.04*scale).setFriction(.2).setRestitution(.05),b);
   fixtureBodies.push({body:b,color:a.color,elementId:e.id});regroups.push({id:e.id,u,scale,body:b,base:barPos,normal:s.n,lift:Math.max(1.7*scale,2.2*Math.max(...p.participants.filter(r=>r.enabled).map(r=>r.size))),amount:0,lap:0,first:null,open:null});
  }
  else if(e.assetId==='barrier')solid(RAPIER.ColliderDesc.cuboid(.3*scale,.5*scale,2.5*scale),pos(0,.5*scale,0),q,a.color,e.id);
  else if(e.assetId==='rock')solid(RAPIER.ColliderDesc.ball(1.8*scale),pos(0,1.2*scale,0),q,a.color,e.id);
  else if(e.assetId==='chicane'){for(let i=0;i<3;i++)solid(RAPIER.ColliderDesc.cylinder(.45*scale,.4*scale),pos(i*2.5*scale,.45*scale,(i%2?1:-1)*p.width*.25),q,a.color,e.id);}
  else if(e.assetId==='arch'){for(const side of [-1,1])solid(RAPIER.ColliderDesc.cuboid(.2*scale,2*scale,.2*scale),pos(0,2*scale,side*(p.width/2+1)*scale),q,a.color,e.id);solid(RAPIER.ColliderDesc.cuboid(.2*scale,.2*scale,(p.width/2+1)*scale),pos(0,4*scale,0),q,a.color,e.id);}
  else if(['pine','stand'].includes(e.assetId))decoration.push({type:e.assetId,color:a.color,scale,pos:pos(0,0,0),quat:quat(q.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2)))});
  else if(e.assetId==='checkpoint')markers.push({pos:pos(0,.03,0),quat:quat(q),size:[.25,.06,p.width],color:a.color});
 }
 const participants=p.participants.filter(r=>r.enabled),maxSize=Math.max(...participants.map(r=>r.size));
 const spacing=(p.mode==='cars'?1.4:1.25)*maxSize,cols=Math.max(1,Math.floor((p.width-.3)/spacing)),rowGap=(p.mode==='cars'?2.7:1.4)*maxSize;
 if(Math.ceil(participants.length/cols)*rowGap>length*.2)throw Error('La parrilla ocupa más del 20% del circuito: reduce participantes o amplía el trazado.');
 const racers=participants.map((r,i)=>{
  const u=-2-Math.floor(i/cols)*rowGap,s=frameAt(u),lateral=((i%cols)-(Math.min(cols,participants.length)-1)/2)*spacing;
  const pos=V(s.p).addScaledVector(V(s.r),lateral).addScaledVector(V(s.n),(p.mode==='marbles'?.55:.65)*r.size+.03);
  // A vehicle points along local +Z; shared obstacles point along local +X.
  const q=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(V(s.r).negate(),V(s.n),V(s.t)));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...pos.toArray()).setRotation(q).setCcdEnabled(true).setLinearDamping(p.mode==='cars'?.02:.015).setAngularDamping(.03));
  const desc=p.mode==='marbles'?RAPIER.ColliderDesc.ball(.55*r.size).setDensity(1):RAPIER.ColliderDesc.cuboid(.4*r.size,.2*r.size,.8*r.size).setDensity(200);
  world.createCollider(desc.setFriction(p.mode==='marbles'?.35:.2).setRestitution(.15),body);
  body.setLinvel(V(s.t).multiplyScalar(check.settings.launchSpeed),true);
  let car;
  if(p.mode==='cars'){
   car=world.createVehicleController(body);car.indexUpAxis=1;car.setIndexForwardAxis=2;
   for(const z of [.55,-.55])for(const x of [-.45,.45]){const k=car.numWheels();car.addWheel({x:x*r.size,y:0,z:z*r.size},{x:0,y:-1,z:0},{x:-1,y:0,z:0},.25*r.size,.23*r.size);car.setWheelSuspensionStiffness(k,35);car.setWheelSuspensionCompression(k,4.4);car.setWheelSuspensionRelaxation(k,4);car.setWheelMaxSuspensionTravel(k,.2*r.size);car.setWheelMaxSuspensionForce(k,4000*r.size**3);car.setWheelFrictionSlip(k,1.4+r.grip*.35);car.setWheelSideFrictionStiffness(k,1);}
  }
  return {r,body,car,u,lastU:mod(u,length),furthest:u,lastAdvance:0,status:'running',time:null,cp:[],motionAnchor:pos.clone(),inVortex:null};
 });
 const pose=b=>[...arr(b.translation()),...quat(b.rotation())].map(x=>Math.round(x*100000)/100000);
 // Tyre suspension samples road/fixtures, never another racer's roof. Chassis contacts still resolve normally.
 const racerBodies=new Set(racers.map(r=>r.body.handle));
 const movingFixtures=fixtureBodies.filter(x=>x.body.isKinematic());
 const fixtureSpecs=fixtureBodies.map(({body,color,elementId,kind})=>({color,elementId,kind,pose:pose(body),movingIndex:movingFixtures.findIndex(x=>x.body===body),parts:Array.from({length:body.numColliders()},(_,i)=>{const c=body.collider(i),s=c.shape;const base={pos:arr(c.translationWrtParent()),quat:quat(c.rotationWrtParent())};if(s.type===RAPIER.ShapeType.Cuboid)return {...base,type:'box',size:arr(s.halfExtents).map(x=>x*2)};if(s.type===RAPIER.ShapeType.Cylinder)return {...base,type:'cylinder',radius:s.radius,height:s.halfHeight*2};if(s.type===RAPIER.ShapeType.Ball)return {...base,type:'ball',radius:s.radius};if(s.type===RAPIER.ShapeType.TriMesh)return {...base,type:'trimesh',vertices:Array.from(s.vertices),indices:Array.from(s.indices)};throw Error('Colisionador sin representación visual: '+s.type);})}));
 const checkpoints=p.elements.filter(e=>typeOf(assets.find(a=>a.id===e.assetId))==='checkpoint').sort((a,b)=>a.at-b.at),eliminate=checkpoints.length===3&&racers.length>=4;
 const gates=eliminate?checkpoints.map((e,i)=>({id:e.id,name:e.name,u:(e.at+(i===2?p.laps-1:0))*length,quota:racers.length-i-1,passed:[]})):[];
 const minY=Math.min(-10,...samples.map(s=>s.p[1]))-8;
 const events=[],frames=[],dt=1/120,steps=Math.round(check.settings.duration/dt);let elapsed=0;
 function capture(){frames.push({t:elapsed,telemetry:racers.map(x=>({u:x.u,speed:new Vector3().copy(x.body.linvel()).length(),up:new Vector3(0,1,0).applyQuaternion(new Quaternion().copy(x.body.rotation())).y,contacts:x.car?Array.from({length:4},(_,k)=>({contact:x.car.wheelIsInContact(k),dynamic:x.car.wheelGroundObject(k)?.parent()?.isDynamic()||false,normal:x.car.wheelContactNormal(k)})):[]})),racers:racers.map(x=>pose(x.body)),active:racers.map(x=>x.status==='running'),fixtures:movingFixtures.map(x=>pose(x.body)),wheels:racers.map(x=>x.car?Array.from({length:4},(_,k)=>[x.car.wheelSteering(k),x.car.wheelRotation(k),elapsed===0?x.car.wheelSuspensionRestLength(k):x.car.wheelSuspensionLength(k)]):[])});}
 function stop(r,status,time){if(r.status!=='running')return;r.status=status;r.time=time;events.push({time,participantId:r.r.id,status});r.body.setEnabled(false);}
 // Local projection prevents a crossing/overpass from jumping to a distant section.
 function locate(r){const point=new Vector3().copy(r.body.translation()),center=Math.floor(mod(r.u,length)/length*g.count),window=Math.ceil(14/(length/g.count));let best=Infinity,result;
  for(let k=center-window;k<=center+window;k++){const idx=mod(k,g.count),a=V(samples[idx].p),b=V(samples[idx+1].p),ab=b.sub(a),t=clamp(point.clone().sub(a).dot(ab)/ab.lengthSq(),0,1),at=a.addScaledVector(ab,t),d=point.distanceToSquared(at);if(d<best){best=d;result={u:mod((idx+t)*length/g.count,length),s:frameAt((idx+t)*length/g.count),distance:Math.sqrt(d)};}}
  return result;
 }
 capture();
 for(let step=1;step<=steps;step++){
  elapsed=step*dt;
  for(const gate of regroups){
   const active=racers.filter(r=>r.status==='running');
   if(gate.open===null&&gate.first===null){const approaching=active.filter(r=>{const d=mod(r.u,length)-gate.u;return d>=-(2.2+.3*gate.scale)&&d<2;});if(approaching.length)gate.lap=Math.min(...approaching.map(r=>Math.floor(r.u/length)));}
   const target=gate.u+gate.lap*length;
   const here=active.filter(r=>r.u>=target-(2.2+.3*gate.scale)&&r.u<target+2);
   if(gate.open===null&&here.length&&gate.first===null)gate.first=elapsed;
   if(gate.open===null&&gate.first!==null&&(here.length>=Math.ceil(active.filter(r=>r.u<target+2).length*.5)||elapsed-gate.first>=4)){gate.open=elapsed;events.push({time:elapsed,status:'regroup-open',elementId:gate.id,lap:gate.lap+1});}
   if(gate.open!==null&&elapsed-gate.open>4&&active.every(r=>r.u>target+3||r.u<target-30)){gate.lap++;gate.open=null;gate.first=null;}
   gate.amount=clamp(gate.amount+(gate.open===null?-dt*2:dt*2),0,1);const eased=gate.amount*gate.amount*(3-2*gate.amount);
   gate.body.setNextKinematicTranslation(V(gate.base).addScaledVector(V(gate.normal),gate.lift*eased));
  }
  for(const fn of kinematics)fn(elapsed);
  for(const r of racers){if(r.status!=='running')continue;
   r.body.resetForces(true);const s=frameAt(r.u),v=new Vector3().copy(r.body.linvel()),speed=v.dot(V(s.t));
   if(r.car){
    const look=4+r.r.intelligence+Math.max(0,speed)*.3,target=V(frameAt(r.u+look).p),pos=new Vector3().copy(r.body.translation()),q=new Quaternion().copy(r.body.rotation()),local=target.sub(pos).applyQuaternion(q.clone().invert()),steer=clamp(Math.atan2(local.x,local.z),-.48,.48);
    const bend=Math.abs(frameAt(r.u+look).t.reduce((sum,x,i)=>sum+x*s.t[i],0));const desired=(8+r.r.speed*2)*Math.max(.4,bend*bend);
    for(let k=0;k<4;k++){r.car.setWheelSteering(k,k<2?steer:0);r.car.setWheelEngineForce(k,k>=2?clamp((desired-speed)*r.body.mass()*1.5,-r.body.mass()*3,r.body.mass()*4):0);r.car.setWheelBrake(k,speed>desired+1?r.body.mass()*.12:0);}
    r.car.updateVehicle(dt,undefined,undefined,c=>!racerBodies.has(c.parent()?.handle));
   }
   for(const fan of fans){const du=mod(r.u-fan.u0,length),position=new Vector3().copy(r.body.translation()),lateral=position.clone().sub(V(s.p)).dot(V(s.r)),height=position.y-s.p[1];if(du<fan.u1-fan.u0&&Math.abs(lateral-fan.offset)<fan.half&&height>-.2&&height<3*fan.scale)r.body.addForce(V(s.r).multiplyScalar(fan.accel*fanGust(fan,elapsed)*r.body.mass()),true);}
   for(const z of zones){const du=mod(r.u-z.u,length),lateral=new Vector3().copy(r.body.translation()).sub(V(s.p)).dot(V(s.r));if(du<z.span&&Math.abs(lateral-z.offset)<z.half&&!s.gap&&Math.abs(r.body.translation().y-s.p[1])<.85*r.r.size&&speed<z.target)r.body.addForce(V(s.t).multiplyScalar(Math.min(z.accel,(z.target-speed)/dt)*r.body.mass()),true);}
  }
  world.step();const crossings=[];
  for(const r of racers){if(r.status!=='running')continue;const old=r.u,loc=locate(r);let delta=loc.u-r.lastU;if(delta>length/2)delta-=length;if(delta< -length/2)delta+=length;r.u+=delta;r.lastU=loc.u;
   const pos=r.body.translation();if(![pos.x,pos.y,pos.z,r.u].every(Number.isFinite))throw Error('Estado físico no finito: ensayo detenido.');
   const bowl=g.features.find(f=>f.type==='vortex'&&Math.abs(mod(r.u-f.u+length/2,length)-length/2)<f.bowl.radius+8&&Math.hypot(pos.x-f.bowl.center[0],pos.z-f.bowl.center[2])<f.bowl.radius+.3&&pos.y<f.bowl.center[1]+f.bowl.lip+1&&pos.y>f.bowl.center[1]-f.bowl.depth-f.bowl.throat+.15);
   if(bowl&&!r.inVortex){r.inVortex=bowl.id;events.push({time:elapsed,participantId:r.r.id,status:'vortex-enter',elementId:bowl.id});}
   if(!bowl&&r.inVortex){events.push({time:elapsed,participantId:r.r.id,status:'vortex-exit',elementId:r.inVortex});r.inVortex=null;}
   const drain=g.features.find(f=>f.type==='vortex'&&Math.hypot(pos.x-f.bowl.center[0],pos.z-f.bowl.center[2])<f.bowl.radius+3);
   const fallFloor=drain?Math.min(loc.s.p[1],drain.lowerY):loc.s.p[1];
   if(!bowl&&(pos.y<fallFloor-4||pos.y<minY)){stop(r,'fell',elapsed);continue;}
   if(r.motionAnchor.distanceTo(new Vector3().copy(pos))>.3){r.motionAnchor.copy(pos);r.lastAdvance=elapsed;}r.furthest=Math.max(r.furthest,r.u);if(elapsed-r.lastAdvance>12){stop(r,'stuck',elapsed);continue;}
   for(const [i,gate] of gates.entries())if(!r.cp.includes(i)&&old<gate.u&&r.u>=gate.u)crossings.push({r,i,time:elapsed-dt+dt*(gate.u-old)/(r.u-old)});
   if(old<p.laps*length&&r.u>=p.laps*length)crossings.push({r,i:3,time:elapsed-dt+dt*(p.laps*length-old)/(r.u-old)});
  }
  crossings.sort((a,b)=>a.time-b.time||a.r.r.id.localeCompare(b.r.r.id));
  for(const c of crossings){if(c.r.status!=='running')continue;if(c.i===3){stop(c.r,'finished',c.time);continue;}const gate=gates[c.i];c.r.cp.push(c.i);if(gate.passed.length>=gate.quota){stop(c.r,'eliminated',c.time);}else{gate.passed.push(c.r.r.id);events.push({time:c.time,participantId:c.r.r.id,status:'checkpoint',gate:gate.name});}}
  if(step%4===0)capture();if(step%240===0)progress(elapsed/check.settings.duration);
  if(racers.every(r=>r.status!=='running'))break;
 }
 for(const r of racers)if(r.status==='running')stop(r,'timeout',elapsed);
 if(frames.at(-1).t!==elapsed)capture();
 const standings=racers.map(r=>({id:r.r.id,name:r.r.name,color:r.r.color,status:r.status,time:r.time,distance:Math.max(0,r.u),laps:Math.max(0,Math.floor(r.u/length)),checkpoints:r.cp.length})).sort((a,b)=>(a.status==='finished'?0:1)-(b.status==='finished'?0:1)||(a.status==='finished'?a.time-b.time:b.distance-a.distance));
 return {engine:ENGINE,projectId:p.id,revision:p.revision,mode:p.mode,settings:check.settings,physicsHz:120,fps:30,duration:elapsed,length,warnings:check.warnings,participants,standings,events,features:g.features.filter(f=>surfaceTypes.has(f.type)||['fan','regroup'].includes(f.type)).map(f=>({id:f.id,name:f.name,type:f.type,start:f.start,end:f.end,scale:f.scale})),gates: gates.map(({passed,...g})=>({...g,passed})),track:{vertices:Array.from(mesh.physics.vertices),indices:Array.from(mesh.physics.indices)},fixtures:fixtureSpecs,markers,decoration,frames,productionReady:false};
 }finally{world.free();}
}
