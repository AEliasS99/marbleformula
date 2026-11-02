// Preserve the authored Times Square buildings; renderer and camera QA share dimensions.
import {sceneryLayout} from './scenery-layout.js';
export function newYorkBuildings(layout){
 return [...layout.ring,...layout.props.filter((_,i)=>i%2===0)].map((b,i)=>({
  ...b,totalH:Math.max(13,b.y+(11+(i%4)*5)*b.scale-b.groundY),
  w:(5.2+(i%3)*2)*b.scale,
 }));
}
export function newYorkScenery(samples){
 return newYorkBuildings(sceneryLayout(samples)).map(b=>({...b,parts:[
  {kind:'box',pos:[0,b.totalH*.5,0],size:[b.w,b.totalH,b.w],category:'newyork-tower'},
  {kind:'box',pos:[0,b.totalH+1.8,0],size:[b.w*.65,3.6,b.w*.65],category:'newyork-setback'},
  {kind:'frustum',pos:[0,b.totalH+5.8,0],size:[.12,.5,5.2,8],category:'newyork-spire'},
  {kind:'box',pos:[0,Math.max(4,b.totalH-4.2),b.w/2+.22],size:[b.w*.94,b.w*.52,.002],category:'newyork-billboard'},
  {kind:'box',pos:[0,Math.max(2,b.totalH-8.8),b.w/2+.22],size:[b.w*.88,b.w*.44,.002],category:'newyork-billboard'},
 ]}));
}
