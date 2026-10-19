import { getInputProps } from "remotion";

// Render quality knobs, overridable per render with --props:
//   dpr   supersampling: the canvas renders at dpr× the video size and is downsampled (2 = 4× the pixels)
//   blur  motion-blur sub-frames per video frame (1 = no motion blur)
// e.g. npx remotion render GP-r1-monaco out.mp4 --props='{"dpr":1.5,"blur":2}'
export function quality() {
  const p = getInputProps() as { dpr?: number; blur?: number };
  return { dpr: p.dpr ?? 2, blur: p.blur ?? 3 };
}
