import { AbsoluteFill, interpolate, spring } from "remotion";
import { lensFov, project, type Highlight, type Layout, type Race, type Section, type Shot, type Split, type Vec3 } from "./race";
import { flagDataUrl } from "./flags";
import { TEAMS, teamOf } from "./teams.js";

// Broadcast graphics in a clean studio style: white cards, heavy black type,
// yellow accents. Everything is driven by the frame number through Remotion's
// spring()/interpolate(); all timings are in seconds (via race.sec) so the
// graphics behave the same at any frame rate.

const font = "'Avenir Next', 'Montserrat', 'Helvetica Neue', system-ui, sans-serif";
const ink = "#111216";
const card = "rgba(255,255,255,0.96)";
const yellow = "#ffcc00";
const shadow = "0 8px 30px rgba(20,24,40,0.18)";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export type OverlayProps = {
  race: Race;
  frame: number;
  t: number;
  section: Section;
  shot: Shot;
  layout: Layout;
  width: number;
  height: number;
  split?: Split | null;
};

const Chip = ({ s, children, bg = yellow, color = ink, size = 26 }: { s: number; children: React.ReactNode; bg?: string; color?: string; size?: number }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10 * s,
      padding: `${6 * s}px ${14 * s}px`,
      borderRadius: 10 * s,
      background: bg,
      color,
      fontSize: size * s,
      fontWeight: 800,
      boxShadow: shadow,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

export function Overlay(p: OverlayProps) {
  const { race, frame, section } = p;
  const s = Math.min(p.width, p.height) / 1080;
  const tl = race.timeline;
  // The simulation frame the graphics read (clamped: every per-frame table below is indexed by it).
  const f = Math.max(0, Math.min(race.lastFrame, Math.round(p.t)));
  const live = section === "race";
  const fps = race.fps;
  const towerIn = spring({ frame: frame - tl.lights[2], fps, config: { damping: 18 } });
  const towerOut = interpolate(frame, [tl.replay.at - race.sec(0.3), tl.replay.at], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ fontFamily: font, color: ink }}>
      {live && !race.intro && frame < tl.lights[2] && <IntroCard {...p} s={s} />}
      {live && frame >= tl.lights[0] - race.sec(0.3) && frame < tl.raceStart + race.sec(1) && <StartLights race={race} frame={frame} s={s} />}
      {live && frame >= tl.lights[1] && frame < tl.raceStart + race.sec(1.2) && <ConstructorPowerCard race={race} frame={frame} s={s} layout={p.layout} />}
      {(section === "race" || section === "replay") && (
        <div style={{ opacity: towerIn * towerOut, transform: `translateX(${(1 - towerIn) * -80 * s}px)` }}>
          <TimingTower race={race} f={f} s={p.layout === "portrait" ? s * 0.92 : s} />
          {!p.split && <MoreBallsTopRightHUD race={race} f={f} s={s} layout={p.layout} />}
        </div>
      )}
      {live && frame >= tl.raceStart && <Minimap {...p} s={s} f={f} />}
      {live && !p.split && <ShotCaption {...p} s={s} f={f} />}
      {live && p.split && <SplitGraphics race={race} split={p.split} f={f} frame={frame} s={s} layout={p.layout} width={p.width} height={p.height} />}
      {live && <Toasts race={race} f={f} s={s} layout={p.layout} />}
      {live && <CheckpointKnockoutToast race={race} f={f} s={s} layout={p.layout} />}
      {live && <FinishBanner race={race} f={f} s={s} layout={p.layout} />}
      {section === "replay" && <ReplayGraphics race={race} frame={frame} s={s} />}
      {section === "results" && <Results race={race} frame={frame} s={s} layout={p.layout} />}
      {section === "standings" && <Standings race={race} frame={frame} s={s} layout={p.layout} />}
      {section === "constructors" && <Constructors race={race} frame={frame} s={s} layout={p.layout} />}
      {[tl.replay.at, tl.results.at, tl.standings.at].map((at) => (
        <Flash key={at} race={race} frame={frame} at={at} />
      ))}
    </AbsoluteFill>
  );
}

/** Circuit outline as an SVG path fitted into a box. */
function outlinePath(outline: number[][], size: number, pad: number) {
  const xs = outline.map((p) => p[0]);
  const zs = outline.map((p) => p[1]);
  const minx = Math.min(...xs);
  const minz = Math.min(...zs);
  const w = Math.max(...xs) - minx;
  const h = Math.max(...zs) - minz;
  const k = (size - 2 * pad) / Math.max(w, h);
  const ox = pad + (size - 2 * pad - w * k) / 2;
  const oz = pad + (size - 2 * pad - h * k) / 2;
  const map = (x: number, z: number) => [ox + (x - minx) * k, oz + (z - minz) * k] as const;
  const d = "M" + outline.map(([x, z]) => map(x, z).map((v) => v.toFixed(1)).join(",")).join("L") + "Z";
  return { d, map };
}

function IntroCard({ race, frame, s, layout }: OverlayProps & { s: number }) {
  const info = race.data.info;
  const isCar = (info as { vehicle?: string })?.vehicle === "car";
  const heatTitle = (info as { heat?: string })?.heat ?? "TCR · TOTAL CONTROL RACING";
  const tl = race.timeline;
  const fps = race.fps;
  const inn = spring({ frame: frame - race.sec(0.1), fps, config: { damping: 16 } });
  const out = interpolate(frame, [tl.lights[2] - race.sec(0.4), tl.lights[2]], [1, 0], clamp);
  const portrait = layout === "portrait";
  const size = (portrait ? 300 : isCar ? 210 : 280) * s;
  const { d } = outlinePath(race.data.outline, size, 16 * s);
  const draw = interpolate(frame, [race.sec(0.2), race.sec(2.3)], [1, 0], clamp);
  const [word1, ...rest] = info.title.toUpperCase().split(" ");
  return (
    <div
      style={{
        position: "absolute",
        left: 60 * s,
        right: portrait ? 60 * s : undefined,
        top: (portrait ? 220 : 60) * s,
        opacity: out,
      }}
    >
      {!isCar && (
        <div style={{ display: "flex", gap: 12 * s, transform: `translateY(${(1 - inn) * -30 * s}px)`, opacity: inn }}>
          <Chip s={s}>ROUND {race.data.round} / {race.data.rounds}</Chip>
          <Chip s={s} bg={card}>
            MARBLE FORMULA CHAMPIONSHIP 2027
          </Chip>
        </div>
      )}
      <div
        style={{
          marginTop: (isCar ? 4 : 14) * s,
          fontSize: (portrait ? 96 : isCar ? 62 : 120) * s,
          fontWeight: 900,
          lineHeight: 0.92,
          letterSpacing: -3 * s,
          color: ink,
          WebkitTextStroke: `${3 * s}px white`,
          paintOrder: "stroke fill",
          textShadow: "0 10px 30px rgba(20,24,40,0.25)",
          transform: `scale(${0.85 + 0.15 * inn})`,
          transformOrigin: "left top",
          opacity: inn,
        }}
      >
        {word1}
        <br />
        {rest.join(" ")}
      </div>
      {!isCar && (
        <div style={{ display: "flex", gap: 12 * s, marginTop: 20 * s, flexWrap: "wrap", opacity: inn }}>
          <Chip s={s} bg={card} size={22}>
            {info.circuit}
          </Chip>
          <Chip s={s} bg={card} size={22}>
            {(info.realLength / 1000).toFixed(3)} km → {info.length.toFixed(0)} m
          </Chip>
          <Chip s={s} bg={card} size={22}>
            {race.data.features.length} OBSTACLES
          </Chip>
        </div>
      )}
      {!portrait && (
        <svg width={size} height={size} style={{ marginTop: 16 * s, background: card, borderRadius: 22 * s, boxShadow: shadow, opacity: inn }}>
          <path d={d} fill="none" stroke={ink} strokeWidth={6 * s} strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={draw} />
        </svg>
      )}
    </div>
  );
}

