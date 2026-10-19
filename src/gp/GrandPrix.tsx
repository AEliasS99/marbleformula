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

export const GrandPrix = ({ id, layout }: { id: string; layout: Layout }) => {
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
        <Intro race={race} layout={layout} frame={video} width={width} height={height} />
        {audio}
      </AbsoluteFill>
    );
  const { section, t } = race.simAt(frame);
  const shot = race.shotAt(frame);
  const split = race.splitAt(frame);
  const side = layout === "landscape";
  const half = side ? { width: width / 2, height } : { width, height: height / 2 };
  const gap = 4; // a thin dark seam between the halves

  return (
    <AbsoluteFill style={{ backgroundColor: "#111216" }}>
      {split ? (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, width: half.width - (side ? gap / 2 : 0), height: half.height - (side ? 0 : gap / 2), overflow: "hidden" }}>
            <Stage race={race} view={race.mainView} layout={layout} frame={frame} width={half.width} height={half.height} />
          </div>
          <div style={{ position: "absolute", left: side ? half.width + gap / 2 : 0, top: side ? 0 : half.height + gap / 2, width: half.width - (side ? gap / 2 : 0), height: half.height - (side ? 0 : gap / 2), overflow: "hidden" }}>
            <Stage race={race} view={race.splitView(split)} layout={layout} frame={frame} width={half.width} height={half.height} />
          </div>
        </>
      ) : (
        <Stage race={race} view={race.mainView} layout={layout} frame={frame} width={width} height={height} />
      )}
      <Overlay race={race} frame={frame} t={t} section={section} shot={shot} layout={layout} width={width} height={height} split={split} />
      {audio}
    </AbsoluteFill>
  );
};
