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
      {(section === "race" || section === "replay") && (
        <div style={{ opacity: towerIn * towerOut, transform: `translateX(${(1 - towerIn) * -80 * s}px)` }}>
          <TimingTower race={race} f={f} s={p.layout === "portrait" ? s * 0.92 : s} />
        </div>
      )}
      {live && frame >= tl.raceStart && <Minimap {...p} s={s} f={f} />}
      {live && !p.split && <ShotCaption {...p} s={s} f={f} />}
      {live && p.split && <SplitGraphics race={race} split={p.split} f={f} frame={frame} s={s} layout={p.layout} width={p.width} height={p.height} />}
      {live && <Toasts race={race} f={f} s={s} layout={p.layout} />}
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
          MARBLE FORMULA CHAMPIONSHIP 2027
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
        {/* Long names (GREAT BRITAIN) shrink so the lap and clock stay on one line. */}
        <span style={{ whiteSpace: "nowrap", fontSize: (race.data.info.gp.length > 8 ? 15 : race.data.info.gp.length > 5 ? 20 : 24) * s, marginRight: 8 * s }}>{race.data.info.gp.toUpperCase()}</span>
        <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {race.LAPS > 1 && started ? <span style={{ fontSize: 15 * s, marginRight: 7 * s, color: "#3a3d46" }}>LAP {Math.min(race.LAPS, race.lapOf(race.ranking(f)[0], f) + 1)}/{race.LAPS}</span> : null}
          {started ? race.raceSeconds(f).toFixed(1) : "GRID"}
        </span>
      </div>
      <div style={{ position: "relative", height: race.N * ROW + 10 * s }}>
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
          else if (pos === 1) gap = "LEADER";
          else gap = `+${race.gapAt(i, gf).toFixed(1)}`;
          const out = race.dqBy(i, f);
          return (
            <div
              key={m.abbr}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 5 * s + slot * ROW,
                height: ROW,
                display: "flex",
                alignItems: "center",
                gap: 12 * s,
                padding: `0 ${14 * s}px`,
                fontSize: fs * s,
                fontWeight: 800,
                opacity: out ? 0.45 : 1,
                background: gained ? "#f4f8ff" : "#ffffff",
                boxShadow: `inset 0 -${1 * s}px 0 rgba(15, 17, 23, 0.05)`,
              }}
            >
              <span style={{ width: (fs + 5) * s, height: (fs + 5) * s, borderRadius: 8 * s, display: "flex", alignItems: "center", justifyContent: "center", background: pos <= 3 && !out ? ink : "transparent", color: pos <= 3 && !out ? "white" : ink, fontSize: (fs - 5) * s, fontVariantNumeric: "tabular-nums" }}>
                {pos}
              </span>
              <MarbleDot s={s} color={m.color} flag={flagOf(m)} size={big ? 20 : 24} />
              <span style={{ flex: 1 }}>{m.abbr}</span>
              {(() => {
                const tm = teamOf(m.abbr);
                return tm ? <span style={{ width: 5 * s, height: ROW * 0.55, borderRadius: 2 * s, background: `linear-gradient(${tm.colors[0]} 50%, ${tm.colors[1]} 50%)` }} /> : null;
              })()}
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

