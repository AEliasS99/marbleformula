import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Overlay } from "./Overlay";
import { getRace, type Layout } from "./race";
import { Stage } from "./Stage";
import { Intro } from "./Intro";

// One round of the Marble Formula Championship. The race, camera direction and
// sound are all baked by scripts/season.mjs; this only looks them up by frame.
// At split moments (see `splits` in the bake) the picture is two canvases:
// P1 live on the left (top, in portrait), and on the right a slow-motion
// replay, the lift tower, or action elsewhere, each with its own clock.

export const GrandPrix = ({ id, layout, clean = false }: { id: string; layout: Layout; clean?: boolean }) => {
  const race = getRace(id);
  const video = useCurrentFrame();
  const { width, height } = useVideoConfig();
  // The intro plays first; the race's frame 0 follows it.
  const I = race.intro?.total ?? 0;
  const frame = video - I;
  const audio = (
    <>
      {I > 0 && (
        <Sequence durationInFrames={I + race.fps} layout="none">
          <Html5Audio src={staticFile(`gp/${id}-intro.wav`)} />
        </Sequence>
      )}
      <Sequence from={I} layout="none">
        <Html5Audio src={staticFile(`gp/${id}.wav`)} />
      </Sequence>
    </>
  );
  if (frame < 0)
    return (
      <AbsoluteFill style={{ backgroundColor: "#111216" }}>
        {audio}
        <Intro race={race} layout={layout} frame={video} width={width} height={height} />
      </AbsoluteFill>
    );
  const { section, t } = race.simAt(frame);
  const shot = race.shotAt(frame);
  const split = race.splitAt(frame);
  const side = layout === "landscape";
  const half = side ? { width: width / 2, height } : { width, height: height / 2 };
  const gap = 4; // a thin dark seam between the halves
  // The pane each canvas shows through: the canvas is half the picture, the pane a seam narrower.
  const pane = { width: half.width - (side ? gap / 2 : 0), height: half.height - (side ? 0 : gap / 2) };
  const main = split ? half : { width, height };

  return (
    <AbsoluteFill style={{ backgroundColor: "#111216" }}>
      {audio}
      {/* The main canvas (the whole picture, or the left/top half of a split) is always this same element
          in this same place: a split only resizes it. Remounting it rebuilt the whole WebGL scene (and its
          GPU memory) at every split's start and end. Only the right half's canvas comes and goes. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: split ? pane.width : width, height: split ? pane.height : height, overflow: "hidden" }}>
        <Stage race={race} view={race.mainView} layout={layout} frame={frame} width={main.width} height={main.height} />
      </div>
      {split && (
        <div style={{ position: "absolute", left: side ? half.width + gap / 2 : 0, top: side ? 0 : half.height + gap / 2, width: pane.width, height: pane.height, overflow: "hidden" }}>
          {/* Keyed per split: back-to-back splits each get a fresh canvas and their own view (camera and clock). */}
          <Stage key={`${split.kind}-${split.start}`} race={race} view={race.splitView(split)} layout={layout} frame={frame} width={half.width} height={half.height} />
        </div>
      )}
      {!clean && <Overlay race={race} frame={frame} t={t} section={section} shot={shot} layout={layout} width={width} height={height} split={split} />}
    </AbsoluteFill>
  );
};
