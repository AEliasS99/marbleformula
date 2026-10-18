import { Composition, Folder } from "remotion";
import { GrandPrix } from "./gp/GrandPrix";
import { rounds } from "./gp/race";
import { MarbleRace } from "./tower/MarbleRace";
import { fps, timeline } from "./tower/race";

export const Root = () => (
  <>
    <Folder name="GrandPrix">
      {rounds.map((r) => (
        <Folder key={r.id} name={r.id}>
          <Composition
            id={`GP-${r.id}`}
            component={GrandPrix}
            durationInFrames={r.timeline.total}
            fps={r.fps}
            width={1920}
            height={1080}
            defaultProps={{ id: r.id, layout: "landscape" as const }}
          />
          <Composition
            id={`GP-${r.id}-vertical`}
            component={GrandPrix}
            durationInFrames={r.timeline.total}
            fps={r.fps}
            width={1080}
            height={1920}
            defaultProps={{ id: r.id, layout: "portrait" as const }}
          />
        </Folder>
      ))}
    </Folder>
    <Folder name="ZigzagTower">
      <Composition
        id="MarbleRace"
        component={MarbleRace}
        durationInFrames={timeline.total}
        fps={fps}
        width={1920}
        height={1080}
        defaultProps={{ layout: "landscape" as const }}
      />
      {/* 9:16 for Shorts / Reels / TikTok. */}
      <Composition
        id="MarbleRaceVertical"
        component={MarbleRace}
        durationInFrames={timeline.total}
        fps={fps}
        width={1080}
        height={1920}
        defaultProps={{ layout: "portrait" as const }}
      />
    </Folder>
  </>
);
