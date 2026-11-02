import {surfaceHeight} from './trackMesh.js';
export const CONTACT_FLOW_PROFILE='contact-flow-v2';

// Equal endpoints do not mean a ball was stationary: an orbit or a machine
// can bring it back around. Inspect the entire interval before flagging a jam.
export function marbleStationaryWindow(frames,index,from,to,current,maxSpread=.45){
 const lo=[...current],hi=[...current];
 for(let f=from;f<=to;f++)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],frames[f][index][k]);hi[k]=Math.max(hi[k],frames[f][index][k]);}
 return Math.hypot(...hi.map((v,k)=>v-lo[k]))<maxSpread;
}

// Force only where the rendered pad physically exists and the sphere touches
// its floor. A flying marble or another lane must never get remote thrust.
export function marblePadAcceleration({pad,frame,position,velocity,radius,dt}){
 if(!(dt>0)||frame.gap)return 0;
 const rel=position.map((v,k)=>v-frame.p[k]);
 const dot=(a,b)=>a.reduce((n,x,k)=>n+x*b[k],0);
 const lat=dot(rel,frame.r),height=dot(rel,frame.n)-surfaceHeight(lat,frame.w);
 const half=pad.width/2;
 if(frame.u<pad.u0||frame.u>pad.u1||Math.abs(lat-(pad.latCenter??0))>half||height<radius-.1||height>radius+.1||dot(velocity,frame.n)>2)return 0;
 const speed=dot(velocity,frame.t),ramp=Math.max(0,Math.min(1,(frame.u-pad.u0)/.35,(pad.u1-frame.u)/.35));
 return Math.max(0,Math.min(pad.accel*ramp,(pad.target-speed)/dt));
}
