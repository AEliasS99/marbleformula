import { AbsoluteFill, interpolate, spring } from "remotion";
import { fovFor, project, type Highlight, type Layout, type Race, type Section, type Shot } from "./race";
import { flagDataUrl } from "./flags";

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
  const f = Math.round(p.t);
  const live = section === "race";
  const highlight = race.simAt(frame).highlight;
  const inHighlight = highlight !== null;
  const fps = race.fps;
  const towerIn = spring({ frame: frame - tl.lights[2], fps, config: { damping: 18 } });
  const towerOut = interpolate(frame, [tl.replay.at - race.sec(0.3), tl.replay.at], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ fontFamily: font, color: ink }}>
      {live && frame < tl.lights[2] && <IntroCard {...p} s={s} />}
      {live && frame >= tl.lights[0] - race.sec(0.3) && frame < tl.raceStart + race.sec(1) && <StartLights race={race} frame={frame} s={s} />}
      {(section === "race" || (section === "replay" && !inHighlight)) && (
        <div style={{ opacity: towerIn * towerOut, transform: `translateX(${(1 - towerIn) * -80 * s}px)` }}>
          <TimingTower race={race} f={f} s={p.layout === "portrait" ? s * 0.92 : s} />
        </div>
      )}
      {live && frame >= tl.raceStart && <Minimap {...p} s={s} />}
      {live && <ShotCaption {...p} s={s} f={f} />}
      {live && <Toasts race={race} f={f} s={s} layout={p.layout} />}
      {live && <FinishBanner race={race} f={f} s={s} layout={p.layout} />}
      {section === "replay" && !inHighlight && <ReplayGraphics race={race} frame={frame} s={s} />}
      {inHighlight && <HighlightGraphics race={race} frame={frame} s={s} highlight={race.highlights[highlight!]} />}
      {section === "results" && <Results race={race} frame={frame} s={s} layout={p.layout} />}
      {section === "standings" && <Standings race={race} frame={frame} s={s} layout={p.layout} />}
      {[...race.segments.filter((sg) => sg.kind === "replay").flatMap((sg) => [sg.at, sg.at + (sg.frames ?? 0)]), tl.replay.at, tl.results.at, tl.standings.at].map((at) => (
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
  const tl = race.timeline;
  const fps = race.fps;
  const inn = spring({ frame: frame - race.sec(0.1), fps, config: { damping: 16 } });
  const out = interpolate(frame, [tl.lights[2] - race.sec(0.4), tl.lights[2]], [1, 0], clamp);
  const portrait = layout === "portrait";
  const size = (portrait ? 300 : 280) * s;
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
      <div style={{ display: "flex", gap: 12 * s, transform: `translateY(${(1 - inn) * -30 * s}px)`, opacity: inn }}>
        <Chip s={s}>ROUND {race.data.round} / {race.data.rounds}</Chip>
        <Chip s={s} bg={card}>
          MARBLE GRAND PRIX
        </Chip>
      </div>
      <div
        style={{
          marginTop: 18 * s,
          fontSize: (portrait ? 104 : 120) * s,
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
      {!portrait && (
        <svg width={size} height={size} style={{ marginTop: 22 * s, background: card, borderRadius: 22 * s, boxShadow: shadow, opacity: inn }}>
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

function TimingTower({ race, f, s }: { race: Race; f: number; s: number }) {
  const big = race.N > 12; // twenty rows: tighter
  const ROW = (big ? 34 : 44) * s;
  const fs = big ? 20 : 25;
  const tl = race.timeline;
  const started = f >= tl.raceStart;
  const gf = f - (f % race.sec(0.25)); // the gaps refresh a few times a second
  return (
    <div style={{ position: "absolute", top: 40 * s, left: 40 * s, width: 290 * s, borderRadius: 18 * s, overflow: "hidden", background: card, boxShadow: shadow }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${10 * s}px ${16 * s}px`, background: yellow, fontSize: 24 * s, fontWeight: 900 }}>
        <span>{race.data.info.gp.toUpperCase()}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{started ? race.raceSeconds(f).toFixed(1) : "GRID"}</span>
      </div>
      <div style={{ position: "relative", height: race.N * ROW + 10 * s }}>
        {race.marbles.map((m, i) => {
          const slot = race.rowSlots[f][i];
          const pos = Math.round(slot) + 1;
          const done = race.finishedBy(i, f);
          let gap = "";
          if (!started) gap = `P${m.grid}`;
          else if (done) gap = pos === 1 ? race.finishSeconds(i)!.toFixed(2) : `+${(race.finishSeconds(i)! - race.finishSeconds(race.winner)!).toFixed(2)}`;
          else if (race.dqBy(i, f)) gap = "OUT";
          else if (pos === 1) gap = "LEADER";
          else gap = `+${race.gapAt(i, gf).toFixed(1)}`;
          const out = race.dqBy(i, f);
          return (
            <div key={m.abbr} style={{ position: "absolute", left: 0, right: 0, top: 5 * s + slot * ROW, height: ROW, display: "flex", alignItems: "center", gap: 12 * s, padding: `0 ${14 * s}px`, fontSize: fs * s, fontWeight: 800, opacity: out ? 0.45 : 1 }}>
              <span style={{ width: (fs + 5) * s, height: (fs + 5) * s, borderRadius: 8 * s, display: "flex", alignItems: "center", justifyContent: "center", background: pos <= 3 && !out ? ink : "transparent", color: pos <= 3 && !out ? "white" : ink, fontSize: (fs - 5) * s, fontVariantNumeric: "tabular-nums" }}>
                {pos}
              </span>
              <MarbleDot s={s} color={m.color} flag={flagOf(m)} size={big ? 20 : 24} />
              <span style={{ flex: 1 }}>{m.abbr}</span>
              {done && <Chequer s={s} />}
              <span style={{ fontSize: (fs - 4) * s, fontWeight: 700, color: out ? "#e8414a" : "#5b606e", fontVariantNumeric: "tabular-nums" }}>{gap}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
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

function Minimap({ race, t, s, layout, frame }: OverlayProps & { s: number }) {
  const size = (layout === "portrait" ? 300 : 270) * s;
  const { d, map } = outlinePath(race.data.outline, size, 18 * s);
  const order = race.ranking(Math.round(t));
  const inn = spring({ frame: frame - race.timeline.raceStart, fps: race.fps, config: { damping: 18 } });
  const out = interpolate(frame, [race.timeline.replay.at - race.sec(0.3), race.timeline.replay.at], [1, 0], clamp);
  const features = race.data.features as { u: number; type: string }[];
  const samples = race.data.samples as { u: number; p: number[] }[];
  return (
    <svg width={size} height={size} style={{ position: "absolute", right: 40 * s, bottom: (layout === "portrait" ? 230 : 40) * s, background: card, borderRadius: 22 * s, boxShadow: shadow, opacity: inn * out }}>
      <path d={d} fill="none" stroke="#e3e5ea" strokeWidth={12 * s} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={ink} strokeWidth={3.5 * s} strokeLinejoin="round" />
      {features.map((ft, k) => {
        const smp = samples[Math.round((ft.u - samples[0].u) / 0.5)];
        const [x, y] = map(smp.p[0], smp.p[2]);
        return <circle key={k} cx={x} cy={y} r={4 * s} fill={yellow} stroke={ink} strokeWidth={1.5 * s} />;
      })}
      {(() => {
        const [x, y] = map(race.data.outline[0][0], race.data.outline[0][1]);
        return <rect x={x - 6 * s} y={y - 6 * s} width={12 * s} height={12 * s} fill={ink} />;
      })()}
      {[...order].reverse().map((i) => {
        if (race.dqBy(i, Math.round(t))) return null;
        const { pos } = race.marblePose(i, t);
        const [x, y] = map(pos[0], pos[2]);
        const lead = i === order[0];
        const fl = flagOf(race.marbles[i]);
        const w = (lead ? 22 : 16) * s;
        const h = w / 1.5;
        return (
          <g key={i}>
            <rect x={x - w / 2 - 1.5 * s} y={y - h / 2 - 1.5 * s} width={w + 3 * s} height={h + 3 * s} rx={3 * s} fill={lead ? ink : "white"} />
            {fl ? <image href={flagDataUrl(fl)} x={x - w / 2} y={y - h / 2} width={w} height={h} preserveAspectRatio="none" /> : <circle cx={x} cy={y} r={h / 2} fill={race.marbles[i].color} />}
          </g>
        );
      })}
    </svg>
  );
}

/** Obstacle names, onboard captions, and position badges over the leaders. */
function ShotCaption({ race, shot, t, f, s, width, height, layout }: OverlayProps & { s: number; f: number }) {
  const info = race.shotInfo(f);
  const local = f - info.start;
  const k = spring({ frame: local, fps: race.fps, config: { damping: 16 } });
  const caption =
    shot.kind === "feature" && info.label ? (
      <Chip s={s} size={34}>
        {info.label}
      </Chip>
    ) : shot.kind === "onboard" && shot.marble !== null ? (
      <Chip s={s} bg={card} size={30}>
        <span style={{ fontSize: 18 * s, letterSpacing: 3 * s, color: "#5b606e" }}>ONBOARD</span>
        <MarbleDot s={s} color={race.marbles[shot.marble].color} flag={flagOf(race.marbles[shot.marble])} />
        {race.marbles[shot.marble].name.toUpperCase()} · P{race.ranking(f).indexOf(shot.marble) + 1}
      </Chip>
    ) : null;

  const badges =
    f >= race.timeline.raceStart + race.sec(1) && ["chase", "side", "top", "orbit", "lead", "feature", "finish"].includes(shot.kind)
      ? race
          .ranking(f)
          .filter((i) => !race.finishedBy(i, f))
          .slice(0, 3)
          .map((i, n) => {
            const { pos } = race.marblePose(i, t);
            const pt = project(shot, fovFor(shot.fov, layout), [pos[0], pos[1] + 0.55, pos[2]], width, height);
            if (!pt.visible) return null;
            return (
              <div key={i} style={{ position: "absolute", left: pt.x, top: pt.y - 40 * s, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 6 * s, padding: `${3 * s}px ${10 * s}px`, background: card, borderRadius: 9 * s, boxShadow: shadow, fontSize: 19 * s, fontWeight: 900, whiteSpace: "nowrap" }}>
                <span style={{ width: 20 * s, height: 20 * s, borderRadius: 6 * s, background: ink, color: "white", fontSize: 14 * s, display: "flex", alignItems: "center", justifyContent: "center" }}>{n + 1}</span>
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

function Toasts({ race, f, s, layout }: { race: Race; f: number; s: number; layout: Layout }) {
  const life = race.sec(2.5);
  const ev = [...race.events].reverse().find((e) => f >= e.frame && f < e.frame + life);
  if (!ev) return null;
  const local = f - ev.frame;
  const k = spring({ frame: local, fps: race.fps, config: { damping: 16 } });
  const out = interpolate(local, [life - race.sec(0.4), life], [1, 0], clamp);
  const a = race.marbles[ev.a];
  const b = race.marbles[ev.b];
  if ((ev as { kind: string }).kind === "dq")
    return (
      <div style={{ position: "absolute", left: layout === "portrait" ? 40 * s : 360 * s, bottom: (layout === "portrait" ? 560 : 50) * s, opacity: k * out, transform: `translateX(${(1 - k) * -60 * s}px)` }}>
        <Chip s={s} bg={card} size={28}>
          <span style={{ background: "#e8414a", color: "white", padding: `${2 * s}px ${8 * s}px`, borderRadius: 6 * s, fontSize: 18 * s }}>DISQUALIFIED</span>
          <MarbleDot s={s} color={a.color} flag={flagOf(a)} />
          {a.name.toUpperCase()}
          <span style={{ color: "#5b606e" }}>hit the red zone at the {String((ev as { feature?: string }).feature ?? "").toUpperCase()}</span>
        </Chip>
      </div>
    );
  return (
    <div style={{ position: "absolute", left: layout === "portrait" ? 40 * s : 360 * s, bottom: (layout === "portrait" ? 560 : 50) * s, opacity: k * out, transform: `translateX(${(1 - k) * -60 * s}px)` }}>
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

function FinishBanner({ race, f, s, layout }: { race: Race; f: number; s: number; layout: Layout }) {
  if (f < race.winnerFrame) return null;
  const k = spring({ frame: f - race.winnerFrame, fps: race.fps, config: { damping: 13 } });
  const m = race.marbles[race.winner];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: (layout === "portrait" ? 620 : 100) * s }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 * s, padding: `${16 * s}px ${36 * s}px`, borderRadius: 24 * s, background: yellow, boxShadow: shadow, transform: `translateY(${(1 - k) * 320 * s}px) rotate(${(1 - k) * -4}deg)` }}>
        <MarbleDot s={s} color={m.color} flag={flagOf(m)} size={64} />
        <div>
          <div style={{ fontSize: 24 * s, fontWeight: 800, letterSpacing: 6 * s }}>WINNER</div>
          <div style={{ fontSize: 84 * s, fontWeight: 900, lineHeight: 0.95, letterSpacing: -2 * s }}>{m.name.toUpperCase()}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** Mid-race instant replay: REPLAY badge, and the obstacle and marble it features. */
function HighlightGraphics({ race, frame, s, highlight }: { race: Race; frame: number; s: number; highlight: Highlight }) {
  const local = frame - highlight.at;
  const k = spring({ frame: local - race.sec(0.2), fps: race.fps, config: { damping: 16 } });
  const blink = Math.floor(frame / race.sec(0.5)) % 2 === 0;
  const m = race.marbles[highlight.marble];
  return (
    <>
      <div style={{ position: "absolute", top: 40 * s, right: 40 * s }}>
        <Chip s={s} bg={card} size={30}>
          <span style={{ width: 16 * s, height: 16 * s, borderRadius: 8 * s, background: "#e8414a", opacity: blink ? 1 : 0.3 }} />
          REPLAY <span style={{ color: "#5b606e" }}>{highlight.speed}×</span>
        </Chip>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 70 * s, display: "flex", justifyContent: "center", opacity: k, transform: `translateY(${(1 - k) * 40 * s}px)` }}>
        <Chip s={s} bg={card} size={40}>
          <span style={{ background: yellow, padding: `${2 * s}px ${10 * s}px`, borderRadius: 8 * s, fontSize: 22 * s }}>{highlight.feature.toUpperCase()}</span>
          <MarbleDot s={s} color={m.color} flag={flagOf(m)} size={34} />
          {highlight.label}
        </Chip>
      </div>
    </>
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

function Card({ race, s, layout, children, title, frame, at }: { race: Race; s: number; layout: Layout; children: React.ReactNode; title: string; frame: number; at: number }) {
  const k = spring({ frame: frame - at, fps: race.fps, config: { damping: 18 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `rgba(243,244,247,${0.55 * k})` }}>
      <div style={{ width: (layout === "portrait" ? 960 : 1000) * s, background: card, borderRadius: 30 * s, overflow: "hidden", boxShadow: "0 40px 120px rgba(20,24,40,0.25)", opacity: k, transform: `translateY(${(1 - k) * 60 * s}px)` }}>
        <div style={{ padding: `${18 * s}px ${30 * s}px`, background: yellow, fontSize: 32 * s, fontWeight: 900, letterSpacing: 1 * s }}>{title}</div>
        <div style={{ padding: `${14 * s}px ${30 * s}px ${22 * s}px`, display: "grid", gridAutoFlow: "column", gridTemplateColumns: race.N > 12 ? "1fr 1fr" : "1fr", gridTemplateRows: `repeat(${Math.ceil(race.N / (race.N > 12 ? 2 : 1))}, auto)`, columnGap: 30 * s }}>{children}</div>
      </div>
    </AbsoluteFill>
  );
}

function Results({ race, frame, s, layout }: { race: Race; frame: number; s: number; layout: Layout }) {
  const at = race.timeline.results.at;
  const results = race.data.results;
  return (
    <Card race={race} s={s} layout={layout} frame={frame} at={at} title={`${race.data.info.title.toUpperCase()} · RESULTS`}>
      {results.map((r, k) => {
        const m = race.marbles[r.marble];
        const inn = spring({ frame: frame - at - race.sec(0.2) - k * race.sec(0.1), fps: race.fps, config: { damping: 18 } });
        const gap = (r as { dq?: boolean }).dq ? "DQ" : r.time === null ? "DNF" : k === 0 ? `${r.time.toFixed(2)}s` : `+${(r.time - results[0].time!).toFixed(2)}`;
        return <Row key={r.marble} s={s} inn={inn} pos={r.pos} color={m.color} flag={flagOf(m)} name={m.name} right={gap} extra={r.points ? `+${r.points}` : ""} compact={race.N > 12} />;
      })}
    </Card>
  );
}

function Standings({ race, frame, s, layout }: { race: Race; frame: number; s: number; layout: Layout }) {
  const at = race.timeline.standings.at;
  const final = race.data.round === race.data.rounds;
  const champion = race.data.standings[0];
  const crown = spring({ frame: frame - at - race.sec(1.3), fps: race.fps, config: { damping: 12 } });
  return (
    <Card race={race} s={s} layout={layout} frame={frame} at={at} title={final ? "FINAL CHAMPIONSHIP STANDINGS" : `CHAMPIONSHIP · AFTER ROUND ${race.data.round} OF ${race.data.rounds}`}>
      {race.data.standings.map((r, k) => {
        const m = race.marbles[r.marble];
        const inn = spring({ frame: frame - at - race.sec(0.2) - k * race.sec(0.1), fps: race.fps, config: { damping: 18 } });
        const moved = r.prevPos === null ? 0 : r.prevPos - r.pos;
        const gained = race.data.results.find((x) => x.marble === r.marble)?.points ?? 0;
        return <Row key={r.marble} s={s} inn={inn} pos={r.pos} color={m.color} flag={flagOf(m)} name={m.name} right={`${r.points} PTS`} extra={gained ? `+${gained}` : ""} arrow={moved} compact={race.N > 12} />;
      })}
      {final && (
        <div style={{ marginTop: 16 * s, display: "flex", justifyContent: "center", transform: `scale(${crown})` }}>
          <Chip s={s} size={44}>
            🏆 {race.marbles[champion.marble].name.toUpperCase()} IS CHAMPION
          </Chip>
        </div>
      )}
    </Card>
  );
}

function Row({ s, inn, pos, color, flag, name, right, extra, arrow, compact }: { s: number; inn: number; pos: number; color: string; flag?: string; name: string; right: string; extra: string; arrow?: number; compact?: boolean }) {
  const c = compact ? 0.78 : 1; // two-column cards for a twenty-marble field
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 * c * s, height: 52 * c * s, borderBottom: "1px solid #eceef2", fontSize: 30 * c * s, fontWeight: 800, opacity: inn, transform: `translateX(${(1 - inn) * 40 * s}px)` }}>
      <span style={{ width: 40 * c * s, height: 40 * c * s, borderRadius: 10 * s, display: "flex", alignItems: "center", justifyContent: "center", background: pos <= 3 ? ink : "#eef0f4", color: pos <= 3 ? "white" : ink, fontSize: 24 * c * s }}>{pos}</span>
      <span style={{ width: 22 * c * s, textAlign: "center", fontSize: 20 * c * s, color: arrow ? (arrow > 0 ? "#2fb35a" : "#e8414a") : "transparent" }}>{arrow ? (arrow > 0 ? "▲" : "▼") : "•"}</span>
      <MarbleDot s={s} color={color} flag={flag} size={32 * c} />
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden" }}>{name.toUpperCase()}</span>
      <span style={{ width: 70 * c * s, textAlign: "right", color: right === "DQ" ? "#e8414a" : "#2fb35a", fontSize: 24 * c * s }}>{extra}</span>
      <span style={{ width: 130 * c * s, textAlign: "right", fontVariantNumeric: "tabular-nums", color: right === "DQ" ? "#e8414a" : ink }}>{right}</span>
    </div>
  );
}

function Flash({ race, frame, at }: { race: Race; frame: number; at: number }) {
  const o = interpolate(frame, [at - race.sec(0.1), at, at + race.sec(0.35)], [0, 0.9, 0], clamp);
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: "white", opacity: o }} />;
}
