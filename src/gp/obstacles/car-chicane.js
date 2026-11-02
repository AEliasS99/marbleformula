import {pointOnTrack,frameQuat,quatArr,r3} from './kit.js';
import {islandMeshData} from '../car-island.js';

export default {
  type:'car-chicane',label:'ALPINE CHICANE',place:{before:12,after:5,maxCurv:.025},dq:false,
  card:{difficulty:3,chaos:3,seconds:1,summary:'Choose a clear route around the physical safety island.'},
  build(f,{frameAt,statics}) {
    if(process.env.GP_CARS!=='1')return;
    const s=frameAt(f.u),height=f.height??.5;
    const size=[f.length,height,f.width],soft=f.profile==='soft-island';
    statics.push({kind:'car-chicane',shape:soft?'convex':'box',u:f.u,lat:f.lat,
      pos:pointOnTrack(s,f.lat,height/2).map(r3),quat:quatArr(frameQuat(s)),
      size,...(soft?{profile:f.profile,vertices:islandMeshData(size).vertices}:{}),restitution:soft?.02:.1});
  },
};
