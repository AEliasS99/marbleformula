import { useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, interpolate, spring } from "remotion";
import { project, type IntroPlan, type Layout, type Race, type Shot, type Vec3, type View } from "./race";
import { Stage } from "./Stage";
import { flyPacing, TEAM_FRAMES } from "./intro-plan.js";
import { marbleTextures, studioScene } from "./Scene";
import { flagDataUrl } from "./flags";
import { TEAMS, teamOf } from "./teams.js";
import { quality } from "./quality";

// The intro before every round (its running order: src/gp/intro-plan.js):
// a cold open on the race's best moment in slow motion, the championship's
// title over the circuit, the teams in the showroom (round 1) or what's at
// stake (later rounds), a drone lap with a card for every obstacle, and a
// walk along the grid. Its simulation clock counts up to 0, the race's first
// frame: the marbles wait on the grid while the machines already turn.

const font = "'Avenir Next', 'Montserrat', 'Helvetica Neue', system-ui, sans-serif";
const ink = "#111216";
const card = "rgba(255,255,255,0.96)";
const yellow = "#ffcc00";
const red = "#e10600";
const shadow = "0 8px 30px rgba(20,24,40,0.18)";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** What the commentator would say about each obstacle, and how dangerous it is (1-5). */
const BLURBS: Record<string, { line: string; danger: number }> = {
  vortex: { line: "A spiral drain. Round and round, faster and faster, then down the hole.", danger: 4 },
  drop: { line: "The floor falls away and the pack flies off the edge.", danger: 2 },
  jump: { line: "A kicker and a long fall: real flight.", danger: 3 },
  hammer: { line: "A pendulum axe over half the track. Time it, dodge it, or get smashed.", danger: 5 },
  regroup: { line: "The gate holds the leaders until the pack catches up. Then it lifts.", danger: 2 },
  spinner: { line: "A rotor with hooks that grabs marbles and flings them out.", danger: 4 },
  turntable: { line: "A spinning disc with ribs that throws marbles off their line.", danger: 3 },
  lift: { line: "A chain lift carries the field up a level.", danger: 1 },
  bumpers: { line: "Pinball bumpers: ricochets everywhere.", danger: 3 },
  pegs: { line: "A forest of chrome pegs. Find the gap.", danger: 2 },
  splitter: { line: "A fin splits the field left and right.", danger: 2 },
  rollers: { line: "Spinning rollers: a boost for some, a kick sideways for others.", danger: 3 },
  fan: { line: "Gusts of wind across the track.", danger: 3 },
  bumps: { line: "Bumps that make the marbles hop.", danger: 1 },
  pusher: { line: "A ram that sweeps across the track.", danger: 4 },
  elevator: { line: "Two cabins carry the field back up for the next lap. First come, first served.", danger: 2 },
  dq: { line: "Touch a red pad beside a machine and you are out of the race.", danger: 5 },
};

type Sample = { u: number; p: Vec3; t: Vec3; r: Vec3; n: Vec3; w?: number };
const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const smooth = (x: number) => x * x * (3 - 2 * x);
const shot = (pos: Vec3, target: Vec3, fov: number, kind: string, marble: number | null = null): Shot => ({ pos, target, fov, kind, marble });

/** The scene showing at an intro frame. */
const sceneAt = (plan: IntroPlan, frame: number) => {
  let sc = plan.scenes[0];
  for (const s of plan.scenes) if (frame >= s.at) sc = s;
  return sc;
};