function Minimap({ race, t, s, f, layout, frame }: OverlayProps & { s: number; f: number }) {
  const size = (layout === "portrait" ? 300 : 270) * s;
  const { d, map } = outlinePath(race.data.outline, size, 18 * s);
  const order = race.ranking(f);
  const inn = spring({ frame: frame - race.timeline.raceStart, fps: race.fps, config: { damping: 18 } });
  const out = interpolate(frame, [race.timeline.replay.at - race.sec(0.3), race.timeline.replay.at], [1, 0], clamp);
  const features = race.data.features as { u: number; type: string }[];
  const samples = race.data.samples as { u: number; p: number[] }[];
  return (
    <svg width={size} height={size} style={{ position: "absolute", right: 40 * s, bottom: (layout === "portrait" ? 230 : 40) * s, background: card, borderRadius: 22 * s, boxShadow: shadow, opacity: inn * out }}>
      <path d={d} fill="none" stroke="#e3e5ea" strokeWidth={12 * s} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={ink} strokeWidth={3.5 * s} strokeLinejoin="round" />
      {features.map((ft, k) => {
        const smp = samples[Math.min(samples.length - 1, Math.max(0, Math.round((ft.u - samples[0].u) / 0.5)))];
        const [x, y] = map(smp.p[0], smp.p[2]);
        return <circle key={k} cx={x} cy={y} r={4 * s} fill={yellow} stroke={ink} strokeWidth={1.5 * s} />;
      })}
      {(() => {
        const [x, y] = map(race.data.outline[0][0], race.data.outline[0][1]);
        return <rect x={x - 6 * s} y={y - 6 * s} width={12 * s} height={12 * s} fill={ink} />;
      })()}
      {[...order].reverse().map((i) => {
        if (race.dqBy(i, f)) return null;
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
        <Chip s={s} size={28}>THE STAIRWAY</Chip>
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

function Card({ race, s, layout, children, title, frame, at, footer, columns }: { race: Race; s: number; layout: Layout; children: React.ReactNode; title: string; frame: number; at: number; footer?: React.ReactNode; columns?: number }) {
  const cols = columns ?? (race.N > 12 ? 2 : 1);
  const n = Array.isArray(children) ? children.length : 1;
  const k = spring({ frame: frame - at, fps: race.fps, config: { damping: 18 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `rgba(243,244,247,${0.55 * k})` }}>
      <div style={{ width: (layout === "portrait" ? 960 : 1000) * s, background: card, borderRadius: 30 * s, overflow: "hidden", boxShadow: "0 40px 120px rgba(20,24,40,0.25)", opacity: k, transform: `translateY(${(1 - k) * 60 * s}px)` }}>
        <div style={{ padding: `${18 * s}px ${30 * s}px`, background: yellow, fontSize: 32 * s, fontWeight: 900, letterSpacing: 1 * s }}>{title}</div>
        <div style={{ padding: `${14 * s}px ${30 * s}px ${footer ? 8 : 22}px`, display: "grid", gridAutoFlow: "column", gridTemplateColumns: cols === 2 ? "1fr 1fr" : "1fr", gridTemplateRows: `repeat(${Math.ceil((columns ? n : race.N) / cols)}, auto)`, columnGap: 30 * s }}>{children}</div>
        {footer && <div style={{ padding: `0 ${30 * s}px ${20 * s}px`, display: "flex", justifyContent: "center" }}>{footer}</div>}
      </div>
    </AbsoluteFill>
  );
}

function Results({ race, frame, s, layout }: { race: Race; frame: number; s: number; layout: Layout }) {
  const at = race.timeline.results.at;
  const results = race.data.results;
  return (
    <Card
      race={race}
      s={s}
      layout={layout}
      frame={frame}
      at={at}
      title={`${race.data.info.title.toUpperCase()} · RESULTS`}
      footer={(() => {
        const best = race.bestLapBy(race.lastFrame);
        if (!best) return null;
        const m = race.marbles[best.marble];
        return (
          <Chip s={s} bg="#b03cff" size={30}>
            <span style={{ color: "white", letterSpacing: 2 * s, fontSize: 18 * s }}>BEST LAP</span>
            <MarbleDot s={s} color={m.color} flag={flagOf(m)} size={26} />
            <span style={{ color: "white" }}>
              {m.name.toUpperCase()} · {((best.end - best.start) / race.fps).toFixed(2)}s
            </span>
          </Chip>
        );
      })()}
    >
      {results.map((r, k) => {
        const m = race.marbles[r.marble];
        const inn = spring({ frame: frame - at - race.sec(0.2) - k * race.sec(0.1), fps: race.fps, config: { damping: 18 } });
        const t0 = race.finishSeconds(results[0].marble) ?? results[0].time;
        const ti = race.finishSeconds(r.marble) ?? r.time;
        const gap = (r as { dq?: boolean }).dq ? "DQ" : ti === null ? "—" : k === 0 ? `${ti.toFixed(2)}s` : `+${(ti - t0!).toFixed(2)}`;
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
          <div key={r.team} style={{ display: "flex", alignItems: "center", gap: 14 * s, height: 50 * s, borderBottom: "1px solid #eceef2", fontSize: 26 * s, fontWeight: 800, opacity: inn, transform: `translateX(${(1 - inn) * 40 * s}px)` }}>
            <span style={{ width: 38 * s, height: 38 * s, borderRadius: 10 * s, display: "flex", alignItems: "center", justifyContent: "center", background: r.pos <= 3 ? ink : "#eef0f4", color: r.pos <= 3 ? "white" : ink, fontSize: 22 * s }}>{r.pos}</span>
            <span style={{ width: 20 * s, textAlign: "center", fontSize: 18 * s, color: moved ? (moved > 0 ? "#2fb35a" : "#e8414a") : "transparent" }}>{moved ? (moved > 0 ? "▲" : "▼") : "•"}</span>
            <span style={{ width: 10 * s, height: 34 * s, borderRadius: 3 * s, background: `linear-gradient(${tm.colors[0]} 50%, ${tm.colors[1]} 50%)` }} />
            <span style={{ flex: 1 }}>{tm.name.toUpperCase()}</span>
            {tm.drivers.map((abbr) => {
              const m = race.marbles.find((x) => x.abbr === abbr)!;
              return <MarbleDot key={abbr} s={s} color={m.color} flag={flagOf(m)} size={26} />;
            })}
            <span style={{ width: 70 * s, textAlign: "right", color: "#2fb35a", fontSize: 22 * s }}>{r.round ? `+${r.round}` : ""}</span>
            <span style={{ width: 120 * s, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.points} PTS</span>
          </div>
        );
      })}
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
