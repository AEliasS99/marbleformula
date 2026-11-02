import {useEffect,useLayoutEffect,useMemo} from 'react';
import {AbsoluteFill,Composition,useCurrentFrame,useVideoConfig,Html5Audio,staticFile} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {CarBody,createCarGeometries,carLiveryTexture,type CarWheel} from '../gp/CarModel';
import {FinishLine} from '../gp/FinishLine';
import {planCameras,cameraAt} from './camera.mjs';
import {sampleReplay} from '../../designer/public/replay.js';

type Pose=[number,number,number,number,number,number,number];
type Racer={id:string;name:string;color:string;size:number;vehicleClass:string};
type Result={id:string;name:string;color:string;status:string;time:number;distance:number;checkpoints:number};
type Part={type:string;pos:number[];quat:number[];size?:number[];radius?:number;height?:number;vertices?:number[];indices?:number[]};
export type Replay={engine:string;snapshotHash:string;duration:number;length:number;participants:Racer[];standings:Result[];frames:any[];track:{vertices:number[];indices:number[]};fixtures:{pose:Pose;movingIndex:number;color:string;parts:Part[]}[];markers:{pos:number[];quat:number[];size:number[];color:string}[];gates:{u:number;quota:number;passed:string[]}[];events:{time:number;participantId?:string;status:string;gate?:string}[]};
type Finish={position:[number,number,number];tangent:[number,number,number];normal:[number,number,number];right:[number,number,number];width:number};
export type ReplayProps={replay:Replay|null;title:string;audio?:string;finish?:Finish};
export const replayFrames=(r:Replay)=>Math.ceil((2+r.duration+3)*60);
const flagCode:Record<string,string>={ESP:'ES',BRA:'BR',ARG:'AR',AUT:'AT',JPN:'JP',DEU:'DE'};
const vector=(a:number[])=>new THREE.Vector3(...a as [number,number,number]);
function meshGeometry(vertices:number[],indices:number[]){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();return g;}
function PhysicalPart({part,color}:{part:Part;color:string}){const g=useMemo(()=>part.type==='trimesh'?meshGeometry(part.vertices!,part.indices!):null,[part]);useEffect(()=>()=>g?.dispose(),[g]);return <mesh position={part.pos as any} quaternion={part.quat as any} castShadow receiveShadow>{g?<primitive object={g} attach="geometry"/>:part.type==='box'?<boxGeometry args={part.size as any}/>:part.type==='ball'?<sphereGeometry args={[part.radius,32,24]}/>:<cylinderGeometry args={[part.radius,part.radius,part.height,32]}/>}<meshStandardMaterial color={color} roughness={.55} metalness={.2}/></mesh>;}
function World({r,t,finish}:{r:Replay;t:number;finish:Finish}){
 const shots=useMemo(()=>planCameras(r),[r]);
 const state=sampleReplay(r,t),{camera,gl,scene}=useThree();
 const geometry=useMemo(()=>meshGeometry(r.track.vertices,r.track.indices),[r]);
 const geoms=useMemo(()=>createCarGeometries(),[]);
 const textures=useMemo(()=>r.participants.map((p,i)=>carLiveryTexture(flagCode[p.id]||p.id,p.color,i+1)),[r]);
 useEffect(()=>()=>{geometry.dispose();textures.forEach(x=>x.dispose());Object.values(geoms).flat().forEach(g=>g.dispose());},[geometry,textures,geoms]);
 useLayoutEffect(()=>{gl.toneMapping=THREE.ACESFilmicToneMapping;gl.toneMappingExposure=1.05;scene.background=new THREE.Color('#182837');},[gl,scene]);
 useLayoutEffect(()=>{
  const shot=cameraAt(r,shots,t,finish,camera instanceof THREE.PerspectiveCamera?camera.aspect:16/9);camera.position.set(...shot.position as [number,number,number]);camera.lookAt(...shot.target as [number,number,number]);(camera as THREE.PerspectiveCamera).fov=shot.fov;camera.updateProjectionMatrix();
 },[camera,r,shots,t,finish]);
 return <>
  <hemisphereLight args={['#c9e3ff','#344933',2]}/><directionalLight position={[25,65,35]} intensity={3} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-44} shadow-camera-right={44} shadow-camera-top={44} shadow-camera-bottom={-44} shadow-camera-far={150} shadow-bias={-.0002}/>
  <mesh geometry={geometry} receiveShadow><meshStandardMaterial color="#404d59" roughness={.86} metalness={.05} side={THREE.DoubleSide}/></mesh>
  <mesh rotation-x={-Math.PI/2} position={[0,1.8,0]} receiveShadow><planeGeometry args={[900,900]}/><meshStandardMaterial color="#1e343a" roughness={1}/></mesh>
  <FinishLine {...finish}/>
  {r.fixtures.map((f,i)=>{const pose=f.movingIndex>=0?state.fixtures[f.movingIndex]:f.pose;return <group key={i} position={pose.slice(0,3) as any} quaternion={pose.slice(3) as any}>{f.parts.map((p,j)=><PhysicalPart key={j} part={p} color={f.color}/>)}</group>;})}
  {r.markers.map((m,i)=><mesh key={i} position={m.pos as any} quaternion={m.quat as any}><boxGeometry args={m.size as any}/><meshStandardMaterial color={m.color} emissive={m.color} emissiveIntensity={.7}/></mesh>)}
  {r.participants.map((p,i)=>{const pose=state.racers[i],result=r.standings.find(x=>x.id===p.id)!;const q=new THREE.Quaternion(...pose.slice(3)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2));return <group key={p.id} position={pose.slice(0,3) as any} quaternion={q} scale={p.size} visible={t<result.time+.15}>
   <CarBody carGeoms={geoms} carStyle={({F1:0,GT:1,BGY:2,JET:3}[p.vehicleClass]??1) as 0|1|2|3} teamColor={p.color} texture={textures[i]} physics={{size:p.size,wheels:state.wheels[i] as CarWheel[]}}/>
  </group>;})}
 </>;
}
export function ReplayVideo({replay:r,title,audio,finish}:ReplayProps){
 const frame=useCurrentFrame(),{width,height,fps}=useVideoConfig();if(!r||!finish)return <AbsoluteFill style={{background:'#13222b',color:'white',fontSize:70,justifyContent:'center',alignItems:'center'}}>Select a saved Racecraft car simulation</AbsoluteFill>;
 const t=Math.max(0,Math.min(r.duration,frame/fps-2)),state=sampleReplay(r,t),end=frame/fps>=r.duration+2;
 const order=[...r.participants.keys()].sort((a,b)=>{const A=r.standings.find(s=>s.id===r.participants[a].id)!,B=r.standings.find(s=>s.id===r.participants[b].id)!;const af=A.status==='finished'&&t>=A.time,bf=B.status==='finished'&&t>=B.time;return af&&bf?A.time-B.time:af?-1:bf?1:state.telemetry[b].u-state.telemetry[a].u;});
 const event=[...r.events].reverse().find(e=>e.time<=t&&t-e.time<1.8&&e.status==='eliminated');
 const panel={background:'rgba(10,23,32,.88)',border:'2px solid #ffffff22',borderRadius:18};
 return <AbsoluteFill style={{background:'#182837',color:'#f4f9ff',fontFamily:'Arial, sans-serif'}}>
  <ThreeCanvas width={width} height={height} dpr={1} shadows gl={{antialias:true,alpha:false}} camera={{near:.05,far:1000}}><World r={r} t={t} finish={finish}/></ThreeCanvas>
  {audio&&<Html5Audio src={staticFile(audio)}/>}
  <div style={{position:'absolute',top:65,left:85,right:85,display:'flex',justifyContent:'space-between',alignItems:'start'}}><div><div style={{fontSize:30,letterSpacing:8,color:'#74e2c6',fontWeight:700}}>MARBLE FORMULA · RACECRAFT</div><div style={{fontSize:62,fontWeight:800,marginTop:14}}>{title}</div><div style={{fontSize:30,marginTop:14,color:'#c5d5df'}}>CAR PHYSICS REVIEW · NATIVE 4K / 60 FPS</div></div><div style={{...panel,padding:'24px 38px',fontSize:44,fontVariantNumeric:'tabular-nums'}}>{frame<120?'GRID CHECK':end?'RESULTS':`${t.toFixed(2)} s`}</div></div>
  {!end&&<div style={{position:'absolute',left:85,top:340,width:520,...panel,padding:24}}>{order.map((i,k)=>{const p=r.participants[i],res=r.standings.find(s=>s.id===p.id)!;return <div key={p.id} style={{display:'flex',gap:20,alignItems:'center',fontSize:33,padding:'16px 8px',opacity:t>res.time&&res.status==='eliminated'?.45:1}}><span style={{width:36}}>{k+1}</span><span style={{width:10,height:36,background:p.color}}/><strong style={{width:78}}>{p.id}</strong><span style={{fontSize:27}}>{t>=res.time?res.status==='finished'?'FINISHED':'ELIMINATED':`${(state.telemetry[i].speed*3.6).toFixed(0)} km/h`}</span></div>;})}</div>}
  {event&&!end&&<div style={{position:'absolute',bottom:195,left:'30%',...panel,padding:'24px 44px',fontSize:40,borderColor:'#ed9b5b'}}>CHECKPOINT · {event.participantId} ELIMINATED</div>}
  {end&&<div style={{position:'absolute',top:400,left:'23%',width:'54%',...panel,padding:65}}><div style={{fontSize:56,fontWeight:800,marginBottom:32}}>RACE COMPLETE</div>{r.standings.map((s,i)=><div key={s.id} style={{display:'flex',fontSize:37,padding:'20px 0',borderTop:'1px solid #ffffff22',gap:30}}><strong style={{color:s.color,width:140}}>{i+1} · {s.id}</strong><span style={{flex:1}}>{s.status==='finished'?'FINISHED':`ELIMINATED · CP ${s.checkpoints}`}</span><span>{s.time.toFixed(3)} s</span></div>)}</div>}
  <div style={{position:'absolute',bottom:60,left:85,right:85,display:'flex',justifyContent:'space-between',fontSize:28,color:'#c4d6e1'}}><span>3 CHECKPOINTS · {r.participants.length} → {r.gates.map(g=>g.quota).join(' → ')} SURVIVE</span><span>REVIEW COPY · {r.engine} · {r.snapshotHash.slice(0,10)}</span></div>
 </AbsoluteFill>;
}
export const ReplayComposition=()=> <Composition id="Racecraft-Cars-4K" component={ReplayVideo} width={3840} height={2160} fps={60} durationInFrames={180} defaultProps={{replay:null,title:'Car physics lab'}} calculateMetadata={({props})=>({durationInFrames:props.replay?replayFrames(props.replay):180})}/>;