/** One View per scene, all on the intro's video frames. */
function introViews(race: Race, plan: IntroPlan) {
  const samples = race.data.samples as unknown as Sample[];
  const u0 = samples[0].u;
  const P = (u: number): Vec3 => {
    const x = Math.max(0, Math.min(samples.length - 1.001, (u - u0) / 0.5));
    const k = Math.floor(x);
    const a = x - k;
    const A = samples[k].p;
    const B = samples[k + 1].p;
    return [A[0] + (B[0] - A[0]) * a, A[1] + (B[1] - A[1]) * a, A[2] + (B[2] - A[2]) * a];
  };
  const mean = (from: number, to: number) => {
    const acc: Vec3 = [0, 0, 0];
    const n = 9;
    for (let k = 0; k < n; k++) {
      const p = P(from + ((to - from) * k) / (n - 1));
      acc[0] += p[0] / n;
      acc[1] += p[1] / n;
      acc[2] += p[2] / n;
    }
    return acc;
  };
  const at = Object.fromEntries(plan.scenes.map((s) => [s.id, s]));
  // Before the race the clock counts up to 0.
  const clock = (vf: number) => vf - plan.total;
  const views: Record<string, View> = {};

  if (at.cold && plan.highlight !== null) {
    const h = race.highlights[plan.highlight];
    const hc = (race.data.highlightCams as number[][][])[plan.highlight];
    const from = plan.coldFrom ?? h.from;
    const tAt = (vf: number) => Math.min(h.to, from + (vf - at.cold.at) * h.speed);
    views.cold = {
      tAt,
      shotAt: (vf) => {
        const x = Math.max(0, Math.min(hc.length - 1.001, tAt(vf) - h.from));
        const k = Math.floor(x);
        const A = hc[k];
        const B = hc[k + 1];
        const m = (i: number) => A[i] + (B[i] - A[i]) * (x - k);
        return shot([m(0), m(1), m(2)], [m(3), m(4), m(5)], m(6), "highlight", h.marble);
      },
    };
  }
  // The drone over the whole circuit.
  const c = race.data.heli.center as Vec3;
  const e = race.data.heli.extent;
  const drone = (sc: { at: number; frames: number }, a0: number, a1: number, h0: number, h1: number): View => ({
    tAt: clock,
    shotAt: (vf) => {
      const p = Math.max(0, Math.min(1, (vf - sc.at) / sc.frames));
      const a = a0 + (a1 - a0) * p;
      const hh = h0 + (h1 - h0) * p;
      return shot([c[0] + Math.sin(a) * e * 0.62, c[1] + e * hh, c[2] + Math.cos(a) * e * 0.62], c, 40, "drone");
    },
  });
  views.title = drone(at.title, 2.0, 2.35, 0.52, 0.42);
  if (at.stakes) views.stakes = drone(at.stakes, 3.4, 3.8, 0.4, 0.36);

  // The drone lap: low and slow over every obstacle, high and quick between them.
  const fly = at.flyover;
  const pace = flyPacing(plan.L, plan.cards, fly.frames);
  views.flyover = {
    tAt: clock,
    shotAt: (vf) => {
      const u = pace.uAt(vf - fly.at);
      const slow = pace.slow(u);
      const behind = 9 + 5 * (1 - slow);
      const pos = add(mean(u - behind - 4, u - behind + 4), [0, 1, 0], 3.2 + 8 * (1 - slow));
      const target = add(mean(u + 2, u + 10), [0, 1, 0], 0.3);
      return shot(pos, target, 44, "flyover");
    },
  };

  // Along the grid, from the far side to the pole sitter.
  const g = gridGeometry(race);
  const line = at.lineup;
  views.lineup = {
    tAt: clock,
    shotAt: (vf) => {
      const p = (vf - line.at) / line.frames;
      const lat = g.latFrom + (g.pole.lat - g.latFrom) * smooth(Math.max(0, Math.min(1, (p - 0.04) / 0.72)));
      const push = smooth(Math.max(0, Math.min(1, (p - 0.78) / 0.22)));
      const ahead = g.front + 3.8 - 1.4 * push;
      const pos = add(add(add(g.c, g.t, ahead), g.r, lat), [0, 1, 0], 1.8 - 0.5 * push);
      const target = add(add(add(g.c, g.t, g.front - 0.7), g.r, lat * 0.96), [0, 1, 0], 0.1);
      return shot(pos, target, 30 - 4 * push, "lineup");
    },
  };
  return views;
}

/** The grid at the start: its centre, axes, and each marble's place across and along it. */
function gridGeometry(race: Race) {
  const samples = race.data.samples as unknown as Sample[];
  const f0 = (race.data.frames as number[][][])[0];
  const c: Vec3 = [0, 0, 0];
  f0.forEach((m) => {
    c[0] += m[0] / f0.length;
    c[1] += m[1] / f0.length;
    c[2] += m[2] / f0.length;
  });
  const uMid = f0.reduce((a, m) => a + m[7], 0) / f0.length;
  const s = samples[Math.max(0, Math.min(samples.length - 1, Math.round((uMid - samples[0].u) / 0.5)))];
  const t: Vec3 = [s.t[0], 0, s.t[2]];
  const tl = Math.hypot(t[0], t[2]) || 1;
  t[0] /= tl;
  t[2] /= tl;
  const r: Vec3 = [-t[2], 0, t[0]];
  const place = f0.map((m, i) => {
    const d: Vec3 = [m[0] - c[0], m[1] - c[1], m[2] - c[2]];
    return { i, lat: d[0] * r[0] + d[2] * r[2], long: d[0] * t[0] + d[2] * t[2], pos: [m[0], m[1], m[2]] as Vec3 };
  });
  const front = Math.max(...place.map((q) => q.long));
  // Grid slots are 1-based: the pole sitter has the lowest.
  const poleIdx = race.marbles.reduce((b, m, i) => (m.grid < race.marbles[b].grid ? i : b), 0);
  const pole = place[poleIdx];
  const wide = Math.max(...place.map((q) => Math.abs(q.lat)));
  return { c, t, r, place, front, pole, latFrom: -Math.sign(pole.lat || 1) * wide * 1.05 };
}

