import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  BloomEffect,
  BlendFunction,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  Pass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from "postprocessing";
import { N8AOPostPass } from "n8ao";
import type { Layout, Race } from "./race";
import { subframe } from "./subframe";

// Camera-like finishing, the cues that make a render read as a photograph of a
// small real object: ambient occlusion in every crease and contact, highlights
// that bloom slightly, a macro lens' shallow depth of field focused on the
// pack, a soft vignette, a touch of sensor grain — and motion blur, by
// rendering each frame at several moments inside a 180° shutter and averaging.
//
// The composer is driven by hand from a priority-1 useFrame (the React
// wrapper's lifecycle doesn't line up with how Remotion advances frames, and
// rendered nothing): we size it to the drawing buffer and render it ourselves.

/** Sub-frames per video frame, and the shutter as a fraction of the frame interval. */
export const MOTION_BLUR = { samples: 3, shutter: 0.35 };

/**
 * Final pass: adds each sub-frame into a float accumulation buffer with weight
 * 1/N, and on the last one writes the average to the screen (encoding to sRGB,
 * which the effect pass before it skips when it isn't the one on screen).
 */
class AccumulatePass extends Pass {
  accum: THREE.WebGLRenderTarget;
  addMat: THREE.ShaderMaterial;
  copyMat: THREE.ShaderMaterial;
  weight = 1;
  flush = true;

  constructor() {
    super("AccumulatePass");
    this.needsSwap = false;
    this.accum = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false });
    const vertexShader = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
    this.addMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, weight: { value: 1 } },
      vertexShader,
      fragmentShader: "uniform sampler2D tDiffuse; uniform float weight; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv) * weight; }",
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader,
      fragmentShader:
        "uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0);\n#include <colorspace_fragment>\n}",
      depthTest: false,
      depthWrite: false,
    });
  }

  setSize(width: number, height: number) {
    this.accum.setSize(width, height);
  }

  clear(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(this.accum);
    renderer.clear(true, false, false);
  }

  render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget) {
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    this.addMat.uniforms.tDiffuse.value = inputBuffer.texture;
    this.addMat.uniforms.weight.value = this.weight;
    this.fullscreenMaterial = this.addMat;
    renderer.setRenderTarget(this.accum);
    renderer.render(this.scene, this.camera);
    if (this.flush) {
      this.copyMat.uniforms.tDiffuse.value = this.accum.texture;
      this.fullscreenMaterial = this.copyMat;
      renderer.setRenderTarget(null);
      renderer.render(this.scene, this.camera);
    }
    renderer.autoClear = autoClear;
  }
}

/**
 * Remotion renders a frame by calling R3F's advance() from an effect that runs
 * before the composer has its size and passes. The first frame a tab renders
 * (and every still) would come out blank, so render once more on mount.
 */
function RenderOnceComposerIsReady() {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    advance(performance.now());
  }, [advance]);
  return null;
}

export function Effects({ race, layout, frame }: { race: Race; layout: Layout; frame: number }) {
  void layout;
  return (
    <>
      <EffectChain race={race} frame={frame} />
      <RenderOnceComposerIsReady />
    </>
  );
}

function EffectChain({ race, frame }: { race: Race; frame: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  const chain = useMemo(() => {
    const composer = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType, multisampling: 0 } /* dpr 2 already supersamples */);
    composer.addPass(new RenderPass(scene, camera));
    const ao = new N8AOPostPass(scene, camera, 1920, 1080);
    // Tight and strong: contact shadows under the marbles and in every seam.
    ao.configuration.aoRadius = 0.45;
    ao.configuration.distanceFalloff = 1.0;
    ao.configuration.intensity = 4;
    ao.configuration.color = new THREE.Color("#1a1c24");
    ao.configuration.gammaCorrection = false; // the final pass converts to sRGB; doing it twice washes everything out
    ao.setQualityMode("High");
    composer.addPass(ao);
    // Sharp within a few units of the pack; the foreground and the far track soften.
    // Gentle: the pack and its surroundings stay crisp; only far background softens.
    const dof = new DepthOfFieldEffect(camera, { worldFocusRange: 6, bokehScale: 1.1, height: 720 });
    // The set is white: only true specular glints (well above diffuse white) may bloom.
    // With a bright studio the white track sits near 1.0: only real glints, well above it, may bloom.
    const bloom = new BloomEffect({ mipmapBlur: true, intensity: 0.25, luminanceThreshold: 2.6, luminanceSmoothing: 0.3 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.42 });
    const noise = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SOFT_LIGHT });
    noise.blendMode.opacity.value = 0.025;
    composer.addPass(new EffectPass(camera, dof));
    composer.addPass(new EffectPass(camera, bloom, tone, vignette, noise));
    const accumulate = new AccumulatePass();
    composer.addPass(accumulate);
    return { composer, dof, ao, accumulate };
  }, [gl, scene, camera]);

  useEffect(() => () => chain.composer.dispose(), [chain]);

  useFrame(() => {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const pr = gl.getPixelRatio();
    chain.composer.setSize(size.x / pr, size.y / pr, false);
    chain.accumulate.setSize(size.x, size.y);
    chain.accumulate.clear(gl);
    const { samples, shutter } = MOTION_BLUR;
    chain.accumulate.weight = 1 / samples;
    for (let k = 0; k < samples; k++) {
      const vf = frame + shutter * ((k + 0.5) / samples - 0.5);
      subframe.apply(vf);
      const shot = race.shotAt(vf);
      chain.dof.target = new THREE.Vector3(...shot.target);
      chain.accumulate.flush = k === samples - 1;
      chain.composer.render();
    }
  }, 1);

  return null;
}
