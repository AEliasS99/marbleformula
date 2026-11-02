import {Color,Vector3} from 'three';
// Existing machine surfaces only. Local, frame-independent coordinates keep
// grain attached to each component through camera cuts and animated transforms.
export function applyMachineSurface(shader,kind,size,scanned=false){
 shader.uniforms.machineExtent={value:new Vector3(...size)};
 shader.uniforms.machineBrass={value:new Color('#ad8544')};
 shader.uniforms.machineTimber={value:new Color('#93613a')};
 shader.uniforms.machineWarning={value:new Color('#d5b04e')};
 shader.vertexShader='varying vec3 vMachineLocal;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMachineLocal=position;');
 shader.fragmentShader=`varying vec3 vMachineLocal;uniform vec3 machineExtent,machineBrass,machineTimber,machineWarning;
 float machineHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
 float machineNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(machineHash(i),machineHash(i+vec3(1,0,0)),f.x),mix(machineHash(i+vec3(0,1,0)),machineHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(machineHash(i+vec3(0,0,1)),machineHash(i+vec3(1,0,1)),f.x),mix(machineHash(i+vec3(0,1,1)),machineHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 `+shader.fragmentShader;
 const profile=kind==='fin'?`
 float machineMetal=max(smoothstep(.43,.46,abs(q.x)),smoothstep(.36,.40,abs(q.y)));
 float machineRubber=0.;
 vec3 grainP=vMachineLocal*vec3(1.1,35.,9.);
 float machineHazard=smoothstep(.37,.39,abs(q.x))*(1.-smoothstep(.43,.45,abs(q.x)));
 `:`
 float machineMetal=smoothstep(.29,.32,abs(q.y));
 float machineRubber=1.-smoothstep(.11,.15,abs(q.y));
 vec3 grainP=vMachineLocal*vec3(28.,1.4,28.);
 float machineHazard=0.;
 `;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 vec3 q=vMachineLocal/machineExtent;
 float footprint=max(length(dFdx(vMachineLocal)),length(dFdy(vMachineLocal)));
 float fineFade=1.-smoothstep(.008,.035,footprint);
 ${profile}
 float grain=machineNoise(grainP+vec3(machineNoise(grainP*.18)*1.7));
 float fibers=sin(grainP.y*5.+grainP.z*3.+grain*5.)*fineFade;
 ${scanned?'vec3 timber=diffuseColor.rgb;':'vec3 timber=machineTimber*(.68+.49*grain+.045*fibers);'}
 float tooling=sin(vMachineLocal.y*620.)*fineFade;
 vec3 brass=machineBrass*(.94+.045*tooling+.055*machineNoise(vMachineLocal*18.));
 diffuseColor.rgb=mix(timber,brass,machineMetal);
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.025,.029,.026),machineRubber);
 float stripe=smoothstep(.44,.56,fract((vMachineLocal.x+vMachineLocal.y)*8.));
 diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.025),machineWarning,stripe),machineHazard);
 `);
 shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix('+(scanned?'clamp(roughnessFactor,.42,.88)':'.57')+',.31,machineMetal);roughnessFactor=mix(roughnessFactor,.85,machineRubber);');
 shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=machineMetal*.78*(1.-machineRubber);');
 if(scanned)shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','vec3 machineUnmappedNormal=normal;\n#include <normal_fragment_maps>\nnormal=normalize(mix(normal,machineUnmappedNormal,max(machineMetal,machineRubber)));');
}