// --- The showroom (round 1) ----------------------------------------------------------

function ShowroomScene({ race, k, x, portrait }: { race: Race; k: number; x: number; portrait: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useMemo(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    const pmrem = new THREE.PMREMGenerator(gl);
    scene.environment = pmrem.fromScene(studioScene(), 0.02, 0.1, 200, { size: 512 }).texture;
    scene.background = new THREE.Color("#0b0d12");
    scene.fog = new THREE.Fog("#0b0d12", 8, 22);
  }, [gl, scene]);
  const team = TEAMS[k];
  const idx = team.drivers.map((abbr) => race.marbles.findIndex((m) => (m as { abbr?: string }).abbr === abbr));
  const tex = useMemo(() => idx.map((i) => (i >= 0 ? marbleTextures(race.marbles[i].name, (race.marbles[i] as { flag?: string }).flag ?? "", (race.marbles[i] as { color?: string }).color) : null)), [k]);
  const R = race.data.marbleRadius;
  const p = x / TEAM_FRAMES;
  // A slow arc round the podium, pushing in; the marbles sit right of the
  // team's card (above it, in portrait).
  const a = -0.45 + 0.8 * p;
  const d = (portrait ? 6.2 : 4.4) - 0.5 * p;
  camera.fov = 28;
  camera.near = 0.05;
  camera.far = 60;
  camera.updateProjectionMatrix();
  const side = portrait ? 0 : -0.95;
  const look = new THREE.Vector3(side * Math.cos(a), portrait ? -0.15 : 0.35, -side * Math.sin(a));
  camera.position.set(look.x + Math.sin(a) * d, 1.15 + 0.1 * p, look.z + Math.cos(a) * d);
  camera.lookAt(look);
  const spin = (x / 60) * 1.4;
  const c0 = new THREE.Color(team.colors[0]);
  const c1 = new THREE.Color(team.colors[1]);
  return (
    <>
      <spotLight position={[1.5, 5, 3]} angle={0.45} penumbra={0.7} intensity={60} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.02} />
      <pointLight position={[-2.2, 1.2, -1.8]} color={c0} intensity={10} distance={8} />
      <pointLight position={[2.2, 1.2, -1.8]} color={c1.getHSL({ h: 0, s: 0, l: 0 }).l < 0.15 ? c0 : c1} intensity={8} distance={8} />
      <ambientLight intensity={0.08} />
      {/* Floor and podium */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[20, 96]} />
        <meshStandardMaterial color="#0f1116" roughness={0.3} metalness={0.5} />
      </mesh>
      <group rotation={[0, spin * 0.25, 0]}>
        <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[1.25, 1.32, 0.2, 96]} />
          <meshStandardMaterial color="#22252d" roughness={0.25} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.203, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.05, 1.18, 96]} />
          <meshStandardMaterial color={c0} emissive={c0} emissiveIntensity={1.6} roughness={0.4} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
        <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.315, 0.012, 8, 128]} />
          <meshStandardMaterial color={c0} emissive={c0} emissiveIntensity={2.4} />
        </mesh>
      </group>
      {idx.map((i, j) =>
        i < 0 || !tex[j] ? null : (
          <mesh key={`${k}-${j}`} position={[j === 0 ? -0.48 : 0.48, 0.2 + R, 0]} rotation={[0.25, spin + j * Math.PI, 0.1]} castShadow>
            <sphereGeometry args={[R, 96, 64]} />
            <meshPhysicalMaterial map={tex[j]!.map} metalnessMap={tex[j]!.mr} roughnessMap={tex[j]!.mr} metalness={1} roughness={1} clearcoat={0.55} clearcoatRoughness={0.28} envMapIntensity={1.3} />
          </mesh>
        ),
      )}
    </>
  );
}

function Showroom({ race, frame, width, height }: { race: Race; frame: number; width: number; height: number }) {
  const k = Math.min(TEAMS.length - 1, Math.floor(frame / TEAM_FRAMES));
  return (
    <ThreeCanvas width={width} height={height} dpr={quality().dpr} shadows gl={{ antialias: true, alpha: false }}>
      <ShowroomScene race={race} k={k} x={frame - k * TEAM_FRAMES} portrait={height > width} />
    </ThreeCanvas>
  );
}

// --- Graphics -------------------------------------------------------------------------

const Flag = ({ code, h }: { code: string; h: number }) => (
  <img src={flagDataUrl(code, 96, 64)} style={{ height: h, width: h * 1.5, borderRadius: h * 0.12, boxShadow: "0 1px 3px rgba(0,0,0,0.35)", objectFit: "cover" }} />
);

