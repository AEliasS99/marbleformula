import { Config } from "@remotion/cli/config";

// WebGL in headless Chrome needs ANGLE for reliable 3D rendering.
Config.setChromiumOpenGlRenderer("angle");
// Frames are captured as JPEG before encoding; the default quality (80) shows
// blocky artefacts on thin coloured stripes. Encode at high quality too.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setCrf(16);
// One tab: the GPU is the bottleneck anyway, and several tabs each holding a
// 2× canvas plus half-float effect buffers made Chrome emit garbled
// (tiled) frames now and then.
Config.setConcurrency(1);
