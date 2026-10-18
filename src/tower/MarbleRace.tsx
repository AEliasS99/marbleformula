import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Html5Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { cameraFor } from "./camera";
import { Overlay } from "./Overlay";
import { simAt, type Layout } from "./race";
import { CameraRig, Confetti, Course, Environment, Marbles, Movers, Sun } from "./Scene";

// Physics is baked by scripts/simulate.mjs and every animation here is a pure
// function of the frame number. Never use Motion/rAF/clock-based animation in
// this tree: Remotion renders frames in parallel and out of order.

export const MarbleRace = ({ layout }: { layout: Layout }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { section, t } = simAt(frame);
  const shot = cameraFor(layout)(frame);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0e16" }}>
      <ThreeCanvas width={width} height={height} shadows gl={{ antialias: true }} camera={{ near: 0.1, far: 400 }}>
        <color attach="background" args={["#0b0e16"]} />
        <fog attach="fog" args={["#0b0e16", 45, 140]} />
        <Environment />
        <hemisphereLight args={["#c8d8ff", "#1a1420", 0.5]} />
        <Sun target={shot.target} />
        <CameraRig shot={shot} />
        <Course />
        <Movers t={t} />
        <Marbles t={t} />
        <Confetti t={t} />
      </ThreeCanvas>
      <Overlay frame={frame} t={t} section={section} shot={shot} layout={layout} width={width} height={height} />
      <Html5Audio src={staticFile("race.wav")} />
    </AbsoluteFill>
  );
};