const Chip = ({ s, children, bg = yellow, color = ink, size = 26 }: { s: number; children: React.ReactNode; bg?: string; color?: string; size?: number }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 10 * s, padding: `${6 * s}px ${14 * s}px`, borderRadius: 10 * s, background: bg, color, fontSize: size * s, fontWeight: 800, boxShadow: shadow, whiteSpace: "nowrap", letterSpacing: 1 * s }}>
    {children}
  </span>
);

const Danger = ({ s, n }: { s: number; n: number }) => (
  <span style={{ display: "inline-flex", gap: 4 * s, alignItems: "center" }}>
    {[1, 2, 3, 4, 5].map((k) => (
      <span key={k} style={{ width: 18 * s, height: 10 * s, borderRadius: 2 * s, background: k <= n ? (n >= 5 ? red : n >= 4 ? "#ff6a00" : yellow) : "rgba(17,18,22,0.14)" }} />
    ))}
  </span>
);

function ColdGraphics({ race, plan, x, s, width, height }: { race: Race; plan: IntroPlan; x: number; s: number; width: number; height: number }) {
  const fps = race.fps;
  const bar = height * 0.085 * interpolate(x, [0, 12], [0, 1], clamp);
  const h = race.highlights[plan.highlight!];
  const inn = spring({ frame: x - 8, fps, config: { damping: 16 } });
  const what = BLURBS[h.feature] ? (race.data.features as { type: string; label: string }[]).find((f) => f.type === h.feature)?.label ?? "" : "";
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 0, width, height: bar, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, bottom: 0, width, height: bar, background: "#000" }} />
      <div style={{ position: "absolute", left: 60 * s, top: bar + 34 * s, display: "flex", gap: 12 * s, opacity: inn, transform: `translateX(${(1 - inn) * -40 * s}px)` }}>
        <Chip s={s} bg={red} color="#fff" size={30}>
          COMING UP
        </Chip>
        {what && (
          <Chip s={s} bg={card} size={30}>
            {what}
          </Chip>
        )}
      </div>
      <div style={{ position: "absolute", right: 60 * s, top: bar + 34 * s, opacity: inn }}>
        <Chip s={s} bg="rgba(17,18,22,0.75)" color="#fff" size={24}>
          {`SLOW MOTION ×${Math.round(1 / h.speed * 10) / 10}`}
        </Chip>
      </div>
    </>
  );
}

