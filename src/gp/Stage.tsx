import { useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import type { Layout, Race, View } from "./race";
import { Decals, Lifts, TimingGate, TrackDetails } from "./Details";
import { Trackside } from "./Trackside";
import { Machines } from "./Machines";
import { Effects } from "./Effects";
import { CameraRig, Circuit, Confetti, Environment, Gantries, Gate, ImpactSparks, Marbles, Obstacles, STUDIO, Sun } from "./Scene";
import { ViewContext } from "./view";
import { createSubframe, SubframeContext } from "./subframe";
import { quality } from "./quality";
import { isNight } from "./look";
import { Hoops, Neon } from "./Neon";
import { Boosters, DistributorFlap } from "./Boosts";
import { getCircuitTheme, WorldScenery } from "./Themes";

// The circuit and everything on it, seen through one View (a clock and a camera).

export function Stage({ race, view, layout, frame, width, height }: { race: Race; view: View; layout: Layout; frame: number; width: number; height: number }) {
  const t = view.tAt(frame);
  const shot = view.shotAt(frame);
  const theme = getCircuitTheme(race);
  // This canvas's own motion-blur sub-frame registry (src/gp/subframe.ts).
  const sub = useMemo(() => createSubframe(), []);
  return (
    <ViewContext.Provider value={view}>
      {/* dpr 2 (default): rendered at twice the resolution and downsampled — supersampled edges, no jaggies.
          The scene is drawn only into the effect composer's own render targets (src/gp/Effects.tsx); the
          canvas's drawing buffer just receives the finished picture as one full-screen copy. So it needs no
          multisampling, depth or stencil of its own (at 4K, MSAA alone cost ~265 MB per canvas). */}
      <ThreeCanvas width={width} height={height} dpr={quality().dpr} shadows="variance" gl={{ antialias: false, alpha: false, depth: false, stencil: false }}>
        <ViewContext.Provider value={view}>
          <SubframeContext.Provider value={sub}>
            <fog attach="fog" args={isNight() ? [theme.fogColor, theme.fogNear, theme.fogFar] : [STUDIO.fog, 220, 1400]} />
            <Environment race={race} />
            <hemisphereLight args={isNight() ? [theme.hemiSkyColor, theme.hemiGroundColor, theme.hemiIntensity] : ["#bfd8f5", "#5a7a3c", 0.22]} />
            <Sun target={shot.target} pos={shot.pos} race={race} />
            <CameraRig race={race} layout={layout} frame={frame} />
            <Circuit race={race} />
            <TrackDetails race={race} />
            <Decals race={race} />
            <TimingGate race={race} />
            {isNight() && <Neon race={race} />}
            <Trackside race={race} />
            <WorldScenery race={race} />
            <Obstacles race={race} t={t} />
            <Machines race={race} t={t} />
            <Boosters race={race} t={t} />
            <Hoops race={race} />
            <DistributorFlap race={race} t={t} />
            <Lifts race={race} t={t} />
            <Gantries race={race} frame={Math.round(t)} />
            <Gate race={race} t={t} />
            <Marbles race={race} t={t} />
            <ImpactSparks race={race} t={t} />
            <Confetti race={race} t={t} />
            {/* Keep <Effects> the LAST child. On mount it renders the canvas once more from a passive effect,
                and React runs a parent's children's effects in order: only as the last child does that render
                come after every sibling's effects (their sub-frame updaters registered, StairBay's platforms
                placed). Anywhere earlier, a canvas's first frame (every still, and the first frame of every
                split screen) would be drawn with part of the scene not yet in place. */}
            <Effects race={race} frame={frame} />
          </SubframeContext.Provider>
        </ViewContext.Provider>
      </ThreeCanvas>
    </ViewContext.Provider>
  );
}
