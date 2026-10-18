import { AbsoluteFill, interpolate, spring } from "remotion";
import { project, type Shot } from "./camera";
import {
  finalOrder,
  finishedBy,
  finishSeconds,
  fps,
  marblePose,
  marbles,
  raceSeconds,
  ranking,
  rowSlots,
  seed,
  timeline,
  winner,
  winnerFrame,
  type Layout,
  type Section,
} from "./race";

// 2D layer drawn over the 3D canvas. Everything animates from the frame number
// via Remotion's spring()/interpolate(); nothing here keeps its own clock.

const font = "'SF Pro Display', 'Inter', system-ui, sans-serif";
const panel = "rgba(10,12,20,0.72)";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type OverlayProps = {
  frame: number;
  t: number;
  section: Section;
  shot: Shot;
  layout: Layout;
  width: number;
  height: number;
};

const runnerUp = finalOrder[1];
const margin = (marbles[runnerUp].finishFrame! - winnerFrame) / fps;

export function Overlay(p: OverlayProps) {
  const s = Math.min(p.width, p.height) / 1080; // type scale
  const raceF = Math.round(p.t);
  const inRace = p.section === "race";
  // Board slides in at "GO" (keeps the intro shot clean) and fades before the replay.
  const boardIn = spring({ frame: p.frame - timeline.raceStart, fps, config: { damping: 18 } });
  const boardOut = interpolate(p.frame, [timeline.replay.at - 10, timeline.replay.at], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ fontFamily: font, color: "white" }}>
      {inRace && <RankTags {...p} s={s} f={raceF} />}
      {p.section !== "results" && (
        <div style={{ opacity: boardIn * boardOut, transform: `translateX(${(1 - boardIn) * -60 * s}px)` }}>
          <Leaderboard f={raceF} s={p.layout === "portrait" ? s * 0.9 : s} />
        </div>
      )}
      {inRace && <Clock f={raceF} s={s} />}
      {p.section === "replay" && <ReplayBadge frame={p.frame} s={s} />}
      {inRace && <TitleCard frame={p.frame} s={s} />}
      {inRace && p.frame < timeline.raceStart + 15 && <Countdown frame={p.frame} s={s} />}
      {inRace && <WinnerBanner f={raceF} s={s} layout={p.layout} />}
      {p.section === "replay" && <PhotoFinish frame={p.frame} s={s} />}
      {p.section === "results" && <Results frame={p.frame} s={s} layout={p.layout} />}
      <Flash frame={p.frame} at={timeline.replay.at} />
      <Flash frame={p.frame} at={timeline.results.at} />
    </AbsoluteFill>
  );
}

function TitleCard({ frame, s }: { frame: number; s: number }) {
  const inn = spring({ frame, fps, config: { damping: 18 } });
  const out = interpolate(frame, [timeline.raceStart - 5, timeline.raceStart + 10], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        bottom: 70 * s,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity: inn * out,
        transform: `translateY(${(1 - inn) * 30 * s}px)`,
        textShadow: "0 6px 30px rgba(0,0,0,0.6)",
      }}
    >
      <div style={{ fontSize: 30 * s, fontWeight: 700, letterSpacing: 8 * s, opacity: 0.7 }}>
        RACE #{seed} · 8 MARBLES · 4 RAMPS
      </div>
      <div style={{ fontSize: 96 * s, fontWeight: 900, letterSpacing: -2 * s }}>The Zigzag Tower</div>
    </div>
  );
}

function Countdown({ frame, s }: { frame: number; s: number }) {
  const step = Math.floor(frame / fps); // 0,1,2 → "3","2","1"; 3 → "GO!"
  const local = frame - step * fps;
  const label = step < 3 ? String(3 - step) : "GO!";
  const pop = spring({ frame: local, fps, config: { damping: 11, stiffness: 200 } });
  const fade =
    step === 3
      ? interpolate(local, [0, 14], [1, 0], clamp)
      : interpolate(local, [fps - 6, fps], [1, 0.2], clamp);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontWeight: 900,
          fontSize: 260 * s,
          color: step === 3 ? "#ffc53d" : "white",
          opacity: fade,
          transform: `scale(${0.3 + pop * 0.7})`,
          textShadow: "0 10px 50px rgba(0,0,0,0.55)",
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
}

