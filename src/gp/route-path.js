// Saved route offsets in the existing road frame. Shared by physical carriers,
// picture, and supported-surface audio; no actor steering or position changes.
export function routeOffset(points,u){
 const x=Math.max(points[0][0],Math.min(points.at(-1)[0],u));
 let i=0;while(i<points.length-2&&points[i+1][0]<x)i++;
 const a=points[i],b=points[i+1],t=(x-a[0])/(b[0]-a[0]);
 return [a[1]+(b[1]-a[1])*t,(a[2]??0)+((b[2]??0)-(a[2]??0))*t];
}
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function liftFrameAt(lift,u,baseFrameAt){
 if(!lift.path)return baseFrameAt(u);
 const point=x=>{const s=baseFrameAt(x),[lat,h]=routeOffset(lift.path.points,x-lift.path.u0);return s.p.map((v,k)=>v+s.r[k]*lat+s.n[k]*h);};
 const s=baseFrameAt(u),a=point(u-.2),b=point(u+.2),t=unit(b.map((v,k)=>v-a[k]));
 const n=unit(cross(s.r,t)),r=unit(cross(t,n));
 return {...s,p:point(u),t,n,r,w:lift.half};
}
