import { getInputProps } from "remotion";

// Render quality knobs, overridable per render with --props:
//   dpr   supersampling: the canvas renders at dpr× the video size and is downsampled (2 = 4× the pixels)
//   blur  motion-blur sub-frames per video frame (1 = no motion blur)
// e.g. npx remotion render GP-r1-monaco out.mp4 --props='{"dpr":1.5,"blur":2}'
export function quality() {
  const p = getInputProps() as { dpr?: number; blur?: number };
  // 1.5× and 2 sub-frames: twice as fast as 2×/3 and the same in stills (QUALITY-REVIEW.md, D).
  return { dpr: p.dpr ?? 1.5, blur: p.blur ?? 2 };
}