function Leaderboard({ f, s }: { f: number; s: number }) {
  const ROW = 50 * s;
  return (
    <div
      style={{
        position: "absolute",
        top: 44 * s,
        left: 44 * s,
        width: 360 * s,
        height: marbles.length * ROW + 24 * s,
        borderRadius: 22 * s,
        background: panel,
        backdropFilter: "blur(8px)",
      }}
    >
      {marbles.map((m, i) => {
        const done = finishedBy(i, f);
        const slot = rowSlots[f][i];
        return (
          <div
            key={m.name}
            style={{
              position: "absolute",
              left: 22 * s,
              right: 22 * s,
              top: 12 * s + slot * ROW,
              height: ROW,
              display: "flex",
              alignItems: "center",
              gap: 14 * s,
              fontSize: 26 * s,
              fontWeight: 600,
            }}
          >
            <span style={{ width: 26 * s, opacity: 0.5, fontVariantNumeric: "tabular-nums" }}>
              {Math.round(slot) + 1}
            </span>
            <span
              style={{
                width: 22 * s,
                height: 22 * s,
                borderRadius: 11 * s,
                background: m.color,
                boxShadow: `0 0 ${12 * s}px ${m.color}88`,
              }}
            />
            <span style={{ flex: 1 }}>{m.name}</span>
            {done && (
              <span style={{ fontSize: 22 * s, fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>
                {finishSeconds(i)!.toFixed(2)}s
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Clock({ f, s }: { f: number; s: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 44 * s,
        right: 44 * s,
        padding: `${10 * s}px ${22 * s}px`,
        borderRadius: 18 * s,
        background: panel,
        fontSize: 44 * s,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {raceSeconds(f).toFixed(2)}
    </div>
  );
}

/** Rank badges floating above the three leading marbles. */
function RankTags({ f, t, shot, width, height, s, frame }: OverlayProps & { f: number; s: number }) {
  if (frame < timeline.raceStart + 10) return null;
  const order = ranking(f).filter((i) => !finishedBy(i, f));
  return (
    <>
      {order.slice(0, 3).map((i, k) => {
        const { pos } = marblePose(i, t);
        const pt = project(shot, pos, width, height);
        if (!pt.visible) return null;
        const size = 40 * s;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: pt.x - size / 2,
              top: pt.y - size - 34 * s,
              width: size,
              height: size,
              borderRadius: size / 2,
              background: marbles[i].color,
              border: `${3 * s}px solid white`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22 * s,
              fontWeight: 900,
              color: "#111",
              boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
            }}
          >
            {k + 1}
          </div>
        );
      })}
    </>
  );
}

function WinnerBanner({ f, s, layout }: { f: number; s: number; layout: Layout }) {
  if (f < winnerFrame) return null;
  const k = spring({ frame: f - winnerFrame, fps, config: { damping: 13 } });
  const m = marbles[winner];
  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: (layout === "portrait" ? 220 : 80) * s }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 24 * s,
          padding: `${16 * s}px ${48 * s}px`,
          borderRadius: 28 * s,
          background: m.color,
          color: "#111",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          transform: `translateY(${(1 - k) * 300 * s}px) scale(${0.8 + k * 0.2})`,
        }}
      >
        <span style={{ fontSize: 92 * s, fontWeight: 900 }}>{m.name} wins!</span>
        <span style={{ fontSize: 40 * s, fontWeight: 700, opacity: 0.7 }}>{finishSeconds(winner)!.toFixed(2)}s</span>
      </div>
    </AbsoluteFill>
  );
}

function ReplayBadge({ frame, s }: { frame: number; s: number }) {
  const blink = Math.floor(frame / 15) % 2 === 0;
  return (
    <div
      style={{
        position: "absolute",
        top: 44 * s,
        right: 44 * s,
        display: "flex",
        alignItems: "center",
        gap: 14 * s,
        padding: `${12 * s}px ${24 * s}px`,
        borderRadius: 18 * s,
        background: panel,
        fontSize: 34 * s,
        fontWeight: 800,
        letterSpacing: 4 * s,
      }}
    >
      <span
        style={{ width: 18 * s, height: 18 * s, borderRadius: 9 * s, background: "#e5484d", opacity: blink ? 1 : 0.25 }}
      />
      REPLAY
      <span style={{ opacity: 0.55, letterSpacing: 0 }}>{timeline.replay.speed}×</span>
    </div>
  );
}

function PhotoFinish({ frame, s }: { frame: number; s: number }) {
  const local = frame - timeline.replay.at - 12;
  if (local < 0) return null;
  const k = spring({ frame: local, fps, config: { damping: 16 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 60 * s,
        bottom: 80 * s,
        padding: `${18 * s}px ${30 * s}px`,
        borderRadius: 22 * s,
        background: panel,
        borderLeft: `${10 * s}px solid ${marbles[winner].color}`,
        opacity: k,
        transform: `translateX(${(1 - k) * -80 * s}px)`,
      }}
    >
      <div style={{ fontSize: 24 * s, fontWeight: 800, letterSpacing: 6 * s, opacity: 0.6 }}>
        {margin < 0.5 ? "PHOTO FINISH" : "THE WINNING MOMENT"}
      </div>
      <div style={{ fontSize: 50 * s, fontWeight: 800 }}>
        {marbles[winner].name} edges {marbles[runnerUp].name} by {margin.toFixed(2)}s
      </div>
    </div>
  );
}

function Results({ frame, s, layout }: { frame: number; s: number; layout: Layout }) {
  const local = frame - timeline.results.at;
  const card = spring({ frame: local, fps, config: { damping: 18 } });
  const podium = [finalOrder[1], finalOrder[0], finalOrder[2]];
  const heights = [190, 260, 150];
  const portrait = layout === "portrait";
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background: `rgba(6,8,14,${0.55 * card})`,
      }}
    >
      <div
        style={{
          width: (portrait ? 940 : 1100) * s,
          padding: 48 * s,
          borderRadius: 36 * s,
          background: "rgba(16,19,30,0.92)",
          boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
          opacity: card,
          transform: `translateY(${(1 - card) * 60 * s}px)`,
        }}
      >
        <div style={{ fontSize: 26 * s, fontWeight: 800, letterSpacing: 8 * s, opacity: 0.55, textAlign: "center" }}>
          FINAL RESULTS · RACE #{seed}
        </div>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 24 * s, marginTop: 36 * s }}>
          {podium.map((i, k) => {
            const place = k === 1 ? 1 : k === 0 ? 2 : 3;
            const rise = spring({ frame: local - 8 - (3 - place) * 6, fps, config: { damping: 14 } });
            return (
              <div key={i} style={{ width: 230 * s, textAlign: "center" }}>
                <div
                  style={{
                    width: 84 * s,
                    height: 84 * s,
                    margin: "0 auto",
                    borderRadius: 42 * s,
                    background: marbles[i].color,
                    boxShadow: `0 0 ${40 * s}px ${marbles[i].color}aa`,
                    transform: `scale(${rise})`,
                  }}
                />
                <div style={{ fontSize: 36 * s, fontWeight: 800, marginTop: 14 * s }}>{marbles[i].name}</div>
                <div style={{ fontSize: 24 * s, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
                  {finishSeconds(i)!.toFixed(2)}s
                </div>
                <div
                  style={{
                    height: heights[k] * s * rise,
                    marginTop: 14 * s,
                    borderRadius: `${16 * s}px ${16 * s}px 0 0`,
                    background: place === 1 ? "#ffc53d" : place === 2 ? "#c9ced8" : "#c98d52",
                    display: "flex",
                    justifyContent: "center",
                    paddingTop: 12 * s,
                    fontSize: 64 * s,
                    fontWeight: 900,
                    color: "#111",
                    overflow: "hidden",
                  }}
                >
                  {place}
                </div>
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: portrait ? "1fr" : "1fr 1fr",
            columnGap: 40 * s,
            rowGap: 10 * s,
            marginTop: 32 * s,
          }}
        >
          {finalOrder.slice(3).map((i, k) => {
            const inn = spring({ frame: local - 30 - k * 4, fps, config: { damping: 18 } });
            const time = finishSeconds(i);
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16 * s,
                  fontSize: 28 * s,
                  fontWeight: 600,
                  opacity: inn,
                  transform: `translateX(${(1 - inn) * 30 * s}px)`,
                }}
              >
                <span style={{ width: 30 * s, opacity: 0.5 }}>{k + 4}</span>
                <span style={{ width: 20 * s, height: 20 * s, borderRadius: 10 * s, background: marbles[i].color }} />
                <span style={{ flex: 1 }}>{marbles[i].name}</span>
                <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
                  {time === null ? "DNF" : `+${(time - finishSeconds(winner)!).toFixed(2)}s`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** White flash that hides a hard cut between sections. */
function Flash({ frame, at }: { frame: number; at: number }) {
  const o = interpolate(frame, [at - 3, at, at + 10], [0, 0.85, 0], clamp);
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: "white", opacity: o }} />;
}
