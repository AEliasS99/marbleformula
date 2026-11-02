// World-space, frame-independent surface variation. Derivative filtering fades
// fine frequencies at a distance rather than making them sparkle between frames.
export function applyRealismSurface(shader,kind='stone'){
 if(shader.vertexShader.includes('vRealismSurface'))return;
 shader.vertexShader='varying vec3 vRealismSurface;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRealismSurface=(modelMatrix*vec4(position,1.0)).xyz;');
 shader.fragmentShader=`varying vec3 vRealismSurface;
 float realismHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
 float realismNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(realismHash(i),realismHash(i+vec3(1,0,0)),f.x),mix(realismHash(i+vec3(0,1,0)),realismHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(realismHash(i+vec3(0,0,1)),realismHash(i+vec3(1,0,1)),f.x),mix(realismHash(i+vec3(0,1,1)),realismHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 `+shader.fragmentShader;
 const ground=kind==='ground';
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float surfaceBroad=realismNoise(vRealismSurface*${ground?'0.065':'0.55'});
 float surfaceFootprint=max(length(dFdx(vRealismSurface)),length(dFdy(vRealismSurface)));
 float surfaceFine=(realismNoise(vRealismSurface*${ground?'3.0':'9.0'})-.5)*(1.0-smoothstep(${ground?'0.06,0.55':'0.025,0.18'},surfaceFootprint));
 diffuseColor.rgb*=mix(${ground?'0.66,1.14':'0.87,1.10'},surfaceBroad)+surfaceFine*${ground?'0.14':'0.07'};
 `);
 shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(surfaceBroad-.5)*.08,.12,1.0);`);
}
