import { Composition, Folder } from "remotion";
import { GrandPrix } from "./gp/GrandPrix";
import { GrandPrixShort } from "./gp/Short";
import { shortRange } from "./gp/short-range";
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
            durationInFrames={r.timeline.total + ((r as { intro?: { total: number } }).intro?.total ?? 0)}
            fps={r.fps}
            width={1920}
            height={1080}
            defaultProps={{ id: r.id, layout: "landscape" as const }}
          />
          {/* 4K: YouTube gives 4K uploads a far higher bitrate, so even 1080p viewers see a sharper picture.
              Render it with {"dpr":1}: the same pixel count as 1080p at dpr 2. */}
          <Composition
            id={`GP-${r.id}-4k`}
            component={GrandPrix}
            durationInFrames={r.timeline.total + ((r as { intro?: { total: number } }).intro?.total ?? 0)}
            fps={r.fps}
            width={3840}
            height={2160}
            defaultProps={{ id: r.id, layout: "landscape" as const }}
          />
          {/* The Short: final lap to results, 9:16 (scripts/factory.mjs renders it with every round). */}
          <Composition
            id={`GP-${r.id}-short`}
            component={GrandPrixShort}
            durationInFrames={shortRange(r as unknown as Parameters<typeof shortRange>[0]).frames}
            fps={r.fps}
            width={1080}
            height={1920}
            defaultProps={{ id: r.id }}
          />
          <Composition
            id={`GP-${r.id}-vertical`}
            component={GrandPrix}
            durationInFrames={r.timeline.total + ((r as { intro?: { total: number } }).intro?.total ?? 0)}
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
