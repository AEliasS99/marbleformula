import { ThreeCanvas } from "@remotion/three";
import type { Layout, Race, View } from "./race";
import { Decals, Lifts, TimingGate, TrackDetails } from "./Details";
import { Trackside } from "./Trackside";
import { Machines } from "./Machines";
import { Effects } from "./Effects";
import { CameraRig, Circuit, Confetti, Environment, Gantries, Gate, Marbles, Obstacles, STUDIO, Sun } from "./Scene";
import { ViewContext } from "./view";
import { quality } from "./quality";

// The circuit and everything on it, seen through one View (a clock and a camera).

export function Stage({ race, view, layout, frame, width, height }: { race: Race; view: View; layout: Layout; frame: number; width: number; height: number }) {
  const t = view.tAt(frame);
  const shot = view.shotAt(frame);
  return (
    <ViewContext.Provider value={view}>
      {/* dpr 2 (default): rendered at twice the resolution and downsampled — supersampled edges, no jaggies. */}
      <ThreeCanvas width={width} height={height} dpr={quality().dpr} shadows="variance" gl={{ antialias: true, alpha: false }}>
        <ViewContext.Provider value={view}>
          <fog attach="fog" args={[STUDIO.fog, 220, 1400]} />
          <Environment />
          <hemisphereLight args={["#bfd8f5", "#5a7a3c", 0.22]} />
          <Sun target={shot.target} />
          <CameraRig race={race} layout={layout} frame={frame} />
          <Circuit race={race} />
          <TrackDetails race={race} />
          <Decals race={race} />
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
        </ViewContext.Provider>
      </ThreeCanvas>
    </ViewContext.Provider>
  );
}
