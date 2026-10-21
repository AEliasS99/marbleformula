import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame } from "remotion";
import { GrandPrix } from "./GrandPrix";
import { getRace } from "./race";
import { shortRange } from "./short-range";

// The vertical Short: the final lap to the results card, with a title chip.
// `season` (optional, passed by scripts/factory.mjs) puts the season in the chip,
// so every season's Shorts differ: "MFC 2027 · SEASON 3 · ROUND 1".
export const GrandPrixShort = ({ id, season }: { id: string; season?: number }) => {
  const race = getRace(id);
  const { offset } = shortRange(race.data as unknown as Parameters<typeof shortRange>[0]);
  const f = useCurrentFrame();
  const fps = race.fps;
  const inn = spring({ frame: f - 4, fps, config: { damping: 15 } });
  const out = interpolate(f, [fps * 3, fps * 3.5], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const info = race.data.info as { title: string };
  const round = (race.data as { round?: number }).round ?? 1;
  const chip = season ? `MFC 2027 · SEASON ${season} · ROUND ${round}` : `MFC 2027 · ROUND ${round}`;
  return (
    <AbsoluteFill style={{ backgroundColor: "#111216" }}>
      <Sequence from={-offset}>
        <GrandPrix id={id} layout="portrait" fadeInFrom={offset} />
      </Sequence>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 736, opacity: inn * out, pointerEvents: "none" }}>
        <div
          style={{
            textAlign: "center",
            fontFamily: "'Avenir Next', 'Montserrat', system-ui, sans-serif",
            color: "#fff",
            background: "rgba(17, 18, 22, 0.88)",
            backdropFilter: "blur(14px)",
            border: "1.5px solid rgba(255, 204, 0, 0.45)",
            borderRadius: 24,
            padding: "16px 34px 20px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
            transform: `translateY(${(1 - inn) * 24}px) scale(${0.88 + 0.12 * inn})`,
          }}
        >
          <div style={{ fontSize: season ? 26 : 28, fontWeight: 800, letterSpacing: 5, color: "#ffcc00", whiteSpace: "nowrap" }}>{chip}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginTop: 10 }}>
            <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -1, whiteSpace: "nowrap" }}>{info.title.toUpperCase()}</div>
            <div style={{ background: "#ffcc00", color: "#111216", fontSize: 38, fontWeight: 900, padding: "6px 20px", borderRadius: 12, letterSpacing: 1, whiteSpace: "nowrap" }}>FINAL LAP</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
