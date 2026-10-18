import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Html5Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Overlay } from "./Overlay";
import { getRace, type Layout } from "./race";
import { Decals, Lifts, TimingGate, TrackDetails, Tunnels } from "./Details";
import { Trackside } from "./Trackside";
import { Machines } from "./Machines";
import { Effects } from "./Effects";
import { CameraRig, Circuit, Confetti, Environment, Gantries, Gate, Marbles, Obstacles, STUDIO, Sun } from "./Scene";

// One round of the Marble Grand Prix. The race, camera direction and sound are
// all baked by scripts/season.mjs; this only looks them up by frame.

export const GrandPrix = ({ id, layout }: { id: string; layout: Layout }) => {
  const race = getRace(id);
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { section, t } = race.simAt(frame);
  const shot = race.shotAt(frame);

  return (
    <AbsoluteFill style={{ backgroundColor: STUDIO.background }}>
      {/* dpr 2: rendered at twice the resolution and downsampled — supersampled edges, no jaggies. */}
      <ThreeCanvas width={width} height={height} dpr={2} shadows="variance" gl={{ antialias: true, alpha: false }}>
        <fog attach="fog" args={[STUDIO.fog, 220, 1400]} />
        <Environment />
        <hemisphereLight args={["#bfd8f5", "#5a7a3c", 0.35]} />
        <Sun target={shot.target} />
        <CameraRig race={race} layout={layout} frame={frame} />
        <Circuit race={race} />
        <TrackDetails race={race} />
        <Decals race={race} />
        <Tunnels race={race} />
        <TimingGate race={race} />
        <Trackside race={race} />
        <Obstacles race={race} t={t} />
        <Machines race={race} t={t} />
        <Lifts race={race} t={t} />
        <Gantries race={race} frame={Math.round(t)} />
        <Gate race={race} t={t} />
        <Marbles race={race} t={t} />
        <Confetti race={race} t={t} />
        <Effects race={race} layout={layout} frame={frame} />
      </ThreeCanvas>
      <Overlay race={race} frame={frame} t={t} section={section} shot={shot} layout={layout} width={width} height={height} />
      <Html5Audio src={staticFile(`gp/${id}.wav`)} />
    </AbsoluteFill>
  );
};