function StartLights({ race, frame, s }: { race: Race; frame: number; s: number }) {
  const tl = race.timeline;
  const lit = tl.lights.filter((lf) => frame >= lf).length;
  const out = frame >= tl.raceStart;
  const inn = spring({ frame: frame - tl.lights[0] + race.sec(0.3), fps: race.fps, config: { damping: 16 } });
  const gone = interpolate(frame, [tl.raceStart + race.sec(0.5), tl.raceStart + race.sec(1)], [1, 0], clamp);
  return (
    <div style={{ position: "absolute", top: 60 * s, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 * s, opacity: inn * gone, transform: `translateY(${(1 - inn) * -40 * s}px)` }}>
      <div style={{ display: "flex", gap: 14 * s, padding: 16 * s, background: ink, borderRadius: 18 * s, boxShadow: shadow }}>
        {[0, 1, 2, 3, 4].map((k) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", gap: 10 * s, padding: 10 * s, background: "#22242c", borderRadius: 12 * s }}>
            {[0, 1].map((r) => {
              const on = !out && k < lit;
              return (
                <div
                  key={r}
                  style={{
                    width: 50 * s,
                    height: 50 * s,
                    borderRadius: 25 * s,
                    background: on ? "radial-gradient(circle at 40% 35%, #ff8a8a, #ff1a1a 45%, #a30000)" : "#3a1414",
                    boxShadow: on ? `0 0 ${30 * s}px #ff2a2a` : "inset 0 0 8px rgba(0,0,0,0.6)",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {out && (
        <Chip s={s} size={54}>
          GO GO GO!
        </Chip>
      )}
    </div>
  );
}

function PipBar({ val, max = 5, color, s }: { val: number; max?: number; color: string; s: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 1.5 * s, alignItems: "center", marginLeft: 3 * s }}>
      {Array.from({ length: max }, (_, idx) => (
        <span
          key={idx}
          style={{
            width: 4.5 * s,
            height: 7 * s,
            borderRadius: 1.5 * s,
            background: idx < val ? color : "rgba(255,255,255,0.16)",
            boxShadow: idx < val ? `0 0 ${4 * s}px ${color}` : "none",
          }}
        />
      ))}
    </span>
  );
}

function ConstructorPowerCard({ race, frame, s, layout }: { race: Race; frame: number; s: number; layout: Layout }) {
  const isCar = (race.data.info as { vehicle?: string })?.vehicle === "car";
  if (!isCar || layout === "portrait") return null;
  const tl = race.timeline;
  const inn = spring({ frame: frame - 12, fps: race.fps, config: { damping: 16 } });
  const out = interpolate(frame, [tl.raceStart + race.sec(0.4), tl.raceStart + race.sec(1.0)], [1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        bottom: 26 * s,
        right: 26 * s,
        width: 345 * s,
        borderRadius: 14 * s,
        overflow: "hidden",
        background: "rgba(10, 13, 20, 0.86)",
        backdropFilter: "blur(16px)",
        border: `${1.5 * s}px solid rgba(255, 255, 255, 0.18)`,
        boxShadow: "0 16px 38px rgba(0,0,0,0.6)",
        color: "#f4f6fa",
        opacity: inn * out,
        transform: `translateY(${(1 - inn) * 36 * s}px)`,
      }}
    >
      {/* Purely visual icon header — no long sentences to read */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: `${7 * s}px ${14 * s}px`,
          background: "rgba(255,255,255,0.07)",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          fontSize: 13 * s,
          fontWeight: 900,
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.9)", letterSpacing: 1 * s }}>GRID</span>
        <div style={{ display: "flex", gap: 38 * s, paddingRight: 10 * s, fontSize: 14 * s }}>
          <span title="Speed">⚡</span>
          <span title="Stability">🛡️</span>
          <span title="IQ">🧠</span>
        </div>
      </div>
      <div style={{ padding: `${7 * s}px ${10 * s}px`, display: "flex", flexDirection: "column", gap: 5 * s }}>
        {race.marbles.map((m, idx) => {
          const st = (
            m as unknown as {
              stats?: { cls: string; vel: number; est: number; int: number };
            }
          ).stats;
          if (!st) return null;
          return (
            <div
              key={m.abbr}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8 * s,
                padding: `${5 * s}px ${8 * s}px`,
                borderRadius: 8 * s,
                background: "rgba(255,255,255,0.05)",
                borderLeft: `${4 * s}px solid ${m.color}`,
              }}
            >
              <span
                style={{
                  fontSize: 11 * s,
                  fontWeight: 900,
                  color: "rgba(255,255,255,0.7)",
                  width: 14 * s,
                  textAlign: "center",
                }}
              >
                {idx + 1}
              </span>
              <MarbleDot s={s} color={m.color} flag={flagOf(m)} size={18} />
              <span style={{ fontSize: 13 * s, fontWeight: 900, color: "#ffffff", width: 38 * s }}>
                {m.abbr}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 * s, flex: 1, justifyContent: "flex-end" }}>
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <PipBar val={st.vel} color="#ff5252" s={s * 1.15} />
                </span>
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <PipBar val={st.est} color="#69f0ae" s={s * 1.15} />
                </span>
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <PipBar val={st.int} color="#ea80fc" s={s * 1.15} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimingTower({ race, f, s }: { race: Race; f: number; s: number }) {
  const isCar = (race.data.info as { vehicle?: string })?.vehicle === "car";
  const big = race.N > 12; // twenty rows: sleek compact F1/M1 dark glass telemetry tower
  const ROW = (isCar && race.N <= 10 ? 46 : big ? 26 : 34) * s;
  const fs = big ? 15 : 18;
  const tl = race.timeline;
  const started = f >= tl.raceStart;
  const gf = f - (f % race.sec(0.25)); // the gaps refresh a few times a second
  const cps = ((race.data as unknown as { checkpoints?: { index: number; survive: number; closedFrame: number | null; eliminated: number[] }[] }).checkpoints ?? []);
  const activeCp = started ? cps.find((c) => c.closedFrame === null || f < c.closedFrame) : null;
  const cutoff = isCar && race.N <= 6 ? 2 : activeCp?.survive ?? null;

  return (
    <div
      style={{
        position: "absolute",
        top: 28 * s,
        left: 28 * s,
        width: (isCar && race.N <= 10 ? 248 : 244) * s,
        borderRadius: 12 * s,
        overflow: "hidden",
        background: "rgba(14, 16, 22, 0.84)",
        backdropFilter: "blur(12px)",
        border: `${1 * s}px solid rgba(255,255,255,0.14)`,
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        color: "#f4f5f8",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: `${7 * s}px ${12 * s}px`,
          background: isCar ? "rgba(255,255,255,0.08)" : "linear-gradient(90deg, #e10600 0%, #b30500 100%)",
          color: "#ffffff",
          fontSize: 16 * s,
          fontWeight: 900,
          letterSpacing: 0.6 * s,
        }}
      >
        <span style={{ whiteSpace: "nowrap", fontSize: 13 * s, marginRight: 6 * s }}>
          {isCar ? "🏁" : `DON'T BE LAST · ${race.data.info.gp.toUpperCase()}`}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontSize: 14 * s }}>
          {race.LAPS > 1 && started ? (
            <span style={{ fontSize: 12 * s, marginRight: 6 * s, color: "rgba(255,255,255,0.85)" }}>
              L{Math.min(race.LAPS, race.lapOf(race.ranking(f)[0], f) + 1)}/{race.LAPS}
            </span>
          ) : null}
          {started ? race.raceSeconds(f).toFixed(1) : ""}
        </span>
      </div>
      <div style={{ position: "relative", height: race.N * ROW + 6 * s }}>
        {cutoff !== null && cutoff < race.N && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 3 * s + cutoff * ROW - 1.5 * s,
              height: 2.5 * s,
              background: isCar && race.N <= 6 ? "#00e676" : "#ff1744",
              boxShadow: `0 0 ${8 * s}px ${isCar && race.N <= 6 ? "#00e676" : "#ff1744"}`,
              zIndex: 5,
              pointerEvents: "none",
            }}
          />
        )}
        {race.marbles.map((m, i) => {
          const slot = race.rowSlots[f][i];
          const pos = Math.round(slot) + 1;
          const prevSlot = race.rowSlots[Math.max(0, f - race.sec(0.35))][i];
          const gained = started && slot < prevSlot;
          const done = race.finishedBy(i, f);
          let gap = "";
          if (!started) gap = `P${m.grid}`;
          else if (done) gap = pos === 1 ? race.finishSeconds(i)!.toFixed(2) : `+${(race.finishSeconds(i)! - race.finishSeconds(race.winner)!).toFixed(2)}`;
          else if (race.dqBy(i, f)) gap = "OUT";
          else if (pos === 1) gap = "LEAD";
          else gap = `+${race.gapAt(i, gf).toFixed(1)}`;
          const out = race.dqBy(i, f);
          const inQualZone = isCar && race.N <= 6 && pos <= 2 && !out;
          const inDanger = started && !out && !done && cutoff !== null && cutoff < race.N && pos > cutoff && !(isCar && race.N <= 6);
          const st = (m as unknown as { stats?: { cls: string; teamName?: string; vel: number; est: number; int: number } }).stats;
          return (
            <div
              key={m.abbr}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 3 * s + slot * ROW,
                height: ROW,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: `0 ${10 * s}px`,
                fontSize: fs * s,
                fontWeight: 800,
                opacity: out ? 0.38 : 1,
                background: gained
                  ? "rgba(255, 204, 0, 0.18)"
                  : inQualZone
                    ? "rgba(0, 230, 118, 0.14)"
                    : inDanger
                      ? "rgba(255, 23, 68, 0.18)"
                      : "transparent",
                boxShadow: `inset 0 -${1 * s}px 0 rgba(255, 255, 255, 0.06)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 * s }}>
                <span
                  style={{
                    width: (fs + 4) * s,
                    height: (fs + 4) * s,
                    borderRadius: 5 * s,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: pos === 1 && !out ? "#e10600" : inQualZone ? "#00c853" : inDanger ? "rgba(255,23,68,0.45)" : pos <= 3 && !out ? "rgba(255,255,255,0.18)" : "transparent",
                    color: pos <= 3 && !out ? "#ffffff" : inDanger ? "#ff8a9e" : "rgba(255,255,255,0.7)",
                    fontSize: (fs - 3) * s,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pos}
                </span>
                <MarbleDot s={s} color={m.color} flag={flagOf(m)} size={big ? 15 : 18} />
                <span style={{ color: "#f4f5f8", letterSpacing: 0.4 * s }}>{m.abbr}</span>
                <span style={{ flex: 1 }} />
                {done && <Chequer s={s} />}
                <span style={{ fontSize: (fs - 2) * s, fontWeight: 700, color: out ? "#ff4d58" : inQualZone ? "#00e676" : inDanger ? "#ff6b81" : pos === 1 ? "#ffffff" : "rgba(255,255,255,0.68)", fontVariantNumeric: "tabular-nums" }}>{gap}</span>
              </div>
              {isCar && st && race.N <= 10 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 * s, marginTop: 3 * s, fontSize: 10 * s }}>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    ⚡<PipBar val={st.vel} color="#ff5252" s={s} />
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    🛡️<PipBar val={st.est} color="#69f0ae" s={s} />
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    🧠<PipBar val={st.int} color="#ea80fc" s={s} />
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** @moreballs-style Top-Right Checkpoint & Survival Tracker + Song Credit */
function MoreBallsTopRightHUD({ race, f, s, layout }: { race: Race; f: number; s: number; layout: Layout }) {
  if (layout === "portrait") return null;
  const isCar = (race.data.info as { vehicle?: string })?.vehicle === "car";
  const surviving = race.marbles.filter((_, i) => !race.dqBy(i, f)).length;
  const roundNum = race.data.round ?? 1;
  const cps = ((race.data as unknown as { checkpoints?: { index: number; survive: number; closedFrame: number | null; eliminated: number[] }[] }).checkpoints ?? []);
  const activeCp = cps.find((c) => c.closedFrame === null || f < c.closedFrame);
  const songs = ["Neon Strip Velocity", "Interlagos Samba", "Miami Marina Pulse", "Zandvoort Dune Drift", "Yas Marina Finale"];
  const songTitle = songs[(roundNum - 1) % songs.length];

  return (
    <div
      style={{
        position: "absolute",
        top: 22 * s,
        right: 28 * s,
        textAlign: "right",
        color: "#ffffff",
        textShadow: "0 2px 10px rgba(0,0,0,0.85)",
      }}
    >
      {!isCar && (
        <>
          <div style={{ fontSize: 14 * s, fontWeight: 900, letterSpacing: 3.5 * s, opacity: 0.98 }}>
            D O N ' T   B E   L A S T !
          </div>
          <div
            style={{
              fontSize: 11.5 * s,
              fontWeight: 800,
              color: "rgba(255,255,255,0.85)",
              paddingBottom: 5 * s,
              borderBottom: "1.5px solid rgba(255,255,255,0.35)",
              marginTop: 2 * s,
            }}
          >
            <span style={{ color: "#00e5ff" }}>{surviving}/{race.N} Marbles Survive</span>
            {activeCp ? (
              <>
                {" "}&nbsp;·&nbsp; <span style={{ color: "#ff5252" }}>Cutoff: Top {activeCp.survive} (Last Eliminated)</span>
              </>
            ) : (
              <>
                {" "}&nbsp;·&nbsp; <span style={{ color: "#ffcc00" }}>Top 10 Score Points!</span>
              </>
            )}
          </div>
        </>
      )}
      {!isCar && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 7 * s,
              marginTop: 7 * s,
            }}
          >
            <span style={{ fontSize: 13 * s, fontWeight: 900, letterSpacing: 1 * s, marginRight: 3 * s }}>
              CHECKPOINT
            </span>
            {cps.map((cp, r) => {
              const passed = cp?.closedFrame != null && f >= cp.closedFrame;
              const active = activeCp ? activeCp.index === r + 1 : false;
              return (
                <div
                  key={r}
                  style={{
                    width: 24 * s,
                    height: 24 * s,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: active ? "#ffffff" : passed ? "#00e5ff" : "rgba(14,16,22,0.68)",
                    color: active || passed ? "#080a10" : "#ffffff",
                    border: `2px solid ${passed ? "#00e5ff" : "#ffffff"}`,
                    fontSize: 13 * s,
                    fontWeight: 900,
                  }}
                >
                  {r + 1}
                </div>
              );
            })}
          </div>
          <div
            style={{
              fontSize: 10 * s,
              fontWeight: 800,
              letterSpacing: 0.6 * s,
              color: "rgba(255,255,255,0.82)",
              marginTop: 4 * s,
            }}
          >
            RULE: LAST MARBLES AT EACH CHECKPOINT ARE ELIMINATED
          </div>
        </>
      )}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7 * s,
          marginTop: 8 * s,
          padding: `${4 * s}px ${10 * s}px`,
          borderRadius: 8 * s,
          background: "rgba(14, 16, 22, 0.65)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.14)",
        }}
      >
        <span style={{ fontSize: 16 * s, opacity: 0.7 }}>🎵</span>
        <div style={{ textAlign: "left", lineHeight: 1.1 }}>
          <div style={{ fontSize: 9 * s, fontWeight: 700, color: "rgba(255,255,255,0.65)" }}>Song:</div>
          <div style={{ fontSize: 13 * s, fontWeight: 900 }}>{songTitle}</div>
        </div>
      </div>
    </div>
  );
}

/** Top-center Checkpoint Knockout Toast explaining the elimination rules, warning when a checkpoint opens, and announcing eliminated backmarkers */
function CheckpointKnockoutToast({ race, f, s, layout }: { race: Race; f: number; s: number; layout: Layout }) {
  const cps = ((race.data as unknown as {
    checkpoints?: { index: number; survive: number; firstFrame?: number | null; closedFrame: number | null; eliminated: number[] }[];
  }).checkpoints ?? []);
  if (!cps.length) return null;

  // 1) Locked toast when a checkpoint reaches its survivor quota and eliminates the trailing marbles
  const hit = cps.find((c) => c.closedFrame !== null && f >= c.closedFrame && f <= c.closedFrame + 175);
  if (hit && hit.closedFrame !== null) {
    const age = f - hit.closedFrame;
    const inn = spring({ frame: age, fps: race.fps, config: { damping: 16, stiffness: 180 } });
    const out = interpolate(age, [145, 175], [1, 0], clamp);
    const k = inn * out;
    return (
      <div
        style={{
          position: "absolute",
          top: (layout === "portrait" ? 96 : 24) * s,
          left: "50%",
          transform: `translateX(-50%) translateY(${(1 - k) * -32 * s}px) scale(${0.92 + 0.08 * k})`,
          opacity: k,
          background: "rgba(12, 14, 20, 0.94)",
          backdropFilter: "blur(12px)",
          border: `2px solid #ff1744`,
          borderRadius: 12 * s,
          padding: `${10 * s}px ${22 * s}px`,
          boxShadow: "0 14px 36px rgba(0,0,0,0.65)",
          color: "#ffffff",
          textAlign: "center",
          zIndex: 25,
        }}
      >
        <div style={{ fontSize: 15 * s, fontWeight: 900, letterSpacing: 1.5 * s, color: "#00e5ff" }}>
          CHECKPOINT {hit.index} LOCKED · TOP {hit.survive} ADVANCE!
        </div>
        <div style={{ fontSize: 11 * s, fontWeight: 700, color: "rgba(255,255,255,0.72)", marginTop: 2 * s }}>
          Last {hit.eliminated.length} marbles failed to reach Checkpoint {hit.index} in time
        </div>
        {hit.eliminated.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10 * s,
              marginTop: 6 * s,
              fontSize: 13 * s,
              fontWeight: 800,
            }}
          >
            <span style={{ color: "#ff4d58", fontWeight: 900 }}>ELIMINATED:</span>
            {hit.eliminated.map((mIdx) => {
              const m = race.marbles[mIdx];
              if (!m) return null;
              return (
                <span key={mIdx} style={{ display: "inline-flex", alignItems: "center", gap: 5 * s }}>
                  <MarbleDot s={s} color={m.color} flag={flagOf(m)} size={14} />
                  <span>{m.abbr}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // 2) Active checkpoint warning while marbles are passing through the checkpoint before it locks
  const openCp = cps.find(
    (c) =>
      c.firstFrame != null &&
      c.closedFrame != null &&
      f >= c.firstFrame - 30 &&
      f < c.closedFrame &&
      f <= c.firstFrame + 160,
  );
  if (openCp && openCp.firstFrame != null && openCp.closedFrame != null) {
    const startF = openCp.firstFrame - 30;
    const endF = Math.min(openCp.closedFrame, openCp.firstFrame + 160);
    const age = f - startF;
    const inn = spring({ frame: age, fps: race.fps, config: { damping: 16, stiffness: 180 } });
    const out = interpolate(f, [endF - 20, endF], [1, 0], clamp);
    const k = inn * out;
    const prevSurvive = openCp.index === 1 ? race.N : (cps[openCp.index - 2]?.survive ?? race.N);
    const elimCount = Math.max(1, prevSurvive - openCp.survive);
    return (
      <div
        style={{
          position: "absolute",
          top: (layout === "portrait" ? 96 : 24) * s,
          left: "50%",
          transform: `translateX(-50%) translateY(${(1 - k) * -28 * s}px) scale(${0.94 + 0.06 * k})`,
          opacity: k,
          background: "rgba(12, 14, 20, 0.90)",
          backdropFilter: "blur(12px)",
          border: `2px solid #00e5ff`,
          borderRadius: 12 * s,
          padding: `${9 * s}px ${20 * s}px`,
          boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
          color: "#ffffff",
          textAlign: "center",
          zIndex: 24,
        }}
      >
        <div style={{ fontSize: 14 * s, fontWeight: 900, letterSpacing: 1.4 * s, color: "#00e5ff" }}>
          CHECKPOINT {openCp.index} OPEN · ONLY TOP {openCp.survive} ADVANCE
        </div>
        <div style={{ fontSize: 12 * s, fontWeight: 800, color: "#ffcc00", marginTop: 3 * s }}>
          DON&apos;T BE LAST: THE LAST {elimCount} MARBLES AT THIS CHECKPOINT WILL BE ELIMINATED!
        </div>
      </div>
    );
  }

  // 3) Opening Race Rule Banner right after lights-out explaining why checkpoints eliminate marbles
  const ruleStart = race.timeline.raceStart + 45;
  const ruleEnd = race.timeline.raceStart + 275;
  if (f >= ruleStart && f <= ruleEnd) {
    const age = f - ruleStart;
    const inn = spring({ frame: age, fps: race.fps, config: { damping: 16, stiffness: 170 } });
    const out = interpolate(f, [ruleEnd - 30, ruleEnd], [1, 0], clamp);
    const k = inn * out;
    return (
      <div
        style={{
          position: "absolute",
          top: (layout === "portrait" ? 96 : 24) * s,
          left: "50%",
          transform: `translateX(-50%) translateY(${(1 - k) * -28 * s}px) scale(${0.94 + 0.06 * k})`,
          opacity: k,
          background: "rgba(12, 14, 20, 0.92)",
          backdropFilter: "blur(12px)",
          border: `2px solid #ffcc00`,
          borderRadius: 12 * s,
          padding: `${10 * s}px ${22 * s}px`,
          boxShadow: "0 12px 32px rgba(0,0,0,0.65)",
          color: "#ffffff",
          textAlign: "center",
          zIndex: 24,
        }}
      >
        <div style={{ fontSize: 14 * s, fontWeight: 900, letterSpacing: 1.5 * s, color: "#ffcc00" }}>
          DON&apos;T BE LAST! · CHECKPOINT KNOCKOUT RULES
        </div>
        <div style={{ fontSize: 12 * s, fontWeight: 800, color: "#ffffff", marginTop: 3 * s }}>
          3 Checkpoints eliminate ONLY the last marble at the back (20 → 19 → 18 → 17) · Top 15 finishers score points!
        </div>
      </div>
    );
  }

  return null;
}

/** A marble's flag as a small rounded swatch. */
const MarbleDot = ({ s, color, flag, size = 24 }: { s: number; color: string; flag?: string; size?: number }) => (
  <span
    style={{
      width: size * 1.4 * s,
      height: size * s,
      borderRadius: 4 * s,
      background: flag ? `url(${flagDataUrl(flag)}) center / cover` : color,
      boxShadow: `inset 0 0 0 ${1 * s}px rgba(0,0,0,0.2)`,
      flex: "none",
    }}
  />
);
const flagOf = (m: { flag?: string }) => m.flag;

const Chequer = ({ s }: { s: number }) => (
  <span style={{ width: 18 * s, height: 14 * s, backgroundImage: "conic-gradient(#fff 25%, #111 0 50%, #fff 0 75%, #111 0)", backgroundSize: `${7 * s}px ${7 * s}px`, borderRadius: 2 * s, boxShadow: "0 0 0 1px #111" }} />
);

function Minimap({ race, t, s, f, layout, frame }: OverlayProps & { s: number; f: number }) {
  const size = (layout === "portrait" ? 210 : 190) * s;
  const { d, map } = outlinePath(race.data.outline, size, 16 * s);
  const order = race.ranking(f);
  const inn = spring({ frame: frame - race.timeline.raceStart, fps: race.fps, config: { damping: 18 } });
  const out = interpolate(frame, [race.timeline.replay.at - race.sec(0.3), race.timeline.replay.at], [1, 0], clamp);
  const features = race.data.features as { u: number; type: string }[];
  const samples = race.data.samples as { u: number; p: number[] }[];
  return (
    <svg
      width={size}
      height={size}
      style={{
        position: "absolute",
        right: 28 * s,
        bottom: (layout === "portrait" ? 210 : 28) * s,
        background: "rgba(14, 16, 22, 0.72)",
        backdropFilter: "blur(10px)",
        border: `${1 * s}px solid rgba(255,255,255,0.12)`,
        borderRadius: 16 * s,
        boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
        opacity: inn * out,
      }}
    >
      <path d={d} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={9 * s} strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#f4f5f8" strokeWidth={2.5 * s} strokeLinejoin="round" />
      {features.map((ft, k) => {
        const smp = samples[Math.min(samples.length - 1, Math.max(0, Math.round((ft.u - samples[0].u) / 0.5)))];
        const [x, y] = map(smp.p[0], smp.p[2]);
        return <circle key={k} cx={x} cy={y} r={3.2 * s} fill="#e10600" stroke="#111" strokeWidth={1.2 * s} />;
      })}
      {(() => {
        const [x, y] = map(race.data.outline[0][0], race.data.outline[0][1]);
        return <rect x={x - 5 * s} y={y - 5 * s} width={10 * s} height={10 * s} fill="#ffffff" />;
      })()}
      {[...order].reverse().map((i) => {
        if (race.dqBy(i, f)) return null;
        const { pos } = race.marblePose(i, t);
        const [x, y] = map(pos[0], pos[2]);
        const lead = i === order[0];
        const fl = flagOf(race.marbles[i]);
        const w = (lead ? 18 : 13) * s;
        const h = w / 1.5;
        return (
          <g key={i}>
            <rect x={x - w / 2 - 1.2 * s} y={y - h / 2 - 1.2 * s} width={w + 2.4 * s} height={h + 2.4 * s} rx={2.5 * s} fill={lead ? "#ffcc00" : "#111216"} />
            {fl ? <image href={flagDataUrl(fl)} x={x - w / 2} y={y - h / 2} width={w} height={h} preserveAspectRatio="none" /> : <circle cx={x} cy={y} r={h / 2} fill={race.marbles[i].color} />}
          </g>
        );
      })}
    </svg>
  );
}

/** Obstacle names, onboard captions, and position badges over the leaders. */
function ShotCaption({ race, shot, t, f, s, width, height, layout }: OverlayProps & { s: number; f: number }) {
  const isCar = (race.data.info as { vehicle?: string })?.vehicle === "car";
  const info = race.shotInfo(f);
  const local = f - info.start;
  const k = spring({ frame: local, fps: race.fps, config: { damping: 16 } });
  const caption = isCar
    ? null
    : shot.kind === "feature" && info.label ? (
      <Chip s={s} size={34}>
        {info.label}
      </Chip>
    ) : shot.kind === "lead" && local <= race.sec(2.6) ? (
      <Chip s={s} bg={card} size={26}>
        <span style={{ fontSize: 16 * s, letterSpacing: 2.5 * s, color: "#0090d0" }}>FRONT CAM</span>
        <span>LEADER &amp; CHASERS</span>
      </Chip>
    ) : shot.kind === "onboard" && shot.marble !== null ? (
      <Chip s={s} bg={card} size={30}>
        <span style={{ fontSize: 18 * s, letterSpacing: 3 * s, color: "#5b606e" }}>ONBOARD</span>
        <MarbleDot s={s} color={race.marbles[shot.marble].color} flag={flagOf(race.marbles[shot.marble])} />
        {race.marbles[shot.marble].name.toUpperCase()} · P{race.ranking(f).indexOf(shot.marble) + 1}
      </Chip>
    ) : null;

  const ranking = race.ranking(f);
  const badges =
    f >= race.timeline.raceStart + race.sec(1) && ["chase", "side", "top", "orbit", "lead", "feature", "finish"].includes(shot.kind)
      ? ranking
          .slice(0, 3)
          .filter((i) => !race.finishedBy(i, f) && !race.dqBy(i, f))
          .map((i) => {
            const rank = ranking.indexOf(i) + 1;
            const { pos } = race.marblePose(i, t);
            const pt = project(shot, lensFov(shot.fov, width / height, layout), [pos[0], pos[1] + 0.55, pos[2]], width, height);
            if (!pt.visible) return null;
            return (
              <div key={i} style={{ position: "absolute", left: pt.x, top: pt.y - 40 * s, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 6 * s, padding: `${3 * s}px ${10 * s}px`, background: card, borderRadius: 9 * s, boxShadow: shadow, fontSize: 19 * s, fontWeight: 900, whiteSpace: "nowrap" }}>
                <span style={{ width: 20 * s, height: 20 * s, borderRadius: 6 * s, background: rank === 1 ? yellow : ink, color: rank === 1 ? ink : "white", fontSize: 14 * s, display: "flex", alignItems: "center", justifyContent: "center" }}>{rank}</span>
                {race.marbles[i].abbr}
              </div>
            );
          })
      : null;

  return (
    <>
      {badges}
      {caption && (
        <div style={{ position: "absolute", left: 0, right: 0, top: (layout === "portrait" ? 640 : 50) * s, display: "flex", justifyContent: "center", opacity: k, transform: `translateY(${(1 - k) * -20 * s}px) scale(${0.9 + 0.1 * k})` }}>
          {caption}
        </div>
      )}
    </>
  );
}

/**
 * The split screen's labels: LIVE · P1 on the left half; on the right, a big R
 * and REPLAY 0.4× with what happened (highlights and bloopers), the lift tower
 * with the flags riding in each cabin, or the action the director cut to.
 */
function SplitGraphics({ race, split, f, frame, s, layout, width, height }: { race: Race; split: Split; f: number; frame: number; s: number; layout: Layout; width: number; height: number }) {
  const side = layout === "landscape";
  const panes = side
    ? [{ x: 0, y: 0, w: width / 2, h: height }, { x: width / 2, y: 0, w: width / 2, h: height }]
    : [{ x: 0, y: 0, w: width, h: height / 2 }, { x: 0, y: height / 2, w: width, h: height / 2 }];
  const k = spring({ frame: f - split.start, fps: race.fps, config: { damping: 15 } });
  const out = interpolate(f, [split.end - race.sec(0.3), split.end], [1, 0], clamp);
  // P1 as the timing tower shows it (its settled order), so the chip and the tower always agree.
  const slots = race.rowSlots[Math.max(0, Math.min(race.rowSlots.length - 1, f))];
  const order = race.marbles.map((_, i) => i).sort((a, b) => slots[a] - slots[b]);
  const p1 = order[0];
  const m1 = race.marbles[p1];
  const gap2 = order[1] !== undefined && !race.finishedBy(order[1], f) ? race.gapAt(order[1], f) : null;
  // `inset`: room kept clear on the pane's left (the timing tower sits over the left half).
  const top = (pane: { x: number; y: number; w: number; h: number }, children: React.ReactNode, offset = 34, inset = 0) => (
    <div style={{ position: "absolute", left: pane.x + inset * s, top: pane.y + offset * s, width: pane.w - inset * s, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * s, opacity: k * out, transform: `translateY(${(1 - k) * -18 * s}px)` }}>{children}</div>
  );
  const flagsRow = (riders: number[]) => (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 * s, maxWidth: panes[1].w * 0.8, justifyContent: "center" }}>
      {riders.map((i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 * s, fontSize: 18 * s, fontWeight: 800 }}>
          <MarbleDot s={s} color={race.marbles[i].color} flag={flagOf(race.marbles[i])} size={18} />
          {race.marbles[i].abbr}
        </span>
      ))}
    </span>
  );
  let right: React.ReactNode = null;
  if (split.kind === "replay" && split.highlight !== undefined) {
    const h = race.highlights[split.highlight];
    const m = race.marbles[h.marble];
    const blink = Math.floor(frame / race.sec(0.5)) % 2 === 0;
    right = (
      <>
        {/* The big R in the corner, broadcast style. */}
        <div style={{ position: "absolute", left: panes[1].x + panes[1].w - 120 * s, top: panes[1].y + 30 * s, width: 84 * s, height: 84 * s, borderRadius: 42 * s, background: "#e8414a", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 56 * s, fontWeight: 900, boxShadow: shadow, opacity: k * out }}>R</div>
        {top(
          panes[1],
          <>
            <Chip s={s} bg={card} size={26}>
              <span style={{ width: 14 * s, height: 14 * s, borderRadius: 7 * s, background: "#e8414a", opacity: blink ? 1 : 0.3 }} />
              REPLAY <span style={{ color: "#5b606e" }}>{h.speed}×</span>
            </Chip>
            <Chip s={s} bg={h.dq ? "#e8414a" : yellow} color={h.dq ? "white" : ink} size={26}>
              <MarbleDot s={s} color={m.color} flag={flagOf(m)} size={26} />
              {h.label}
            </Chip>
          </>,
        )}
        {h.dq && <DqExplainer race={race} split={split} h={h} pane={panes[1]} frame={frame} s={s} layout={layout} opacity={k * out} />}
      </>
    );
  } else if (split.kind === "lift") {
    const riding = (split.cabins ?? []).filter((c) => f >= c.start && f < c.end);
    right = top(
      panes[1],
      <>
        <Chip s={s} size={28}>TWIN-CHAIN SCOOP LIFT</Chip>
        {riding.map((c) => (
          <Chip key={c.cabin} s={s} bg={card} size={20}>
            <span style={{ width: 30 * s, height: 30 * s, borderRadius: 15 * s, background: yellow, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>{c.cabin + 1}</span>
            <span style={{ color: "#5b606e" }}>▲</span>
            {flagsRow(c.riders)}
          </Chip>
        ))}
      </>,
    );
  } else {
    right = top(panes[1], <Chip s={s} size={28}>{split.label ?? "MEANWHILE"}</Chip>);
  }
  return (
    <>
      {top(
        panes[0],
        <Chip s={s} bg={card} size={24}>
          <span style={{ background: "#e8414a", color: "white", padding: `${2 * s}px ${8 * s}px`, borderRadius: 6 * s, fontSize: 16 * s, letterSpacing: 2 * s }}>LIVE</span>
          <span style={{ color: "#5b606e", fontSize: 18 * s }}>LEADER</span>
          <MarbleDot s={s} color={m1.color} flag={flagOf(m1)} />
          {m1.name.toUpperCase()}
          {gap2 !== null && <span style={{ color: "#5b606e", fontSize: 18 * s, fontVariantNumeric: "tabular-nums" }}>+{gap2.toFixed(1)}s</span>}
        </Chip>,
        34,
        side ? 360 : 320,
      )}
      {right}
    </>
  );
}

function Toasts({ race, f, s, layout }: { race: Race; f: number; s: number; layout: Layout }) {
  const life = race.sec(2.5);
  const ev = [...race.events].reverse().find((e) => f >= e.frame && f < e.frame + life);
  if (!ev) return null;
  const local = f - ev.frame;
  const k = spring({ frame: local, fps: race.fps, config: { damping: 16 } });
  const out = interpolate(local, [life - race.sec(0.4), life], [1, 0], clamp);
  const a = race.marbles[ev.a];
  const b = race.marbles[ev.b];
  if ((ev as { kind: string }).kind === "bestlap") {
    const e = ev as unknown as { a: number; frames: number; lap: number };
    return (
      <div style={{ position: "absolute", left: 40 * s, bottom: (layout === "portrait" ? 560 : 40) * s, opacity: k * out, transform: `translateX(${(1 - k) * -60 * s}px)` }}>
        <Chip s={s} bg={card} size={28}>
          <span style={{ background: "#b03cff", color: "white", padding: `${2 * s}px ${8 * s}px`, borderRadius: 6 * s, fontSize: 18 * s }}>BEST LAP</span>
          <MarbleDot s={s} color={a.color} flag={flagOf(a)} />
          {a.name.toUpperCase()}
          <span style={{ color: "#5b606e", fontVariantNumeric: "tabular-nums" }}>{(e.frames / race.fps).toFixed(2)}s · lap {e.lap + 1}</span>
        </Chip>
      </div>
    );
  }
  if ((ev as { kind: string }).kind === "dq")
    return (
      <div style={{ position: "absolute", left: 40 * s, bottom: (layout === "portrait" ? 560 : 40) * s, opacity: k * out, transform: `translateX(${(1 - k) * -60 * s}px)` }}>
        <Chip s={s} bg={card} size={28}>
          <span style={{ background: "#e8414a", color: "white", padding: `${2 * s}px ${8 * s}px`, borderRadius: 6 * s, fontSize: 18 * s }}>DRAINED</span>
          <MarbleDot s={s} color={a.color} flag={flagOf(a)} />
          {a.name.toUpperCase()}
          <span style={{ color: "#5b606e" }}>fell into the drain at {featureName(race, (ev as { feature?: string }).feature)} · out of the race</span>
        </Chip>
      </div>
    );
  return (
    <div style={{ position: "absolute", left: 40 * s, bottom: (layout === "portrait" ? 560 : 40) * s, opacity: k * out, transform: `translateX(${(1 - k) * -60 * s}px)` }}>
      <Chip s={s} bg={card} size={28}>
        <span style={{ background: yellow, padding: `${2 * s}px ${8 * s}px`, borderRadius: 6 * s, fontSize: 18 * s }}>OVERTAKE</span>
        <MarbleDot s={s} color={a.color} flag={flagOf(a)} />
        {a.abbr}
        <span style={{ color: "#9aa0ad" }}>▶</span>
        <MarbleDot s={s} color={b.color} flag={flagOf(b)} />
        {b.abbr}
        <span style={{ color: "#5b606e" }}>for P{ev.pos}</span>
      </Chip>
    </div>
  );
}

/** Sculpted 3D-styled Metallic Championship Trophy Cup SVG (Gold / Silver / Bronze) */
function TrophyCup({ s, rank = 1, size = 76 }: { s: number; rank?: 1 | 2 | 3; size?: number }) {
  const w = size * s;
  const h = size * 1.12 * s;
  const palette =
    rank === 1
      ? { hi: "#fff4b8", mid: "#ffcc00", lo: "#b37400", rim: "#ffe57f", glow: "rgba(255,204,0,0.55)" }
      : rank === 2
        ? { hi: "#ffffff", mid: "#cfd6e0", lo: "#6e7685", rim: "#e8ecf2", glow: "rgba(207,214,224,0.4)" }
        : { hi: "#ffd2a6", mid: "#d9823b", lo: "#7a3e10", rim: "#f0a365", glow: "rgba(217,130,59,0.4)" };
  const gid = `trophy-grad-${rank}`;
  return (
    <svg width={w} height={h} viewBox="0 0 100 112" style={{ filter: `drop-shadow(0 ${4 * s}px ${14 * s}px ${palette.glow})`, flex: "none" }}>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette.hi} />
          <stop offset="45%" stopColor={palette.mid} />
          <stop offset="100%" stopColor={palette.lo} />
        </linearGradient>
      </defs>
      {/* Left & Right Sculpted Handles */}
      <path d="M24 22 C8 22, 8 52, 28 56" fill="none" stroke={`url(#${gid})`} strokeWidth="7.5" strokeLinecap="round" />
      <path d="M76 22 C92 22, 92 52, 72 56" fill="none" stroke={`url(#${gid})`} strokeWidth="7.5" strokeLinecap="round" />
      {/* Crown & Cup Bowl */}
      <ellipse cx="50" cy="16" rx="28" ry="6.5" fill={palette.rim} stroke={palette.lo} strokeWidth="2" />
      <path d="M22 16 C22 54, 36 66, 50 68 C64 66, 78 54, 78 16 Z" fill={`url(#${gid})`} />
      {/* Specular Highlight Rib on Bowl */}
      <path d="M33 22 C33 46, 40 56, 45 60" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="4.5" strokeLinecap="round" />
      {/* Stem & Collar */}
      <rect x="44" y="66" width="12" height="18" rx="4" fill={`url(#${gid})`} />
      <ellipse cx="50" cy="84" rx="18" ry="4.5" fill={palette.rim} />
      {/* Stepped Horological Pedestal Base */}
      <path d="M28 84 L72 84 L78 102 L22 102 Z" fill="#181b24" stroke={palette.mid} strokeWidth="2.5" />
      <rect x="34" y="89" width="32" height="8" rx="2" fill={`url(#${gid})`} />
      <text x="50" y="45" textAnchor="middle" fill="#111216" fontSize="22" fontWeight="900" fontFamily={font}>
        {rank}
      </text>
    </svg>
  );
}

function FinishBanner({ race, f, s, layout }: { race: Race; f: number; s: number; layout: Layout }) {
  if (f < race.winnerFrame) return null;
  const k = spring({ frame: f - race.winnerFrame, fps: race.fps, config: { damping: 14 } });
  const m = race.marbles[race.winner];
  const tm = teamOf(m.abbr);
  const winSec = race.finishSeconds(race.winner);
  const podium = race.order.slice(0, 3).filter((idx) => race.finishedBy(idx, f));

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: (layout === "portrait" ? 560 : 54) * s, pointerEvents: "none" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12 * s,
          padding: `${18 * s}px ${34 * s}px`,
          borderRadius: 22 * s,
          background: "linear-gradient(135deg, rgba(14,17,26,0.95) 0%, rgba(24,28,40,0.95) 100%)",
          border: `${2.5 * s}px solid #ffcc00`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.75), 0 0 36px rgba(255,204,0,0.28)",
          color: "#ffffff",
          transform: `translateY(${(1 - k) * 260 * s}px) scale(${0.92 + 0.08 * k})`,
          opacity: k,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 * s }}>
          <TrophyCup s={s} rank={1} size={74} />
          <MarbleDot s={s} color={m.color} flag={flagOf(m)} size={58} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 * s }}>
              <span style={{ background: "#ffcc00", color: "#111216", padding: `${3 * s}px ${10 * s}px`, borderRadius: 6 * s, fontSize: 15 * s, fontWeight: 900, letterSpacing: 2 * s }}>
                GRAND PRIX WINNER
              </span>
              {tm && <span style={{ fontSize: 15 * s, fontWeight: 800, color: "rgba(255,255,255,0.75)" }}>{tm.name.toUpperCase()}</span>}
            </div>
            <div style={{ fontSize: 64 * s, fontWeight: 900, lineHeight: 0.98, letterSpacing: -1.5 * s, color: "#ffffff", marginTop: 4 * s }}>
              {m.name.toUpperCase()}
            </div>
            {winSec !== null && (
              <div style={{ fontSize: 16 * s, fontWeight: 800, color: "#ffcc00", marginTop: 2 * s, fontVariantNumeric: "tabular-nums" }}>
                WINNING TIME: {winSec.toFixed(2)}s · +25 CHAMPIONSHIP PTS
              </div>
            )}
          </div>
        </div>
        {podium.length > 1 && (
          <div style={{ display: "flex", gap: 16 * s, paddingTop: 10 * s, borderTop: "1px solid rgba(255,255,255,0.16)", width: "100%", justifyContent: "center" }}>
            {podium.map((idx, pIdx) => {
              const pm = race.marbles[idx];
              const tSec = race.finishSeconds(idx);
              const diff = pIdx === 0 || tSec === null || winSec === null ? "WINNER" : `+${(tSec - winSec).toFixed(2)}s`;
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 * s, background: "rgba(255,255,255,0.08)", padding: `${5 * s}px ${14 * s}px`, borderRadius: 10 * s, fontSize: 16 * s, fontWeight: 800 }}>
                  <span style={{ color: pIdx === 0 ? "#ffcc00" : pIdx === 1 ? "#cfd6e0" : "#e59856", fontWeight: 900 }}>P{pIdx + 1}</span>
                  <MarbleDot s={s} color={pm.color} flag={flagOf(pm)} size={18} />
                  <span>{pm.abbr}</span>
                  <span style={{ color: "rgba(255,255,255,0.68)", fontVariantNumeric: "tabular-nums", fontSize: 14 * s }}>{diff}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

function ReplayGraphics({ race, frame, s }: { race: Race; frame: number; s: number }) {
  const local = frame - race.timeline.replay.at;
  const k = spring({ frame: local - race.sec(0.3), fps: race.fps, config: { damping: 16 } });
  const blink = Math.floor(frame / race.sec(0.5)) % 2 === 0;
  const w = race.marbles[race.winner];
  const r = race.marbles[race.order[1]];
  return (
    <>
      <div style={{ position: "absolute", top: 40 * s, right: 40 * s }}>
        <Chip s={s} bg={card} size={30}>
          <span style={{ width: 16 * s, height: 16 * s, borderRadius: 8 * s, background: "#e8414a", opacity: blink ? 1 : 0.3 }} />
          REPLAY <span style={{ color: "#5b606e" }}>{race.timeline.replay.speed}×</span>
        </Chip>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 70 * s, display: "flex", justifyContent: "center", opacity: k, transform: `translateY(${(1 - k) * 40 * s}px)` }}>
        <Chip s={s} bg={card} size={44}>
          <span style={{ background: yellow, padding: `${2 * s}px ${10 * s}px`, borderRadius: 8 * s, fontSize: 22 * s }}>
            {race.margin !== null && race.margin < 0.3 ? "PHOTO FINISH" : "THE WIN"}
          </span>
          {w.name} beats {r.name}
          {race.margin !== null ? ` by ${race.margin.toFixed(2)}s` : ""}
        </Chip>
      </div>
    </>
  );
}

function PodiumStage({ s, top3 }: { s: number; top3: { marbleIdx: number; name: string; flag?: string; color: string; sub: string }[] }) {
  if (top3.length < 3) return null;
  const slots: { item: (typeof top3)[number]; rank: 1 | 2 | 3; h: number }[] = [
    { item: top3[1], rank: 2, h: 46 },
    { item: top3[0], rank: 1, h: 64 },
    { item: top3[2], rank: 3, h: 36 },
  ];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 22 * s, padding: `${16 * s}px ${24 * s}px 0` }}>
      {slots.map(({ item, rank, h }) => (
        <div key={rank} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 250 * s }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 * s, marginBottom: 6 * s }}>
            <TrophyCup s={s} rank={rank} size={rank === 1 ? 48 : 38} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 * s }}>
                <MarbleDot s={s} color={item.color} flag={item.flag} size={20} />
                <span style={{ fontSize: (rank === 1 ? 22 : 18) * s, fontWeight: 900, color: "#ffffff" }}>{item.name.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 13 * s, fontWeight: 800, color: rank === 1 ? "#ffcc00" : "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>{item.sub}</div>
            </div>
          </div>
          <div
            style={{
              width: "100%",
              height: h * s,
              borderRadius: `${10 * s}px ${10 * s}px 0 0`,
              background:
                rank === 1
                  ? "linear-gradient(180deg, rgba(255,204,0,0.38) 0%, rgba(255,204,0,0.1) 100%)"
                  : rank === 2
                    ? "linear-gradient(180deg, rgba(207,214,224,0.28) 0%, rgba(207,214,224,0.06) 100%)"
                    : "linear-gradient(180deg, rgba(217,130,59,0.28) 0%, rgba(217,130,59,0.06) 100%)",
              borderTop: `${3 * s}px solid ${rank === 1 ? "#ffcc00" : rank === 2 ? "#cfd6e0" : "#d9823b"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: (rank === 1 ? 26 : 20) * s,
              fontWeight: 900,
              color: rank === 1 ? "#ffcc00" : "#ffffff",
            }}
          >
            {rank === 1 ? "1ST · WINNER" : rank === 2 ? "2ND PLACE" : "3RD PLACE"}
          </div>
        </div>
      ))}
    </div>
  );
}

function Card({ race, s, layout, children, title, frame, at, footer, columns, headerExtra }: { race: Race; s: number; layout: Layout; children: React.ReactNode; title: string; frame: number; at: number; footer?: React.ReactNode; columns?: number; headerExtra?: React.ReactNode }) {
  const cols = columns ?? (race.N > 12 ? 2 : 1);
  const n = Array.isArray(children) ? children.length : 1;
  const k = spring({ frame: frame - at, fps: race.fps, config: { damping: 18 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `rgba(8,10,16,${0.72 * k})` }}>
      <div
        style={{
          width: (layout === "portrait" ? 960 : 1060) * s,
          background: "rgba(14, 17, 24, 0.95)",
          backdropFilter: "blur(16px)",
          border: `${2 * s}px solid rgba(255,204,0,0.45)`,
          borderRadius: 24 * s,
          overflow: "hidden",
          boxShadow: "0 40px 120px rgba(0,0,0,0.75)",
          color: "#f4f5f8",
          opacity: k,
          transform: `translateY(${(1 - k) * 60 * s}px)`,
        }}
      >
        <div
          style={{
            padding: `${14 * s}px ${28 * s}px`,
            background: "linear-gradient(90deg, #e10600 0%, #b30500 55%, #1c202c 100%)",
            color: "#ffffff",
            fontSize: 28 * s,
            fontWeight: 900,
            letterSpacing: 1.2 * s,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{title}</span>
          <span style={{ fontSize: 15 * s, color: "#ffcc00", letterSpacing: 2 * s }}>DON&apos;T BE LAST · CHAMPIONSHIP</span>
        </div>
        {headerExtra}
        <div style={{ padding: `${12 * s}px ${28 * s}px ${footer ? 8 : 18}px`, display: "grid", gridAutoFlow: "column", gridTemplateColumns: cols === 2 ? "1fr 1fr" : "1fr", gridTemplateRows: `repeat(${Math.ceil((columns ? n : race.N) / cols)}, auto)`, columnGap: 28 * s }}>{children}</div>
        {footer && <div style={{ padding: `0 ${28 * s}px ${18 * s}px`, display: "flex", justifyContent: "center" }}>{footer}</div>}
      </div>
    </AbsoluteFill>
  );
}

function Results({ race, frame, s, layout }: { race: Race; frame: number; s: number; layout: Layout }) {
  const at = race.timeline.results.at;
  const results = race.data.results;
  const t0 = race.finishSeconds(results[0].marble) ?? results[0].time;
  const top3 = results.slice(0, 3).map((r, idx) => {
    const m = race.marbles[r.marble];
    const ti = race.finishSeconds(r.marble) ?? r.time;
    const sub = ti === null ? `+${r.points} PTS` : idx === 0 ? `${ti.toFixed(2)}s · +${r.points} PTS` : `+${(ti - t0!).toFixed(2)}s · +${r.points} PTS`;
    return { marbleIdx: r.marble, name: m.name, flag: flagOf(m), color: m.color, sub };
  });
  return (
    <Card
      race={race}
      s={s}
      layout={layout}
      frame={frame}
      at={at}
      title={`${race.data.info.title.toUpperCase()} · PODIUM & RESULTS`}
      headerExtra={<PodiumStage s={s} top3={top3} />}
      footer={(() => {
        const best = race.bestLapBy(race.lastFrame);
        if (!best) return null;
        const m = race.marbles[best.marble];
        return (
          <Chip s={s} bg="#b03cff" size={26}>
            <span style={{ color: "white", letterSpacing: 2 * s, fontSize: 16 * s }}>FASTEST LAP</span>
            <MarbleDot s={s} color={m.color} flag={flagOf(m)} size={22} />
            <span style={{ color: "white" }}>
              {m.name.toUpperCase()} · {((best.end - best.start) / race.fps).toFixed(2)}s
            </span>
          </Chip>
        );
      })()}
    >
      {results.map((r, k) => {
        const m = race.marbles[r.marble];
        const inn = spring({ frame: frame - at - race.sec(0.2) - k * race.sec(0.08), fps: race.fps, config: { damping: 18 } });
        const ti = race.finishSeconds(r.marble) ?? r.time;
        const gap = (r as { dq?: boolean }).dq ? "ELIM" : ti === null ? "—" : k === 0 ? `${ti.toFixed(2)}s` : `+${(ti - t0!).toFixed(2)}`;
        return <Row key={r.marble} s={s} inn={inn} pos={r.pos} color={m.color} flag={flagOf(m)} name={m.name} right={gap} extra={r.points ? `+${r.points}` : ""} compact={race.N > 12} />;
      })}
    </Card>
  );
}

function Standings({ race, frame, s, layout }: { race: Race; frame: number; s: number; layout: Layout }) {
  const at = race.timeline.standings.at;
  const final = race.data.round === race.data.rounds;
  const champion = race.data.standings[0];
  const crown = spring({ frame: frame - at - race.sec(1.0), fps: race.fps, config: { damping: 12 } });
  const top3 = race.data.standings.slice(0, 3).map((r) => {
    const m = race.marbles[r.marble];
    return { marbleIdx: r.marble, name: m.name, flag: flagOf(m), color: m.color, sub: `${r.points} PTS` };
  });
  return (
    <Card
      race={race}
      s={s}
      layout={layout}
      frame={frame}
      at={at}
      title={final ? "FINAL CHAMPIONSHIP STANDINGS" : `CHAMPIONSHIP · AFTER ROUND ${race.data.round} OF ${race.data.rounds}`}
      headerExtra={<PodiumStage s={s} top3={top3} />}
      footer={
        final ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 * s, transform: `scale(${crown})` }}>
            <TrophyCup s={s} rank={1} size={46} />
            <Chip s={s} size={34}>
              {race.marbles[champion.marble].name.toUpperCase()} · WORLD CHAMPION ({champion.points} PTS)
            </Chip>
          </div>
        ) : undefined
      }
    >
      {race.data.standings.map((r, k) => {
        const m = race.marbles[r.marble];
        const inn = spring({ frame: frame - at - race.sec(0.2) - k * race.sec(0.08), fps: race.fps, config: { damping: 18 } });
        const moved = r.prevPos === null ? 0 : r.prevPos - r.pos;
        const gained = race.data.results.find((x) => x.marble === r.marble)?.points ?? 0;
        return <Row key={r.marble} s={s} inn={inn} pos={r.pos} color={m.color} flag={flagOf(m)} name={m.name} right={`${r.points} PTS`} extra={gained ? `+${gained}` : ""} arrow={moved} compact={race.N > 12} />;
      })}
    </Card>
  );
}

/** The constructors' championship: ten teams, both marbles' points. */
function Constructors({ race, frame, s, layout }: { race: Race; frame: number; s: number; layout: Layout }) {
  const at = (race.timeline as unknown as { constructors: { at: number } }).constructors.at;
  const rows = (race.data as unknown as { constructors?: { team: string; pos: number; points: number; round: number; prevPos: number | null }[] }).constructors ?? [];
  const final = race.data.round === race.data.rounds;
  return (
    <Card race={race} s={s} layout={layout} frame={frame} at={at} title={final ? "FINAL CONSTRUCTORS' STANDINGS" : `CONSTRUCTORS · AFTER ROUND ${race.data.round} OF ${race.data.rounds}`} columns={1}>
      {rows.map((r, k) => {
        const tm = TEAMS.find((x) => x.id === r.team)!;
        const inn = spring({ frame: frame - at - race.sec(0.2) - k * race.sec(0.08), fps: race.fps, config: { damping: 18 } });
        const moved = r.prevPos === null ? 0 : r.prevPos - r.pos;
        return (
          <div key={r.team} style={{ display: "flex", alignItems: "center", gap: 14 * s, height: 46 * s, borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 24 * s, fontWeight: 800, opacity: inn, transform: `translateX(${(1 - inn) * 40 * s}px)` }}>
            <span style={{ width: 36 * s, height: 36 * s, borderRadius: 9 * s, display: "flex", alignItems: "center", justifyContent: "center", background: r.pos === 1 ? "#ffcc00" : r.pos <= 3 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.07)", color: r.pos === 1 ? "#111216" : "#ffffff", fontSize: 20 * s }}>{r.pos}</span>
            <span style={{ width: 20 * s, textAlign: "center", fontSize: 18 * s, color: moved ? (moved > 0 ? "#00e676" : "#ff5252") : "transparent" }}>{moved ? (moved > 0 ? "▲" : "▼") : "•"}</span>
            <span style={{ width: 10 * s, height: 32 * s, borderRadius: 3 * s, background: `linear-gradient(${tm.colors[0]} 50%, ${tm.colors[1]} 50%)` }} />
            <span style={{ flex: 1, color: "#ffffff" }}>{tm.name.toUpperCase()}</span>
            {tm.drivers.map((abbr) => {
              const m = race.marbles.find((x) => x.abbr === abbr);
              if (!m) return null;
              return <MarbleDot key={abbr} s={s} color={m.color} flag={flagOf(m)} size={24} />;
            })}
            <span style={{ width: 70 * s, textAlign: "right", color: "#00e676", fontSize: 20 * s }}>{r.round ? `+${r.round}` : ""}</span>
            <span style={{ width: 120 * s, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#ffcc00" }}>{r.points} PTS</span>
          </div>
        );
      })}
    </Card>
  );
}

function Row({ s, inn, pos, color, flag, name, right, extra, arrow, compact }: { s: number; inn: number; pos: number; color: string; flag?: string; name: string; right: string; extra: string; arrow?: number; compact?: boolean }) {
  const c = compact ? 0.74 : 1; // two-column cards for a twenty-marble field
  const isElim = right === "DQ" || right === "ELIM";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 * c * s, height: 46 * c * s, borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 27 * c * s, fontWeight: 800, opacity: inn * (isElim ? 0.65 : 1), transform: `translateX(${(1 - inn) * 40 * s}px)` }}>
      <span style={{ width: 38 * c * s, height: 38 * c * s, borderRadius: 9 * s, display: "flex", alignItems: "center", justifyContent: "center", background: pos === 1 ? "#ffcc00" : pos <= 3 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.08)", color: pos === 1 ? "#111216" : "#ffffff", fontSize: 22 * c * s }}>{pos}</span>
      <span style={{ width: 20 * c * s, textAlign: "center", fontSize: 19 * c * s, color: arrow ? (arrow > 0 ? "#00e676" : "#ff5252") : "transparent" }}>{arrow ? (arrow > 0 ? "▲" : "▼") : "•"}</span>
      <MarbleDot s={s} color={color} flag={flag} size={28 * c} />
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", color: "#f4f5f8" }}>{name.toUpperCase()}</span>
      <span style={{ width: 65 * c * s, textAlign: "right", color: isElim ? "#ff5252" : "#00e676", fontSize: 22 * c * s }}>{extra}</span>
      <span style={{ width: 120 * c * s, textAlign: "right", fontVariantNumeric: "tabular-nums", color: isElim ? "#ff5252" : pos === 1 ? "#ffcc00" : "rgba(255,255,255,0.85)" }}>{right}</span>
    </div>
  );
}

function Flash({ race, frame, at }: { race: Race; frame: number; at: number }) {
  const o = interpolate(frame, [at - race.sec(0.1), at, at + race.sec(0.35)], [0, 0.9, 0], clamp);
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: "white", opacity: o }} />;
}

/** "THE HAMMER" for a feature type, as the track's captions call it. */
function featureName(race: Race, type?: string) {
  const f = (race.data.features as { type: string; label: string }[]).find((g) => g.type === type);
  return f ? f.label : "a machine";
}

/**
 * Why a marble is out, on its replay: a pulsing red ring on the pad it rolled
 * over (projected into the replay's half), and the rule in one line.
 */
function DqExplainer({ race, split, h, pane, frame, s, layout, opacity }: { race: Race; split: Split; h: Highlight; pane: { x: number; y: number; w: number; h: number }; frame: number; s: number; layout: Layout; opacity: number }) {
  const view = race.splitView(split);
  const shot = view.shotAt(frame);
  const t = view.tAt(frame);
  const pads = (race.data.obstacles as unknown as { kind: string; pos: Vec3 }[]).filter((o) => o.kind === "dq");
  const at = race.marblePose(h.marble, Math.min(t, h.f)).pos;
  const pad = pads.reduce<{ kind: string; pos: Vec3 } | null>((b, o) => (b === null || dist(o.pos, at) < dist(b.pos, at) ? o : b), null);
  // The pane is the right half's canvas: the same lens as its camera rig.
  const pt = pad ? project(shot, lensFov(shot.fov, pane.w / pane.h, layout), pad.pos, pane.w, pane.h) : null;
  const pulse = 0.5 + 0.5 * Math.sin((frame / race.fps) * Math.PI * 3);
  const touched = t >= h.f;
  return (
    <>
      {pt && pt.visible && pt.x > pane.w * 0.06 && pt.x < pane.w * 0.94 && pt.y > pane.h * 0.3 && pt.y < pane.h * 0.94 && (
        <div style={{ position: "absolute", left: pane.x + pt.x, top: pane.y + pt.y, transform: "translate(-50%, -50%)", opacity }}>
          <div style={{ width: (70 + 24 * pulse) * s, height: (70 + 24 * pulse) * s, borderRadius: "50%", border: `${5 * s}px solid #e8414a`, boxShadow: `0 0 ${18 * s}px rgba(232,65,74,0.8)` }} />
          <div style={{ position: "absolute", left: "50%", top: -40 * s, transform: "translateX(-50%)", whiteSpace: "nowrap", background: "#e8414a", color: "white", fontWeight: 900, fontSize: 20 * s, padding: `${3 * s}px ${10 * s}px`, borderRadius: 6 * s }}>DRAIN</div>
        </div>
      )}
      <div style={{ position: "absolute", left: pane.x + pane.w / 2, top: pane.y + 160 * s, transform: "translateX(-50%)", opacity, width: pane.w * 0.7 }}>
        <div style={{ background: "rgba(255,255,255,0.96)", borderRadius: 14 * s, borderLeft: `${8 * s}px solid #e8414a`, padding: `${12 * s}px ${18 * s}px`, boxShadow: "0 8px 30px rgba(20,24,40,0.18)", fontSize: 24 * s, fontWeight: 800, color: "#111216", textAlign: "center" }}>
          {touched ? "Down the drain: OUT of the race" : "Watch the drain by the wall…"}
          <div style={{ fontSize: 17 * s, fontWeight: 600, opacity: 0.65, marginTop: 4 * s }}>Some machines have a drain at the foot of the wall. Roll into it and you drop out.</div>
        </div>
      </div>
    </>
  );
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
