import {Effect,BlendFunction} from 'postprocessing';
import {SRGBColorSpace,Uniform} from 'three';

// The stock contrast curve pushes dark channels below zero. The following
// soft-light grain evaluates sqrt(channel), producing NaNs and magenta patches
// on saturated red flag paint. Preserve the grade within display gamut before
// grain or any fractional-power colour-space conversion sees its result.
export const boundedContrastShader=`uniform float contrast;
void mainImage(const in vec4 inputColor,const in vec2 uv,out vec4 outputColor){
 vec3 color=inputColor.rgb-vec3(0.5);
 color=contrast>0.0?color/vec3(1.0-contrast):color*vec3(1.0+contrast);
 outputColor=vec4(clamp(color+vec3(0.5),0.0,1.0),inputColor.a);
}`;
export class BoundedContrastEffect extends Effect{
 constructor(contrast=0){
  super('BoundedContrastEffect',boundedContrastShader,{blendFunction:BlendFunction.SRC,uniforms:new Map([['contrast',new Uniform(contrast)]])});
  this.inputColorSpace=SRGBColorSpace;
 }
}