function TitleGraphics({ race, x, frames, s, layout }: { race: Race; x: number; frames: number; s: number; layout: Layout }) {
  const fps = race.fps;
  const info = race.data.info as { gp: string; title: string; circuit: string; location: string; flag: string[] };
  const a = spring({ frame: x - 4, fps, config: { damping: 13, mass: 0.8 } });
  const b = spring({ frame: x - 14, fps, config: { damping: 13 } });
  const yr = spring({ frame: x - 26, fps, config: { damping: 9, stiffness: 140 } });
  const sub = spring({ frame: x - 70, fps, config: { damping: 16 } });
  const out = interpolate(x, [frames - 14, frames], [1, 0], clamp);
  const round = (race.data as { round?: number }).round ?? 1;
  const rounds = (race.data as { rounds?: number }).rounds ?? 1;
  const big = layout === "landscape" ? 1 : 0.78;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out, background: `radial-gradient(ellipse at center, rgba(10,12,18,${0.55 * a}) 0%, rgba(10,12,18,${0.2 * a}) 70%)` }}>
      <div style={{ textAlign: "center", color: "#fff", textShadow: "0 6px 30px rgba(0,0,0,0.45)" }}>
        <div style={{ fontSize: 118 * s * big, fontWeight: 900, letterSpacing: 4 * s, lineHeight: 1, transform: `translateY(${(1 - a) * 40 * s}px)`, opacity: a }}>MARBLE FORMULA</div>
        <div style={{ fontSize: 58 * s * big, fontWeight: 700, letterSpacing: 26 * s * big, marginTop: 10 * s, opacity: b, transform: `scaleX(${0.8 + 0.2 * b})` }}>CHAMPIONSHIP</div>
        <div style={{ fontSize: 150 * s * big, fontWeight: 900, color: yellow, lineHeight: 1, marginTop: 14 * s, transform: `scale(${0.6 + 0.4 * yr})`, opacity: Math.min(1, yr * 1.5) }}>2027</div>
        <div style={{ marginTop: 36 * s, opacity: sub, transform: `translateY(${(1 - sub) * 24 * s}px)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 14 * s }}>
          <Chip s={s} size={30}>{`ROUND ${round} OF ${rounds}`}</Chip>
          <div style={{ fontSize: 56 * s * big, fontWeight: 900 }}>{info.title.toUpperCase()}</div>
          <div style={{ display: "flex", gap: 0, height: 8 * s, width: 320 * s }}>
            {info.flag.map((c) => (
              <div key={c} style={{ flex: 1, background: c }} />
            ))}
          </div>
          <div style={{ fontSize: 30 * s, fontWeight: 600, opacity: 0.92 }}>{info.circuit}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function TeamGraphics({ race, x, s, layout, width }: { race: Race; x: number; s: number; layout: Layout; width: number }) {
  const fps = race.fps;
  const k = Math.min(TEAMS.length - 1, Math.floor(x / TEAM_FRAMES));
  const lx = x - k * TEAM_FRAMES;
  const team = TEAMS[k];
  const inn = spring({ frame: lx - 3, fps, config: { damping: 15 } });
  const d1 = spring({ frame: lx - 12, fps, config: { damping: 15 } });
  const d2 = spring({ frame: lx - 18, fps, config: { damping: 15 } });
  const out = interpolate(lx, [TEAM_FRAMES - 8, TEAM_FRAMES], [1, 0], clamp);
  const land = layout === "landscape";
  const driver = (abbr: string, sp: number) => {
    const m = race.marbles.find((mm) => (mm as { abbr?: string }).abbr === abbr);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 16 * s, opacity: sp, transform: `translateX(${(1 - sp) * -30 * s}px)` }}>
        <Flag code={(m as { flag?: string } | undefined)?.flag ?? abbr} h={40 * s} />
        <span style={{ fontSize: 44 * s, fontWeight: 800 }}>{m?.name ?? abbr}</span>
        <span style={{ fontSize: 26 * s, fontWeight: 700, opacity: 0.6 }}>{abbr}</span>
      </div>
    );
  };
  return (
    <>
      <div style={{ position: "absolute", left: 60 * s, top: 50 * s, display: "flex", gap: 12 * s }}>
        <Chip s={s}>THE TEAMS · 2027</Chip>
        <Chip s={s} bg={card}>{`${k + 1} / ${TEAMS.length}`}</Chip>
      </div>
      <div
        style={{
          position: "absolute",
          left: 60 * s,
          ...(land ? { top: "50%", transform: `translateY(-50%) translateX(${(1 - inn) * -60 * s}px)` } : { bottom: 120 * s, transform: `translateX(${(1 - inn) * -60 * s}px)` }),
          width: land ? Math.min(760 * s, width * 0.42) : width - 120 * s,
          opacity: inn * out,
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", height: 10 * s, width: 220 * s, marginBottom: 18 * s }}>
          {team.colors.map((c) => (
            <div key={c} style={{ flex: 1, background: c }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 * s }}>
          <span style={{ fontSize: 30 * s, fontWeight: 900, padding: `${4 * s}px ${12 * s}px`, borderRadius: 8 * s, background: team.colors[0], color: new THREE.Color(team.colors[0]).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6 ? ink : "#fff" }}>{team.short}</span>
        </div>
        <div style={{ fontSize: 84 * s, fontWeight: 900, lineHeight: 1.02, marginTop: 14 * s, textShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>{team.name.toUpperCase()}</div>
        <div style={{ fontSize: 32 * s, fontStyle: "italic", fontWeight: 500, opacity: 0.85, marginTop: 10 * s }}>{team.story}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 * s, marginTop: 30 * s }}>
          {driver(team.drivers[0], d1)}
          {driver(team.drivers[1], d2)}
        </div>
      </div>
    </>
  );
}

function StakesGraphics({ race, x, frames, s, layout, width }: { race: Race; x: number; frames: number; s: number; layout: Layout; width: number }) {
  const fps = race.fps;
  const inn = spring({ frame: x - 6, fps, config: { damping: 16 } });
  const out = interpolate(x, [frames - 12, frames], [1, 0], clamp);
  const round = (race.data as { round?: number }).round ?? 1;
  const drivers = ((race.data as { standingsBefore?: { marble: number; points: number; pos: number }[] }).standingsBefore ?? []).slice(0, 5);
  const teams = ((race.data as { constructorsBefore?: { team: string; points: number; pos: number }[] }).constructorsBefore ?? []).slice(0, 5);
  const land = layout === "landscape";
  const row = (k: number, left: React.ReactNode, pts: number) => {
    const sp = spring({ frame: x - 14 - k * 4, fps, config: { damping: 16 } });
    return (
      <div key={k} style={{ display: "flex", alignItems: "center", gap: 14 * s, height: 56 * s, borderTop: k ? "1px solid rgba(17,18,22,0.08)" : "none", opacity: sp, transform: `translateX(${(1 - sp) * 20 * s}px)` }}>
        <span style={{ width: 34 * s, fontSize: 28 * s, fontWeight: 900, textAlign: "right" }}>{k + 1}</span>
        {left}
        <span style={{ marginLeft: "auto", fontSize: 28 * s, fontWeight: 900 }}>{pts}</span>
        <span style={{ fontSize: 18 * s, fontWeight: 700, opacity: 0.5 }}>PTS</span>
      </div>
    );
  };
  const panel = (title: string, children: React.ReactNode) => (
    <div style={{ background: card, borderRadius: 16 * s, boxShadow: shadow, padding: `${20 * s}px ${26 * s}px`, width: land ? 560 * s : width - 120 * s }}>
      <div style={{ fontSize: 22 * s, fontWeight: 800, letterSpacing: 2 * s, opacity: 0.55, marginBottom: 8 * s }}>{title}</div>
      {children}
    </div>
  );
  return (
    <AbsoluteFill style={{ fontFamily: font, color: ink, opacity: out }}>
      <div style={{ position: "absolute", left: 60 * s, top: 50 * s, opacity: inn }}>
        <Chip s={s} size={30}>{`WHAT'S AT STAKE · BEFORE ROUND ${round}`}</Chip>
      </div>
      <div style={{ position: "absolute", left: 60 * s, top: 130 * s, display: "flex", flexDirection: land ? "row" : "column", gap: 30 * s, opacity: inn, transform: `translateY(${(1 - inn) * 30 * s}px)` }}>
        {panel(
          "DRIVERS",
          drivers.map((d, k) => {
            const m = race.marbles[d.marble] as { name: string; abbr?: string; flag?: string };
            const tm = teamOf(m.abbr ?? "");
            return row(
              k,
              <>
                <span style={{ width: 6 * s, height: 34 * s, borderRadius: 3 * s, background: tm?.colors[0] ?? "#999" }} />
                <Flag code={m.flag ?? ""} h={30 * s} />
                <span style={{ fontSize: 30 * s, fontWeight: 800 }}>{m.name}</span>
              </>,
              d.points,
            );
          }),
        )}
        {panel(
          "CONSTRUCTORS",
          teams.map((c, k) => {
            const tm = TEAMS.find((tt) => tt.id === c.team);
            return row(
              k,
              <>
                <span style={{ display: "flex", width: 40 * s, height: 26 * s, borderRadius: 4 * s, overflow: "hidden" }}>
                  {(tm?.colors ?? ["#999", "#666"]).map((cc) => (
                    <span key={cc} style={{ flex: 1, background: cc }} />
                  ))}
                </span>
                <span style={{ fontSize: 30 * s, fontWeight: 800 }}>{tm?.name ?? c.team}</span>
              </>,
              c.points,
            );
          }),
        )}
      </div>
    </AbsoluteFill>
  );
}

