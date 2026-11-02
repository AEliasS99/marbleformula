// One rounded, bevelled safety-island envelope for physics, rendering and QA.
// Legacy rectangular islands keep their original behaviour in saved races.
export function islandFootprint(length,width,steps=12){
 const radius=width/2,centre=Math.max(0,(length-width)/2),points=[];
 for(const side of [1,-1])for(let k=0;k<=steps;k++){
  const angle=-Math.PI/2+k*Math.PI/steps+(side===1?0:Math.PI);
  points.push([side*centre+Math.cos(angle)*radius,Math.sin(angle)*radius]);
 }
 return points;
}

export function islandMeshData([length,height,width]){
 const rings=[[length,width,-height/2],[length-.02,width-.02,-height/2+.06],[length-.22,width-.18,height/2]];
 const vertices=rings.flatMap(([l,w,y])=>islandFootprint(l,w).flatMap(([x,z])=>[x,y,z]));
 const n=vertices.length/9,indices=[];
 for(let ring=0;ring<2;ring++)for(let k=0;k<n;k++){
  const next=(k+1)%n,a=ring*n+k,b=ring*n+next,c=(ring+1)*n+k,d=(ring+1)*n+next;
  indices.push(a,c,b,b,c,d);
 }
 for(let k=1;k<n-1;k++){indices.push(0,k,k+1);indices.push(2*n,2*n+k+1,2*n+k);}
 return {vertices,indices};
}

// SAT against the complete road-axis chassis envelope, including its yaw.
// Rounded noses give a glancing normal instead of an invisible square corner.
export function islandContact(gate,along,lateral,car){
 if(gate.profile!=='soft-island'){
  const x=car.length+gate.length/2-Math.abs(along),z=car.width+gate.width/2-Math.abs(lateral-gate.lat);
  if(x<=0||z<=0)return null;
  return z<x?{depth:z,along:0,across:Math.sign(lateral-gate.lat)||-1}:{depth:x,along:Math.sign(along)||-1,across:0};
 }
 const polygon=islandFootprint(gate.length,gate.width),axes=[[1,0],[0,1]];
 for(let k=0;k<polygon.length;k++){
  const a=polygon[k],b=polygon[(k+1)%polygon.length],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);
  if(l>1e-9)axes.push([-dz/l,dx/l]);
 }
 let best=null;
 for(const [x,z]of axes){
  const projections=polygon.map(p=>p[0]*x+p[1]*z),lo=Math.min(...projections),hi=Math.max(...projections);
  const centre=along*x+(lateral-gate.lat)*z,radius=car.length*Math.abs(x)+car.width*Math.abs(z);
  const plus=hi-(centre-radius),minus=centre+radius-lo;
  if(plus<=0||minus<=0)return null;
  const sign=plus<minus?1:-1,depth=Math.min(plus,minus);
  if(!best||depth<best.depth)best={depth,along:x*sign,across:z*sign};
 }
 return best;
}
