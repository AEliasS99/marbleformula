import {Vector4,Color} from 'three';
// Per-part physical coordinates survive mesh merging, so timber grain follows
// each beam rather than a single arbitrary world direction. Derivative-faded
// detail is deterministic for arbitrary native/segmented render seek order.
export function applyVenueSurface(shader,kind){
 shader.vertexShader='attribute vec3 sceneryLocal;\nattribute vec2 scenerySurface;\nvarying vec3 vVenueLocal;\nvarying vec2 vVenueSurface;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvVenueLocal=sceneryLocal;vVenueSurface=scenerySurface;');
 shader.fragmentShader=`varying vec3 vVenueLocal;varying vec2 vVenueSurface;
 float venueHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
 float venueNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(venueHash(i),venueHash(i+vec3(1,0,0)),f.x),mix(venueHash(i+vec3(0,1,0)),venueHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(venueHash(i+vec3(0,0,1)),venueHash(i+vec3(1,0,1)),f.x),mix(venueHash(i+vec3(0,1,1)),venueHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 `+shader.fragmentShader;
 const common=`float venueFootprint=max(length(dFdx(vVenueLocal)),length(dFdy(vVenueLocal)));float venueBroad=venueNoise(vVenueLocal*.7);`;
 const wood=`float grain=venueNoise(vVenueLocal*vec3(.18,13.,13.));float phase=vVenueLocal.y*75.+vVenueLocal.z*19.+grain*6.;float grainFade=1.-smoothstep(.02,.12,venueFootprint);float streak=sin(phase)*grainFade;diffuseColor.rgb*=mix(.67,1.18,grain)*(.97+.045*streak);`;
 const stone=`vec2 st=vVenueSurface;float row=floor(st.y/.32);vec2 cell=vec2((st.x+mod(row,2.)*.43)/.86,st.y/.32);vec2 edge=min(fract(cell),1.-fract(cell));vec2 aa=max(fwidth(cell),vec2(.008));float mortar=(1.-smoothstep(.018,.018+aa.x,edge.x))+(1.-smoothstep(.025,.025+aa.y,edge.y));float joints=min(1.,mortar)*(1.-smoothstep(.08,.25,venueFootprint));diffuseColor.rgb*=mix(.90,1.08,venueHash(vec3(floor(cell),2.)))*(1.-joints*.20);`;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\n${common}\n${kind==='wood'?wood:kind==='stone'?stone:'diffuseColor.rgb*=mix(.93,1.06,venueBroad);'}`);
 shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(venueBroad-.5)*.08,.15,1.);');
}

// Cultivated earth follows the actual vineyard plots. World coordinates make
// rows stable across camera cuts and align them with the planted trellises.
export function applyVineyardGround(shader,plots){
 if(!plots.length)return;
 shader.uniforms.venueFields={value:plots.map(p=>new Vector4(p.x,p.z,5.3,7.0))};
 shader.uniforms.venueEarth={value:new Color('#796543')};
 shader.fragmentShader=`uniform vec4 venueFields[${plots.length}];uniform vec3 venueEarth;\n`+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float fieldMask=0.;float rowMask=0.;
 for(int field=0;field<${plots.length};field++){
  vec2 q=vRealismSurface.xz-venueFields[field].xy;
  float edge=max(abs(q.x)-venueFields[field].z,abs(q.y)-venueFields[field].w);
  float marginNoise=realismNoise(vRealismSurface*.6)*.35;
  float mask=1.-smoothstep(-.2,.85,edge+marginNoise);
  float rowDistance=abs(fract((q.x+3.9)/2.6+.5)-.5)*2.6;
  float row=1.-smoothstep(.35,.70,rowDistance);
  fieldMask=max(fieldMask,mask);rowMask=max(rowMask,mask*row);
 }
 diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.76,fieldMask*.32);
 diffuseColor.rgb=mix(diffuseColor.rgb,venueEarth,rowMask*.72);
 `);
}