function FlyoverGraphics({ race, plan, x, s, layout, width }: { race: Race; plan: IntroPlan; x: number; s: number; layout: Layout; width: number }) {
  const fps = race.fps;
  const info = race.data.info as { circuit: string; location: string; realLength: number; laps?: number; gp: string };
  const land = layout === "landscape";
  const head = spring({ frame: x - 6, fps, config: { damping: 16 } });
  const headOut = interpolate(x, [150, 166], [1, 0], clamp);
  const n = plan.cards.length;
  const cur = plan.cards.findIndex((c) => x >= c.from && x < c.to);
  const c = cur >= 0 ? plan.cards[cur] : null;
  const inn = c ? spring({ frame: x - c.from, fps, config: { damping: 15 } }) : 0;
  const out = c ? interpolate(x, [c.to - 8, c.to], [1, 0], clamp) : 0;
  const b = c ? BLURBS[c.type] ?? { line: "", danger: 2 } : null;
  return (
    <AbsoluteFill style={{ fontFamily: font, color: ink }}>
      <div style={{ position: "absolute", left: 60 * s, top: 50 * s, opacity: head * headOut, transform: `translateY(${(1 - head) * -20 * s}px)` }}>
        <div style={{ background: card, borderRadius: 16 * s, boxShadow: shadow, padding: `${18 * s}px ${26 * s}px` }}>
          <div style={{ fontSize: 22 * s, fontWeight: 800, letterSpacing: 2 * s, opacity: 0.55 }}>THE CIRCUIT</div>
          <div style={{ fontSize: 44 * s, fontWeight: 900, marginTop: 4 * s }}>{info.circuit}</div>
          <div style={{ display: "flex", gap: 10 * s, marginTop: 12 * s }}>
            <Chip s={s} size={22}>{`${(info.realLength / 1000).toFixed(3)} KM`}</Chip>
            <Chip s={s} size={22} bg={ink} color="#fff">{`${info.laps ?? race.LAPS} LAPS`}</Chip>
            <Chip s={s} size={22} bg={red} color="#fff">{`${plan.cards.reduce((a, cc) => a + cc.count, 0)} OBSTACLES`}</Chip>
          </div>
        </div>
      </div>
      {c && b && (
        <div
          style={{
            position: "absolute",
            left: 60 * s,
            bottom: (land ? 70 : 180) * s,
            width: land ? 720 * s : width - 120 * s,
            opacity: inn * out,
            transform: `translateX(${(1 - inn) * -50 * s}px)`,
          }}
        >
          <div style={{ display: "flex", gap: 10 * s, marginBottom: 10 * s }}>
            <Chip s={s} size={20} bg={ink} color="#fff">{`OBSTACLE ${cur + 1} / ${n}`}</Chip>
            {c.count > 1 && <Chip s={s} size={20}>{`×${c.count} PER LAP`}</Chip>}
          </div>
          <div style={{ background: card, borderRadius: 16 * s, boxShadow: shadow, padding: `${18 * s}px ${26 * s}px`, borderLeft: `${10 * s}px solid ${c.type === "dq" ? red : yellow}` }}>
            <div style={{ fontSize: 54 * s, fontWeight: 900, lineHeight: 1.05 }}>{c.label}</div>
            <div style={{ fontSize: 28 * s, fontWeight: 500, marginTop: 8 * s, lineHeight: 1.3 }}>{b.line}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 * s, marginTop: 14 * s }}>
              <span style={{ fontSize: 18 * s, fontWeight: 800, letterSpacing: 2 * s, opacity: 0.55 }}>DANGER</span>
              <Danger s={s} n={b.danger} />
            </div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
}

function LineupGraphics({ race, view, frame, x, frames, s, layout, width, height }: { race: Race; view: View; frame: number; x: number; frames: number; s: number; layout: Layout; width: number; height: number }) {
  const fps = race.fps;
  const g = useMemo(() => gridGeometry(race), [race]);
  const sh = view.shotAt(frame);
  const aspect = width / height;
  const k = Math.min(1.9, Math.max(1, Math.sqrt(16 / 9 / Math.max(0.3, aspect))));
  const fov = (2 * Math.atan(Math.tan((sh.fov * Math.PI) / 360) * k) * 180) / Math.PI;
  const round = (race.data as { round?: number }).round ?? 1;
  const before = (race.data as { standingsBefore?: { marble: number; points: number; pos: number }[] }).standingsBefore ?? [];
  const inn = spring({ frame: x - 6, fps, config: { damping: 16 } });
  const out = interpolate(x, [frames - 10, frames], [1, 0], clamp);
  // Where the camera is across the grid: the lane under it gets the lower third.
  const camLat = (sh.pos[0] - g.c[0]) * g.r[0] + (sh.pos[2] - g.c[2]) * g.r[2];
  const lane = g.place.filter((q) => Math.abs(q.lat - camLat) < 0.45).sort((a, b) => race.marbles[a.i].grid - race.marbles[b.i].grid);
  const atPole = x > frames * 0.8;
  const laneKey = lane.map((q) => q.i).join(",");
  // Re-spring the lower third whenever its lane changes: find when this lane began.
  let since = x;
  for (let b = x; b >= 0; b -= 2) {
    const s2 = view.shotAt(frame - (x - b));
    const cl = (s2.pos[0] - g.c[0]) * g.r[0] + (s2.pos[2] - g.c[2]) * g.r[2];
    const key = g.place.filter((q) => Math.abs(q.lat - cl) < 0.45).sort((a, b2) => race.marbles[a.i].grid - race.marbles[b2.i].grid).map((q) => q.i).join(",");
    if (key !== laneKey) break;
    since = b;
  }
  const lt = spring({ frame: x - since, fps, config: { damping: 18, stiffness: 220 } });
  const land = layout === "landscape";
  const tagFor = (i: number) => {
    const m = race.marbles[i] as { name: string; abbr?: string; flag?: string; grid: number };
    const q = g.place[i];
    const pt = project(sh, fov, [q.pos[0], q.pos[1] + race.data.marbleRadius * 1.25, q.pos[2]], width, height);
    const dist = Math.hypot(q.pos[0] - sh.pos[0], q.pos[1] - sh.pos[1], q.pos[2] - sh.pos[2]);
    if (!pt.visible || dist > 7) return null;
    const sc = Math.max(0.7, Math.min(1.15, 3.6 / dist));
    const pole = m.grid === race.marbles[g.pole.i].grid;
    return (
      <div key={i} style={{ position: "absolute", left: pt.x, top: pt.y, transform: `translate(-50%, -100%) scale(${sc})`, transformOrigin: "50% 100%", opacity: inn * out }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 * s, padding: `${3 * s}px ${8 * s}px`, borderRadius: 6 * s, background: pole ? yellow : card, fontSize: 20 * s, fontWeight: 900, color: ink, boxShadow: shadow }}>
          {`P${m.grid}`}
          <span style={{ fontWeight: 700, opacity: 0.7 }}>{m.abbr}</span>
        </span>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ fontFamily: font, color: ink }}>
      {race.marbles.map((_, i) => tagFor(i))}
      <div style={{ position: "absolute", left: 60 * s, top: 50 * s, opacity: inn * out, display: "flex", gap: 12 * s }}>
        <Chip s={s} size={30}>STARTING GRID</Chip>
        {atPole && (
          <Chip s={s} size={30} bg={ink} color={yellow}>
            POLE POSITION
          </Chip>
        )}
      </div>
      <div style={{ position: "absolute", left: 60 * s, bottom: (land ? 70 : 180) * s, display: "flex", flexDirection: "column", gap: 10 * s, opacity: lt * out, transform: `translateX(${(1 - lt) * -40 * s}px)` }}>
        {lane.map((q) => {
          const m = race.marbles[q.i] as { name: string; abbr?: string; flag?: string; grid: number };
          const tm = teamOf(m.abbr ?? "");
          const st = before.find((b) => b.marble === q.i);
          return (
            <div key={q.i} style={{ display: "flex", alignItems: "center", gap: 16 * s, background: card, borderRadius: 14 * s, boxShadow: shadow, padding: `${12 * s}px ${22 * s}px ${12 * s}px 0`, overflow: "hidden", minWidth: 560 * s }}>
              <span style={{ alignSelf: "stretch", width: 12 * s, background: tm?.colors[0] ?? "#999" }} />
              <span style={{ fontSize: 46 * s, fontWeight: 900, width: 92 * s, textAlign: "center", color: q.i === g.pole.i ? "#b38f00" : ink }}>{`P${m.grid}`}</span>
              <Flag code={m.flag ?? ""} h={40 * s} />
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 38 * s, fontWeight: 900, lineHeight: 1.05 }}>{m.name}</span>
                <span style={{ fontSize: 22 * s, fontWeight: 700, opacity: 0.6 }}>{tm?.name ?? ""}</span>
              </span>
              {round > 1 && st && (
                <span style={{ marginLeft: "auto", textAlign: "right", paddingLeft: 20 * s }}>
                  <span style={{ display: "block", fontSize: 30 * s, fontWeight: 900 }}>{`${st.points} PTS`}</span>
                  <span style={{ display: "block", fontSize: 18 * s, fontWeight: 700, opacity: 0.55 }}>{`${st.pos}${["", "ST", "ND", "RD"][st.pos] ?? "TH"} IN THE STANDINGS`}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

export function Intro({ race, layout, frame, width, height }: { race: Race; layout: Layout; frame: number; width: number; height: number }) {
  const plan = race.intro!;
  const views = useMemo(() => introViews(race, plan), [race]);
  const sc = sceneAt(plan, frame);
  const x = frame - sc.at;
  const s = Math.min(width, height) / 1080;
  // A white flash on every cut between scenes.
  const flash = sc.at > 0 ? interpolate(x, [0, 10], [0.85, 0], clamp) : 0;
  const view = views[sc.id];
  return (
    <AbsoluteFill style={{ fontFamily: font }}>
      {sc.id === "teams" ? <Showroom race={race} frame={x} width={width} height={height} /> : <Stage key={sc.id} race={race} view={view} layout={layout} frame={frame} width={width} height={height} />}
      <AbsoluteFill style={{ fontFamily: font, color: ink }}>
        {sc.id === "cold" && <ColdGraphics race={race} plan={plan} x={x} s={s} width={width} height={height} />}
        {sc.id === "title" && <TitleGraphics race={race} x={x} frames={sc.frames} s={s} layout={layout} />}
        {sc.id === "teams" && <TeamGraphics race={race} x={x} s={s} layout={layout} width={width} />}
        {sc.id === "stakes" && <StakesGraphics race={race} x={x} frames={sc.frames} s={s} layout={layout} width={width} />}
        {sc.id === "flyover" && <FlyoverGraphics race={race} plan={plan} x={x} s={s} layout={layout} width={width} />}
        {sc.id === "lineup" && <LineupGraphics race={race} view={view} frame={frame} x={x} frames={sc.frames} s={s} layout={layout} width={width} height={height} />}
      </AbsoluteFill>
      {flash > 0 && <AbsoluteFill style={{ background: "#fff", opacity: flash }} />}
    </AbsoluteFill>
  );
}
