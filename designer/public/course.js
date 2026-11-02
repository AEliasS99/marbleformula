// Geometry shared by the editor, Rapier and replay. All lengths are metres.
import {CatmullRomCurve3,Vector3} from 'three';
import {buildTrackMesh} from '../../src/gp/trackMesh.js';
import {vortexSoup} from '../../src/gp/vortex.js';
export const surfaceTypes=new Set(['vortex','jump','drop','bumps','crest','tube']);
export const typeOf=a=>a?.custom?(a.physicsType||a.shape):a?.id;
const V=a=>new Vector3(...a),mod=(x,n)=>(x%n+n)%n,clamp=x=>Math.max(0,Math.min(1,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export function baseGeometry(p){
 const curve=new CatmullRomCurve3(p.points.map(q=>new Vector3(q.x,q.y,q.z)),true,'centripetal',.5);curve.arcLengthDivisions=2400;curve.updateArcLengths();const length=curve.getLength();
 const count=Math.max(100,Math.min(7200,Math.ceil(length/.25)));
 function frameAt(u){const t=mod(u,length)/length,point=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize(),right=new Vector3().crossVectors(tangent,new Vector3(0,1,0)).normalize(),normal=new Vector3().crossVectors(right,tangent).normalize();return {u,p:point.toArray(),t:tangent.toArray(),r:right.toArray(),n:normal.toArray(),w:p.width/2,curv:0};}
 if(!Number.isFinite(length)||length<20||length>1800)return {curve,length,count:0,samples:[],frameAt:null};
 const samples=Array.from({length:count+1},(_,i)=>frameAt(i*length/count));
 for(let i=0;i<=count;i++)samples[i].curv=V(samples[(i+1)%count].t).sub(V(samples[mod(i-1,count)].t)).dot(V(samples[i].r))/(2*length/count);
 return {curve,length,count,samples,frameAt};
}
export function courseFeatures(p,assets,base=baseGeometry(p)){
 if(!base.frameAt)return [];
 const maxRadius=Math.max(.275,...p.participants.filter(r=>r.enabled).map(r=>.55*r.size));
 return p.elements.map(e=>{const asset=assets.find(a=>a.id===e.assetId),type=typeOf(asset),scale=e.scale*(asset?.scale||1),u=e.at*base.length;const f={...e,type,scale,u,color:asset?.color||'#e5a847'};
  if(type==='vortex'){
   const s=base.frameAt(u),radius=Math.max(4.2*scale,p.width*.72),hole=1.25*scale,k=4*scale*scale,depth=k*(1/hole-1/radius),entryZ=radius*.58,entryX=-Math.sqrt(radius**2-entryZ**2);
   const forward=V(s.t).setY(0).normalize(),right=new Vector3().crossVectors(forward,new Vector3(0,1,0));
   const center=V(s.p).addScaledVector(right,e.offset).toArray();
   f.bowl={u,center,fwd:forward.toArray(),radius,hole,k,depth,lip:Math.max(1.15*scale,maxRadius*1.5),throat:.4*scale,entryLo:entryZ-p.width/2-.1,entryHi:entryZ+p.width/2+.1,chute:{x0:entryX-.05,z:entryZ+p.width/2+.05,zEnd:radius+.04}};
   f.entryX=entryX;f.entryZ=entryZ;f.start=u-radius-9*scale;f.entry=u-radius;f.resume=u-1.4*scale;f.end=u+radius+18*scale;
   f.lowerY=center[1]-depth-.4*scale-1.4*maxRadius-.5*scale;
  }else if(type==='jump'){f.start=u-5*scale;f.end=u+11*scale;f.gap=[u,u+2.5*scale];}
  else if(type==='drop'){f.start=u-1*scale;f.end=u+10*scale;f.gap=[u,u+.5*scale];}
  else if(type==='crest'){f.start=u-4*scale;f.end=u+4*scale;}
  else if(type==='bumps'){f.start=u;f.end=u+6*scale;}
  else if(type==='tube'){f.start=u-3*scale;f.end=u+5*scale;}
  return f;
 });
}
export function buildCourse(p,assets,{meshes=true}={}){
 const base=baseGeometry(p),features=courseFeatures(p,assets,base),surface=features.filter(f=>surfaceTypes.has(f.type)&&f.type!=='tube');
 if(!base.frameAt)return {...base,base,features,extra:[],mesh:null};
 function position(u){u=mod(u,base.length);const s=base.frameAt(u);let point=V(s.p),gap=false,width=p.width/2;
  for(const f of surface){if(u<f.start||u>f.end)continue;const x=(u-f.u)/f.scale;
   if(f.type==='vortex'){
    const v=f.bowl,forward=V(v.fwd),right=new Vector3().crossVectors(forward,new Vector3(0,1,0)),center=V(v.center);
    const entrance=center.clone().addScaledVector(forward,f.entryX).addScaledVector(right,f.entryZ);
    const lower=center.clone().addScaledVector(forward,-1.4*f.scale);lower.y=f.lowerY;
    if(u<=f.entry){const t=(u-f.start)/(f.entry-f.start),start=V(base.frameAt(f.start).p),end=entrance;
     // Cubic Hermite approach: joins the authored path and enters the bowl tangentially.
     const t2=t*t,t3=t2*t,span=f.entry-f.start;
     const tangentIn=V(base.frameAt(f.start).t).multiplyScalar(span),tangentOut=forward.clone().multiplyScalar(span);
     point=start.multiplyScalar(2*t3-3*t2+1).addScaledVector(tangentIn,t3-2*t2+t).addScaledVector(end,-2*t3+3*t2).addScaledVector(tangentOut,t3-t2);
    }else if(u<f.resume){gap=true;point=entrance.clone().lerp(lower,(u-f.entry)/(f.resume-f.entry));}
    else {const t=smooth((u-f.resume)/(f.end-f.resume)),local=V(base.frameAt(u).p);point=local;point.y=f.lowerY+(local.y-f.lowerY)*t;point.addScaledVector(right,f.offset*(1-t));}
   }else if(f.type==='jump'){
    let h=x<=0?1.5*f.scale*((x+5)/5)**2:x>=2.5?-.7*f.scale*(1-smooth((x-2.5)/8.5)):1.5*f.scale;
    point.y+=h;gap=u>f.gap[0]&&u<f.gap[1];
   }else if(f.type==='drop'){if(x>=0)point.y-=1.2*f.scale*(1-smooth((x-.5)/9.5));gap=u>f.gap[0]&&u<f.gap[1];}
   else if(f.type==='crest')point.y+=f.scale*Math.sin(Math.PI*(x+4)/8)**2;
   else if(f.type==='bumps')point.y+=.17*f.scale*Math.sin(Math.PI*x)**2;
  }
  return {point,gap,width};
 }
 function frameAt(u){const pos=position(u),before=position(u-.03),after=position(u+.03),t=(before.gap||after.gap||pos.gap)?V(base.frameAt(u).t):after.point.clone().sub(before.point).normalize(),r=new Vector3().crossVectors(t,new Vector3(0,1,0)).normalize(),n=new Vector3().crossVectors(r,t).normalize();return {u,p:pos.point.toArray(),t:t.toArray(),r:r.toArray(),n:n.toArray(),w:pos.width,curv:0,gap:pos.gap};}
 const samples=Array.from({length:base.count+1},(_,i)=>frameAt(i*base.length/base.count));
 for(let i=0;i<=base.count;i++){const s=samples[i];s.curv=base.samples[i].curv;}
 const extra=[];
 if(meshes)for(const f of features){
  if(f.type==='vortex')for(const [part,friction] of [['floor',.25],['walls',0]]){const soup=vortexSoup(f.bowl,part);extra.push({elementId:f.id,kind:f.type,color:f.color,friction,...soup});}
  if(f.type==='tube'){
   const vertices=[],indices=[],steps=Math.max(8,Math.ceil((f.end-f.start)/.25)),arcs=24,radius=p.width*f.scale/2;
   for(let i=0;i<=steps;i++){const s=frameAt(f.start+(f.end-f.start)*i/steps);for(let j=0;j<=arcs;j++){const a=Math.PI*j/arcs;vertices.push(...V(s.p).addScaledVector(V(s.r),Math.cos(a)*radius).addScaledVector(V(s.n),Math.sin(a)*radius).toArray());}}
   for(let i=0;i<steps;i++)for(let j=0;j<arcs;j++){const a=i*(arcs+1)+j,b=a+arcs+1;indices.push(a,b,a+1,a+1,b,b+1);}
   extra.push({elementId:f.id,kind:f.type,color:f.color,friction:.3,vertices:new Float32Array(vertices),indices:new Uint32Array(indices)});
  }
 }
 return {...base,base,features,samples,frameAt,extra,mesh:meshes?buildTrackMesh(samples,{endCaps:false,strictGaps:true,wallHeight:p.wallHeight??.58}):null};
}
