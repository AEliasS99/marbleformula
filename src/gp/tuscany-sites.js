import {sceneryLayout} from './scenery-layout.js';
import {regionalRelief} from './regional-relief.js';
export const TUSCAN_VENUE_PROFILE='tuscany-venue-v3';
export const tuscanVenue=data=>data?.info?.sceneryProfile===TUSCAN_VENUE_PROFILE;
// The exact existing settlement footprint, shared by terrain grading and art.
export function tuscanSettlementSites(samples){
 const layout=sceneryLayout(samples),relief=regionalRelief(samples);
 const clear=b=>samples.every(s=>Math.hypot(s.p[0]-b.x,s.p[2]-b.z)>Math.max(28,b.scale*20)+(s.w??2.1));
 return [
  ...[...layout.props.filter((b,i)=>i%2===0&&clear(b)),...layout.ring.filter((_,i)=>i%3===0)].map(p=>({...p,scale:p.scale,halfX:7.5,halfZ:6.25,kind:'town'})),
  ...relief.plots.map(p=>({...p,scale:1,halfX:4.25,halfZ:4.4,kind:'farm'})),
 ];
}
