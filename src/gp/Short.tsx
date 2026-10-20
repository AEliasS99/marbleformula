import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame } from "remotion";
import { GrandPrix } from "./GrandPrix";
import { getRace } from "./race";
import { shortRange } from "./short-range";

// The vertical Short: the final lap to the results card, with a title chip.
export const GrandPrixShort = ({ id }: { id: string }) => {
  const race = getRace(id);
  const { offset } = shortRange(race.data as unknown as Parameters<typeof shortRange>[0]);
  const f = useCurrentFrame();
  const fps = race.fps;
  const inn = spring({ frame: f - 4, fps, config: { damping: 15 } });
  const out = interpolate(f, [fps * 3, fps * 3.5], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const info = race.data.info as { title: string };
  const round = (race.data as { round?: number }).round ?? 1;
  return (
    <AbsoluteFill style={{ backgroundColor: "#111216" }}>
      <Sequence from={-offset}>
        <GrandPrix id={id} layout="portrait" />
      </Sequence>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: inn * out, pointerEvents: "none" }}>
        <div style={{ textAlign: "center", fontFamily: "'Avenir Next', 'Montserrat', system-ui, sans-serif", color: "#fff", textShadow: "0 6px 30px rgba(0,0,0,0.6)", transform: `scale(${0.8 + 0.2 * inn})` }}>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 6 }}>{`MFC 2027 · ROUND ${round}`}</div>
          <div style={{ fontSize: 76, fontWeight: 900, marginTop: 10 }}>{info.title.toUpperCase()}</div>
          <div style={{ display: "inline-block", marginTop: 24, background: "#ffcc00", color: "#111216", fontSize: 64, fontWeight: 900, padding: "8px 28px", borderRadius: 16 }}>FINAL LAP</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
