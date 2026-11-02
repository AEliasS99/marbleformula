// Extend the established Mediterranean village/terrain recipe; geometry is
// shared by the renderer and live/replay occlusion, including lavender/olives.
import {italianScenery,ITALY_MATERIALS} from './italy-scenery.js';
export const FRANCE_MATERIALS={...ITALY_MATERIALS,
 limestone:{color:'#c9bc9f',roughness:.95},cream:{color:'#e5d6b9',roughness:.93},
 ochre:{color:'#c9a782',roughness:.94},shutter:{color:'#66899c',roughness:.87},
 hill:{color:'#93916a',roughness:1},soil:{color:'#a49574',roughness:1},
 cypress:{color:'#718064',roughness:.97},vine:{color:'#65785c',roughness:.97},
 lavender:{color:'#8a71a7',roughness:.96},blue:{color:'#244c91',roughness:.85},
 red:{color:'#c83d46',roughness:.85},
};
export const frenchScenery=samples=>italianScenery(samples,{profile:'provence'});
