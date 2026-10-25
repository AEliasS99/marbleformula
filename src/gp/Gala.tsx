import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { disposeScene, marbleTextures, studioScene } from "./Scene";
import { flagDataUrl } from "./flags";
import { quality } from "./quality";
import { rounds } from "./race";
import { TEAMS, teamOf } from "./teams.js";

// ============================================================================
// 2027 MARBLE FORMULA CHAMPIONSHIP — OFFICIAL AWARDS GALA & CEREMONY
// Total Duration: 2760 frames @ 60 fps (46.0 seconds)
//   Scene 1 (  0 -  390): Opening Gala & 5 Grand Prix Round Winners Recap
//   Scene 2 (390 -  990): Drivers' World Championship Podium & Trophy
//   Scene 3 (990 - 1530): National Anthem of the World Champion
//   Scene 4 (1530 - 2070): The Scuderia / Constructors' Trophy
//   Scene 5 (2070 - 2760): The Unlucky Consolation Prize ("Golden Plunger & Wooden Spoon")
// ============================================================================

export const GALA_FRAMES = 2760;

const font = "'Avenir Next', 'Montserrat', 'Helvetica Neue', system-ui, sans-serif";
const gold = "#ffcc00";
const silver = "#d8dde6";
const bronze = "#cd7f32";
const red = "#e10600";
const darkCard = "rgba(15, 18, 26, 0.90)";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const finalRound = rounds[rounds.length - 1];
const allMarbles = finalRound.marbles;
const finalStandings = (finalRound as unknown as { standings: { marble: number; pos: number; points: number }[] }).standings ?? [];
const finalConstructors = (finalRound as unknown as { constructors: { team: string; points: number; pos: number }[] }).constructors ?? [];

const countWins = (mIdx: number) => rounds.filter((r) => r.order[0] === mIdx).length;
const countPodiums = (mIdx: number) => rounds.filter((r) => r.order.slice(0, 3).includes(mIdx)).length;

const ROUND_WINNERS = rounds.map((r, idx) => {
  const wIdx = r.order[0];
  const m = r.marbles[wIdx];
  const tm = teamOf(m.abbr);
  return {
    round: idx + 1,
    gp: r.info.title.toUpperCase(),
    circuit: r.info.circuit,
    winner: m.name,
    code: m.abbr,
    team: tm?.name ?? "Independent",
    color: m.color,
  };
});

const DRIVERS_PODIUM = finalStandings.slice(0, 3).map((st, idx) => {
  const m = allMarbles[st.marble];
  const tm = teamOf(m.abbr);
  const wins = countWins(st.marble);
  const podiums = countPodiums(st.marble);
  return {
    pos: idx + 1,
    id: m.abbr,
    country: m.name,
    name: m.name,
    code: m.abbr,
    team: tm?.name ?? "Independent",
    color: m.color,
    points: st.points,
    wins,
    podiums,
    badge: idx === 0 ? "2027 WORLD CHAMPION" : idx === 1 ? "VICE-CHAMPION · WORLD TOUR" : "3RD PLACE · BRONZE MEDALIST",
    quizzical:
      idx === 0
        ? `Crowned 2027 World Champion across the 5-Circuit World Tour with ${st.points} points (${wins} win${wins === 1 ? "" : "s"}, ${podiums} podiums)!`
        : idx === 1
          ? `Battled for the World Title all the way to the Yas Marina finale with ${st.points} points!`
          : `Clinched 3rd overall on the World Tour podium with ${st.points} points!`,
  };
});

const SCUDERIA_STANDINGS = finalConstructors.slice(0, 5).map((cs, idx) => {
  const tm = TEAMS.find((t) => t.id === cs.team) ?? TEAMS[0];
  const d0Idx = allMarbles.findIndex((m) => m.abbr === tm.drivers[0]);
  const d1Idx = allMarbles.findIndex((m) => m.abbr === tm.drivers[1]);
  const p0 = finalStandings.find((s) => s.marble === d0Idx)?.points ?? 0;
  const p1 = finalStandings.find((s) => s.marble === d1Idx)?.points ?? 0;
  const wins = countWins(d0Idx) + countWins(d1Idx);
  const podiums = countPodiums(d0Idx) + countPodiums(d1Idx);
  return {
    pos: idx + 1,
    name: tm.name,
    short: tm.short ?? tm.id.slice(0, 3).toUpperCase(),
    drivers: tm.drivers as [string, string],
    driverNames: `${allMarbles[d0Idx]?.name ?? tm.drivers[0]} (${p0}) + ${allMarbles[d1Idx]?.name ?? tm.drivers[1]} (${p1})`,
    points: cs.points,
    wins,
    podiums,
    colors: tm.colors,
    note: idx === 0 ? "2027 Scuderia World Champions!" : `${wins} Win${wins === 1 ? "" : "s"} · ${podiums} Podium${podiums === 1 ? "" : "s"}`,
  };
});

const driverStats: Record<string, { country: string; points: number; wins: number; podiums: number; team: string }> = {};
finalStandings.forEach((st) => {
  const m = allMarbles[st.marble];
  if (m) {
    driverStats[m.abbr] = {
      country: m.name,
      points: st.points,
      wins: countWins(st.marble),
      podiums: countPodiums(st.marble),
      team: teamOf(m.abbr)?.name ?? "Independent",
    };
  }
});

const LAST_DRIVER_entry = finalStandings[finalStandings.length - 1] ?? { marble: 6, pos: 20, points: 0 };
const PENULT_DRIVER_entry = finalStandings[finalStandings.length - 2] ?? { marble: 5, pos: 19, points: 0 };
const LAST_DRIVER_M = allMarbles[LAST_DRIVER_entry.marble];
const PENULT_DRIVER_M = allMarbles[PENULT_DRIVER_entry.marble];
const LAST_DRIVER = {
  ...LAST_DRIVER_M,
  id: LAST_DRIVER_M.abbr,
  country: LAST_DRIVER_M.name,
  team: teamOf(LAST_DRIVER_M.abbr)?.name ?? "Independent",
  points: LAST_DRIVER_entry.points,
  wins: countWins(LAST_DRIVER_entry.marble),
  podiums: countPodiums(LAST_DRIVER_entry.marble),
};
const PENULT_DRIVER = {
  ...PENULT_DRIVER_M,
  id: PENULT_DRIVER_M.abbr,
  country: PENULT_DRIVER_M.name,
  team: teamOf(PENULT_DRIVER_M.abbr)?.name ?? "Independent",
  points: PENULT_DRIVER_entry.points,
  wins: countWins(PENULT_DRIVER_entry.marble),
  podiums: countPodiums(PENULT_DRIVER_entry.marble),
};
const LAST_SCUDERIA_entry = finalConstructors[finalConstructors.length - 1] ?? { team: "autobahn", points: 0, pos: 10 };
const LAST_SCUDERIA_TM = TEAMS.find((t) => t.id === LAST_SCUDERIA_entry.team) ?? TEAMS[TEAMS.length - 1];
const lsD0 = allMarbles.findIndex((m) => m.abbr === LAST_SCUDERIA_TM.drivers[0]);
const lsD1 = allMarbles.findIndex((m) => m.abbr === LAST_SCUDERIA_TM.drivers[1]);
const LAST_SCUDERIA = {
  ...LAST_SCUDERIA_TM,
  points: LAST_SCUDERIA_entry.points,
  note: `${countWins(lsD0) + countWins(lsD1)} Wins, ${countPodiums(lsD0) + countPodiums(lsD1)} Podiums`,
};

const Flag = ({ code, h }: { code: string; h: number }) => (
  <img
    src={flagDataUrl(code, 96, 64)}
    style={{
      height: h,
      width: h * 1.5,
      borderRadius: h * 0.14,
      boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
      objectFit: "cover",
      border: "1px solid rgba(255,255,255,0.28)",
    }}
  />
);

// --- 3D Building Blocks ---------------------------------------------------------------

/** 3D Golden/Silver/Bronze World Championship Cup */
function TrophyCup3D({
  position = [0, 0, 0],
  scale = 1,
  spin = 0,
  metalColor = "#ffd700",
  accentColor = "#e10600",
}: {
  position?: [number, number, number];
  scale?: number;
  spin?: number;
  metalColor?: string;
  accentColor?: string;
}) {
  return (
    <group position={position} scale={scale} rotation={[0, spin, 0]}>
      {/* Stepped obsidian & gold plinth */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.38, 0.44, 0.12, 64]} />
        <meshStandardMaterial color="#14171f" metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.31, 0.35, 0.08, 64]} />
        <meshStandardMaterial color={metalColor} metalness={0.96} roughness={0.14} />
      </mesh>
      <mesh position={[0, 0.19, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.32, 0.015, 16, 64]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={1.6} />
      </mesh>
      {/* Fluted stem */}
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.2, 0.44, 48]} />
        <meshStandardMaterial color={metalColor} metalness={0.98} roughness={0.12} />
      </mesh>
      {/* Mid collar ring */}
      <mesh position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.13, 0.025, 16, 48]} />
        <meshStandardMaterial color={metalColor} metalness={0.98} roughness={0.1} />
      </mesh>
      {/* Chalice cup body */}
      <mesh position={[0, 0.88, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.12, 0.5, 64]} />
        <meshStandardMaterial color={metalColor} metalness={0.98} roughness={0.11} />
      </mesh>
      {/* Rim torus */}
      <mesh position={[0, 1.13, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.34, 0.022, 16, 64]} />
        <meshStandardMaterial color="#fff4b8" metalness={0.99} roughness={0.08} />
      </mesh>
      {/* Twin handles */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.28, 0.88, 0]} rotation={[0, 0, side * 0.25]}>
          <torusGeometry args={[0.16, 0.022, 16, 48, Math.PI * 1.15]} />
          <meshStandardMaterial color={metalColor} metalness={0.98} roughness={0.12} />
        </mesh>
      ))}
      {/* Floating golden marble globe on top */}
      <mesh position={[0, 1.34, 0]} castShadow>
        <sphereGeometry args={[0.16, 48, 32]} />
        <meshPhysicalMaterial color={metalColor} metalness={0.98} roughness={0.08} clearcoat={0.6} />
      </mesh>
      <mesh position={[0, 1.34, 0]} rotation={[0.5, spin * 1.5, 0.3]}>
        <torusGeometry args={[0.23, 0.012, 12, 64]} />
        <meshStandardMaterial color={accentColor} emissive={accentColor} emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

/** 3D Golden Toilet Plunger & Drain Grate for the Loser's Consolation Prize! */
function GoldenPlunger3D({ position = [0, 0, 0], wobble = 0 }: { position?: [number, number, number]; wobble?: number }) {
  return (
    <group position={position} rotation={[Math.sin(wobble * 2) * 0.08, wobble * 0.8, Math.cos(wobble * 1.5) * 0.1]}>
      {/* Rusty sewer drain grate base */}
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[0.58, 0.62, 0.06, 48]} />
        <meshStandardMaterial color="#2b2d30" metalness={0.85} roughness={0.45} />
      </mesh>
      {[-0.3, -0.15, 0, 0.15, 0.3].map((z, i) => (
        <mesh key={i} position={[0, 0.065, z]}>
          <boxGeometry args={[0.85, 0.018, 0.04]} />
          <meshStandardMaterial color="#16181a" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
      {/* Rubber suction cup bell (painted tacky sparkly gold-pink!) */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <sphereGeometry args={[0.34, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
        <meshPhysicalMaterial color="#d49b35" roughness={0.35} metalness={0.65} clearcoat={0.4} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.34, 0.38, 0.08, 48]} />
        <meshPhysicalMaterial color="#b87333" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Plunger wooden broomstick handle */}
      <mesh position={[0, 0.92, 0]} castShadow>
        <cylinderGeometry args={[0.042, 0.048, 1.25, 32]} />
        <meshStandardMaterial color="#deb887" roughness={0.42} metalness={0.15} />
      </mesh>
      {/* Golden cap on top of the stick */}
      <mesh position={[0, 1.56, 0]}>
        <sphereGeometry args={[0.058, 24, 24]} />
        <meshStandardMaterial color="#ffd700" metalness={0.95} roughness={0.15} />
      </mesh>
    </group>
  );
}

/** Falling 3D celebratory confetti particles */
function GalaConfetti({ frame, count = 110, mode = "gold" }: { frame: number; count?: number; mode?: "gold" | "poland" | "crimson" | "sad" }) {
  const palette =
    mode === "poland"
      ? ["#ffffff", "#dc143c", "#ffd700", "#ffffff"]
      : mode === "crimson"
        ? ["#de2910", "#ffd700", "#ffffff", "#ff9933"]
        : mode === "sad"
          ? ["#5a626a", "#8b5a2b", "#ff7f00", "#444852"]
          : ["#ffd700", "#fff3b0", "#e10600", "#ffffff", "#38b6ff"];
  const pieces = useMemo(() => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const s1 = Math.sin(i * 127.1) * 43758.5453;
      const r1 = s1 - Math.floor(s1);
      const s2 = Math.sin(i * 269.5) * 43758.5453;
      const r2 = s2 - Math.floor(s2);
      const s3 = Math.sin(i * 419.2) * 43758.5453;
      const r3 = s3 - Math.floor(s3);
      out.push({
        x: (r1 - 0.5) * 5.8,
        z: (r2 - 0.5) * 3.8 - 0.4,
        y0: r3 * 4.2,
        speed: 0.55 + (r1 * 0.7),
        rotSpeed: 2.0 + r2 * 4.0,
        color: palette[i % palette.length],
      });
    }
    return out;
  }, [count, mode]);

  const t = frame / 60;
  return (
    <group>
      {pieces.map((p, i) => {
        const y = 3.8 - ((p.y0 + t * p.speed) % 4.0);
        const x = p.x + Math.sin(t * 1.8 + i) * 0.16;
        return (
          <mesh key={i} position={[x, y, p.z]} rotation={[t * p.rotSpeed + i, t * p.rotSpeed * 0.7, i]}>
            <planeGeometry args={[0.055, 0.032]} />
            <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={0.45} metalness={0.8} roughness={0.2} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

/** 3D Showroom Stage shared across all 5 Gala scenes */
function GalaStage3D({ frame }: { frame: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;

  useMemo(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.08;
    const pmrem = new THREE.PMREMGenerator(gl);
    const studio = studioScene();
    scene.environment = pmrem.fromScene(studio, 0.02, 0.1, 200, { size: 512 }).texture;
    disposeScene(studio);
    pmrem.dispose();
    scene.background = new THREE.Color("#080a10");
    scene.fog = new THREE.Fog("#080a10", 9, 26);
  }, [gl, scene]);

  // Pre-build marble textures dynamically from the season's actual winners, podium, scuderia champions, and last-place finishers
  const roster = useMemo(() => {
    const p1 = DRIVERS_PODIUM[0];
    const p2 = DRIVERS_PODIUM[1];
    const p3 = DRIVERS_PODIUM[2];
    const sc0 = allMarbles.find((m) => m.abbr === SCUDERIA_STANDINGS[0].drivers[0]) ?? allMarbles[0];
    const sc1 = allMarbles.find((m) => m.abbr === SCUDERIA_STANDINGS[0].drivers[1]) ?? allMarbles[1];
    return {
      POL: marbleTextures(p1.name, p1.code, p1.color),
      CHN: marbleTextures(p2.name, p2.code, p2.color),
      DNK: marbleTextures(p3.name, p3.code, p3.color),
      SC0: marbleTextures(sc0.name, sc0.abbr, sc0.color),
      SC1: marbleTextures(sc1.name, sc1.abbr, sc1.color),
      NLD: marbleTextures(LAST_DRIVER.name, LAST_DRIVER.abbr, LAST_DRIVER.color),
      DEU: marbleTextures(PENULT_DRIVER.name, PENULT_DRIVER.abbr, PENULT_DRIVER.color),
      USA: marbleTextures(PENULT_DRIVER.name, PENULT_DRIVER.abbr, PENULT_DRIVER.color),
    };
  }, []);

  useEffect(
    () => () => {
      Object.values(roster).forEach((tx) => {
        tx.map.dispose();
        tx.mr.dispose();
      });
    },
    [roster],
  );

  const R = 0.25;
  const sec = frame / 60;

  // Determine which scene we are in:
  const isIntro = frame < 390;
  const isPodium = frame >= 390 && frame < 990;
  const isAnthem = frame >= 990 && frame < 1530;
  const isScuderia = frame >= 1530 && frame < 2070;
  const isLoser = frame >= 2070;

  camera.near = 0.05;
  camera.far = 60;

  if (isIntro) {
    const p = frame / 390;
    const a = -0.35 + p * 0.7;
    const d = 4.5 - p * 0.55;
    camera.fov = 28;
    camera.updateProjectionMatrix();
    const look = new THREE.Vector3(-1.05, 0.72, 0);
    camera.position.set(look.x + Math.sin(a) * d, 1.32 - 0.12 * p, look.z + Math.cos(a) * d);
    camera.lookAt(look);
  } else if (isPodium) {
    const p = (frame - 390) / 600;
    const a = -0.36 + p * 0.72;
    const d = 5.6 - p * 0.45;
    camera.fov = 30;
    camera.updateProjectionMatrix();
    const look = new THREE.Vector3(-1.28, 0.66, 0);
    camera.position.set(look.x + Math.sin(a) * d, 1.38 - 0.1 * p, look.z + Math.cos(a) * d);
    camera.lookAt(look);
  } else if (isAnthem) {
    const p = (frame - 990) / 540;
    const a = -0.28 + p * 0.56;
    const d = 3.65 - p * 0.35;
    camera.fov = 26;
    camera.updateProjectionMatrix();
    const look = new THREE.Vector3(-0.85, 0.72, 0);
    camera.position.set(look.x + Math.sin(a) * d, 1.05 + 0.1 * Math.sin(p * Math.PI), look.z + Math.cos(a) * d);
    camera.lookAt(look);
  } else if (isScuderia) {
    const p = (frame - 1530) / 540;
    const a = 0.34 - p * 0.68;
    const d = 4.9 - p * 0.4;
    camera.fov = 29;
    camera.updateProjectionMatrix();
    const look = new THREE.Vector3(-1.15, 0.66, 0);
    camera.position.set(look.x + Math.sin(a) * d, 1.3, look.z + Math.cos(a) * d);
    camera.lookAt(look);
  } else {
    const p = (frame - 2070) / 690;
    const a = -0.32 + p * 0.64;
    const d = 4.85 - p * 0.3;
    camera.fov = 30;
    camera.updateProjectionMatrix();
    const look = new THREE.Vector3(-1.22, 0.55, 0);
    camera.position.set(look.x + Math.sin(a) * d, 1.25 + 0.06 * Math.sin(sec * 3), look.z + Math.cos(a) * d);
    camera.lookAt(look);
  }

  const accent = isLoser ? "#ff7f00" : isAnthem || isScuderia ? "#dc143c" : "#ffcc00";
  const accentCol = new THREE.Color(accent);

  return (
    <>
      <spotLight position={[1.8, 5.8, 3.4]} angle={0.5} penumbra={0.75} intensity={72} castShadow shadow-mapSize={[2048, 2048]} />
      <spotLight position={[-1.5, 4.5, -3.5]} angle={0.6} penumbra={0.8} intensity={34} color="#dbe8ff" />
      <pointLight position={[-2.2, 1.5, -1.8]} color={accentCol} intensity={14} distance={9} />
      <pointLight position={[2.2, 1.5, 1.4]} color={isAnthem ? "#ffffff" : "#ffd700"} intensity={11} distance={9} />
      <ambientLight intensity={0.12} />

      {/* Glossy dark obsidian showroom floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[24, 96]} />
        <meshPhysicalMaterial color="#0b0d13" roughness={0.22} metalness={0.6} clearcoat={0.45} clearcoatRoughness={0.18} />
      </mesh>

      {/* Rotating outer horological stage ring */}
      <group rotation={[0, sec * 0.25, 0]}>
        <mesh position={[0, 0.03, 0]} receiveShadow>
          <cylinderGeometry args={[2.1, 2.22, 0.06, 96]} />
          <meshStandardMaterial color="#161922" roughness={0.22} metalness={0.9} />
        </mesh>
        <mesh position={[0, 0.065, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.08, 0.012, 12, 128]} />
          <meshStandardMaterial color={accentCol} emissive={accentCol} emissiveIntensity={1.8} />
        </mesh>
      </group>

      {/* SCENE 1: GRAND TROPHY SHOWCASE */}
      {isIntro && (
        <group>
          <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.95, 1.05, 0.22, 96]} />
            <meshStandardMaterial color="#1e222d" roughness={0.2} metalness={0.9} />
          </mesh>
          <TrophyCup3D position={[0, 0.25, 0]} scale={1.12} spin={sec * 0.9} metalColor="#ffd700" accentColor="#e10600" />
          <GalaConfetti frame={frame} mode="gold" />
        </group>
      )}

      {/* SCENE 2: 3-STEP DRIVERS' WORLD CHAMPIONSHIP PODIUM */}
      {isPodium && (
        <group>
          {/* P1 CENTER STEP (GOLD - POLAND) */}
          <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.58, 0.64, 0.56, 64]} />
            <meshStandardMaterial color="#222632" roughness={0.2} metalness={0.88} />
          </mesh>
          <mesh position={[0, 0.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.58, 0.014, 12, 64]} />
            <meshStandardMaterial color="#ffd700" emissive="#ffd700" emissiveIntensity={2.0} />
          </mesh>
          <mesh position={[0, 0.62 + R, 0.12]} rotation={[0.2, sec * 1.4, 0.08]} castShadow>
            <sphereGeometry args={[R * 1.08, 96, 64]} />
            <meshPhysicalMaterial map={roster.POL.map} metalnessMap={roster.POL.mr} roughnessMap={roster.POL.mr} metalness={1} roughness={1} clearcoat={0.6} envMapIntensity={1.4} />
          </mesh>
          <TrophyCup3D position={[0, 0.62, -0.26]} scale={0.52} spin={sec * 1.1} metalColor="#ffd700" accentColor="#dc143c" />

          {/* P2 LEFT STEP (SILVER - CHINA) */}
          <mesh position={[-1.18, 0.24, 0.18]} castShadow receiveShadow>
            <cylinderGeometry args={[0.48, 0.54, 0.36, 64]} />
            <meshStandardMaterial color="#1d212b" roughness={0.22} metalness={0.86} />
          </mesh>
          <mesh position={[-1.18, 0.42, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.48, 0.012, 12, 64]} />
            <meshStandardMaterial color="#d8dde6" emissive="#d8dde6" emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[-1.18, 0.42 + R, 0.25]} rotation={[0.2, sec * 1.2 + 1, 0.08]} castShadow>
            <sphereGeometry args={[R, 96, 64]} />
            <meshPhysicalMaterial map={roster.CHN.map} metalnessMap={roster.CHN.mr} roughnessMap={roster.CHN.mr} metalness={1} roughness={1} clearcoat={0.55} envMapIntensity={1.3} />
          </mesh>
          <TrophyCup3D position={[-1.18, 0.42, -0.12]} scale={0.38} spin={sec * 0.9} metalColor="#e2e8f0" accentColor="#de2910" />

          {/* P3 RIGHT STEP (BRONZE - DENMARK) */}
          <mesh position={[1.18, 0.19, 0.26]} castShadow receiveShadow>
            <cylinderGeometry args={[0.46, 0.52, 0.26, 64]} />
            <meshStandardMaterial color="#1b1e27" roughness={0.24} metalness={0.84} />
          </mesh>
          <mesh position={[1.18, 0.32, 0.26]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.46, 0.012, 12, 64]} />
            <meshStandardMaterial color="#cd7f32" emissive="#cd7f32" emissiveIntensity={1.4} />
          </mesh>
          <mesh position={[1.18, 0.32 + R, 0.32]} rotation={[0.2, sec * 1.1 + 2, 0.08]} castShadow>
            <sphereGeometry args={[R, 96, 64]} />
            <meshPhysicalMaterial map={roster.DNK.map} metalnessMap={roster.DNK.mr} roughnessMap={roster.DNK.mr} metalness={1} roughness={1} clearcoat={0.55} envMapIntensity={1.3} />
          </mesh>
          <TrophyCup3D position={[1.18, 0.32, -0.05]} scale={0.34} spin={sec * 0.8} metalColor="#cd7f32" accentColor="#c8102e" />

          <GalaConfetti frame={frame} mode="gold" />
        </group>
      )}

      {/* SCENE 3: POLISH NATIONAL ANTHEM ("MAZUREK DĄBROWSKIEGO") */}
      {isAnthem && (
        <group>
          {/* Glowing White & Crimson Polish Flag Stage Plinth */}
          <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[1.05, 1.15, 0.32, 96]} />
            <meshStandardMaterial color="#222530" roughness={0.2} metalness={0.9} />
          </mesh>
          <mesh position={[0, 0.385, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.04, 0.018, 16, 96]} />
            <meshStandardMaterial color="#dc143c" emissive="#dc143c" emissiveIntensity={2.4} />
          </mesh>
          <mesh position={[0, 0.39, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.76, 0.96, 96]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.2} />
          </mesh>
          {/* World Champion Poland Marble front & center */}
          <mesh position={[-0.28, 0.39 + R * 1.18, 0.18]} rotation={[0.18, sec * 1.35, 0.06]} castShadow>
            <sphereGeometry args={[R * 1.18, 96, 64]} />
            <meshPhysicalMaterial map={roster.POL.map} metalnessMap={roster.POL.mr} roughnessMap={roster.POL.mr} metalness={1} roughness={1} clearcoat={0.65} envMapIntensity={1.5} />
          </mesh>
          {/* World Championship Golden Trophy beside Poland */}
          <TrophyCup3D position={[0.38, 0.39, -0.05]} scale={0.72} spin={sec * 1.0} metalColor="#ffd700" accentColor="#dc143c" />
          <GalaConfetti frame={frame} mode="poland" />
        </group>
      )}

      {/* SCENE 4: SCUDERIA / CONSTRUCTORS' TROPHY (CRIMSON DYNAMICS: POL + CHN) */}
      {isScuderia && (
        <group>
          <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[1.35, 1.45, 0.28, 96]} />
            <meshStandardMaterial color="#20181b" roughness={0.2} metalness={0.88} />
          </mesh>
          <mesh position={[0, 0.345, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.34, 0.018, 16, 96]} />
            <meshStandardMaterial color="#de2910" emissive="#de2910" emissiveIntensity={2.5} />
          </mesh>
          {/* Constructors' Twin-Cup Centerpiece */}
          <TrophyCup3D position={[0, 0.34, -0.18]} scale={0.78} spin={sec * 1.15} metalColor="#ffd700" accentColor="#de2910" />
          {/* Teammate 1 */}
          <mesh position={[-0.64, 0.34 + R * 1.08, 0.22]} rotation={[0.22, sec * 1.4, 0.08]} castShadow>
            <sphereGeometry args={[R * 1.08, 96, 64]} />
            <meshPhysicalMaterial map={roster.SC0.map} metalnessMap={roster.SC0.mr} roughnessMap={roster.SC0.mr} metalness={1} roughness={1} clearcoat={0.6} envMapIntensity={1.4} />
          </mesh>
          {/* Teammate 2 */}
          <mesh position={[0.64, 0.34 + R * 1.08, 0.22]} rotation={[0.22, sec * 1.4 + Math.PI, 0.08]} castShadow>
            <sphereGeometry args={[R * 1.08, 96, 64]} />
            <meshPhysicalMaterial map={roster.SC1.map} metalnessMap={roster.SC1.mr} roughnessMap={roster.SC1.mr} metalness={1} roughness={1} clearcoat={0.6} envMapIntensity={1.4} />
          </mesh>
          <GalaConfetti frame={frame} mode="crimson" />
        </group>
      )}

      {/* SCENE 5: THE UNLUCKY CONSOLATION PRIZE ("THE GOLDEN PLUNGER & WOODEN SPOON") */}
      {isLoser && (
        <group>
          {/* Tiny sad 4cm wooden/rusty step for 20th place */}
          <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[1.25, 1.32, 0.09, 48]} />
            <meshStandardMaterial color="#3a2e24" roughness={0.65} metalness={0.25} />
          </mesh>
          {/* The Golden Toilet Plunger & Sewer Grate! */}
          <GoldenPlunger3D position={[0.35, 0.12, -0.1]} wobble={sec} />
          {/* P20 Dead Last: Netherlands (1 singular point) wobbling sadly */}
          <mesh position={[-0.38, 0.12 + R, 0.24]} rotation={[Math.sin(sec * 3) * 0.35, sec * 0.55, Math.cos(sec * 2.5) * 0.35]} castShadow>
            <sphereGeometry args={[R * 1.04, 96, 64]} />
            <meshPhysicalMaterial map={roster.NLD.map} metalnessMap={roster.NLD.mr} roughnessMap={roster.NLD.mr} metalness={1} roughness={1} clearcoat={0.5} envMapIntensity={1.2} />
          </mesh>
          {/* P19 Germany (Autobahn Motorsport - 3 pts) */}
          <mesh position={[-0.95, 0.12 + R * 0.9, -0.15]} rotation={[0.3, -sec * 0.4, 0.2]} castShadow>
            <sphereGeometry args={[R * 0.9, 96, 64]} />
            <meshPhysicalMaterial map={roster.DEU.map} metalnessMap={roster.DEU.mr} roughnessMap={roster.DEU.mr} metalness={1} roughness={1} clearcoat={0.5} envMapIntensity={1.2} />
          </mesh>
          {/* Most Drained: USA */}
          <mesh position={[0.98, 0.12 + R * 0.9, 0.25]} rotation={[0.2, sec * 0.5, -0.25]} castShadow>
            <sphereGeometry args={[R * 0.9, 96, 64]} />
            <meshPhysicalMaterial map={roster.USA.map} metalnessMap={roster.USA.mr} roughnessMap={roster.USA.mr} metalness={1} roughness={1} clearcoat={0.5} envMapIntensity={1.2} />
          </mesh>
          <GalaConfetti frame={frame} count={45} mode="sad" />
        </group>
      )}
    </>
  );
}

// --- Broadcast Overlays for Each Scene ------------------------------------------------

function TopHeader({ badge, title, subtitle, badgeBg = gold, badgeColor = "#111216" }: { badge: string; title: string; subtitle: string; badgeBg?: string; badgeColor?: string }) {
  return (
    <div style={{ position: "absolute", left: 64, top: 44, display: "flex", alignItems: "center", gap: 18 }}>
      <span
        style={{
          padding: "8px 18px",
          borderRadius: 10,
          background: badgeBg,
          color: badgeColor,
          fontSize: 23,
          fontWeight: 900,
          letterSpacing: 1.5,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        {badge}
      </span>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ color: "#fff", fontSize: 32, fontWeight: 900, letterSpacing: 1, textShadow: "0 4px 16px rgba(0,0,0,0.6)" }}>{title}</span>
        <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 18, fontWeight: 600, letterSpacing: 0.6 }}>{subtitle}</span>
      </div>
    </div>
  );
}

/** Scene 1: Opening Gala & 5 Round Winners */
function IntroOverlay({ frame, fps }: { frame: number; fps: number }) {
  const out = interpolate(frame, [365, 390], [1, 0], clamp);
  const titleIn = spring({ frame: frame - 5, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ opacity: out, pointerEvents: "none" }}>
      <TopHeader badge="FIA MARBLE GALA · 2027" title="WORLD CHAMPIONSHIP AWARDS CEREMONY" subtitle="5 GRAND PRIX · 10 SCUDERIAS · 20 COUNTRIES" />
      <div
        style={{
          position: "absolute",
          left: 64,
          top: 150,
          width: 900,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          transform: `translateY(${(1 - titleIn) * 30}px)`,
          opacity: titleIn,
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 900, color: "#fff", lineHeight: 1.02, textShadow: "0 8px 28px rgba(0,0,0,0.65)" }}>
          THE ROAD TO THE <span style={{ color: gold }}>2027 CROWN</span>
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, color: "rgba(255,255,255,0.82)", marginBottom: 8 }}>
          Five iconic circuits. Four different Grand Prix winners. One miracle comeback from the drain.
        </div>

        {ROUND_WINNERS.map((rw, idx) => {
          const sp = spring({ frame: frame - (55 + idx * 44), fps, config: { damping: 15 } });
          return (
            <div
              key={rw.round}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 24px",
                borderRadius: 16,
                background: darkCard,
                borderLeft: `8px solid ${rw.color}`,
                boxShadow: "0 10px 28px rgba(0,0,0,0.38)",
                opacity: sp,
                transform: `translateX(${(1 - sp) * -50}px)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <span style={{ padding: "5px 12px", borderRadius: 8, background: "rgba(255,255,255,0.12)", color: gold, fontSize: 20, fontWeight: 800 }}>
                  {`R${rw.round}`}
                </span>
                <div>
                  <div style={{ color: "#fff", fontSize: 25, fontWeight: 900 }}>{rw.gp}</div>
                  <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 17, fontWeight: 600 }}>{rw.circuit}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#fff", fontSize: 26, fontWeight: 900 }}>{`🏆 ${rw.winner}`}</div>
                  <div style={{ color: gold, fontSize: 16, fontWeight: 700 }}>{rw.team.toUpperCase()}</div>
                </div>
                <Flag code={rw.code} h={42} />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** Scene 2: Drivers' World Championship Podium (P1 Poland, P2 China, P3 Denmark) */
function PodiumOverlay({ frame, fps }: { frame: number; fps: number }) {
  const x = frame - 390;
  const out = interpolate(x, [575, 600], [1, 0], clamp);
  // Reveal order: P3 Denmark (at x=30), P2 China (at x=125), P1 Champion Poland (at x=230)
  const revealAt = { 3: 25, 2: 120, 1: 225 } as Record<number, number>;

  return (
    <AbsoluteFill style={{ opacity: out, pointerEvents: "none" }}>
      <TopHeader badge="DRIVERS' WORLD CHAMPIONSHIP" title="THE 2027 PODIUM & WORLD TROPHY" subtitle="FINAL CLASSIFICATION AFTER ROUND 5 (SUZUKA)" />
      <div style={{ position: "absolute", left: 56, top: 148, width: 820, display: "flex", flexDirection: "column", gap: 20 }}>
        {DRIVERS_PODIUM.map((d) => {
          const sp = spring({ frame: x - revealAt[d.pos], fps, config: { damping: 14 } });
          const medalColor = d.pos === 1 ? gold : d.pos === 2 ? silver : bronze;
          const isChamp = d.pos === 1;
          return (
            <div
              key={d.code}
              style={{
                padding: isChamp ? "24px 28px" : "18px 24px",
                borderRadius: 20,
                background: isChamp ? "linear-gradient(135deg, rgba(220,20,60,0.92), rgba(20,22,32,0.95))" : darkCard,
                border: isChamp ? `3px solid ${gold}` : "1px solid rgba(255,255,255,0.14)",
                boxShadow: isChamp ? "0 16px 44px rgba(220,20,60,0.45)" : "0 10px 28px rgba(0,0,0,0.38)",
                opacity: sp,
                transform: `translateX(${(1 - sp) * -60}px) scale(${0.94 + 0.06 * sp})`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div
                    style={{
                      width: isChamp ? 64 : 52,
                      height: isChamp ? 64 : 52,
                      borderRadius: 14,
                      background: medalColor,
                      color: "#111216",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: isChamp ? 36 : 28,
                      fontWeight: 900,
                    }}
                  >
                    {`P${d.pos}`}
                  </div>
                  <Flag code={d.code} h={isChamp ? 56 : 44} />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ color: "#fff", fontSize: isChamp ? 44 : 34, fontWeight: 900 }}>{d.name.toUpperCase()}</span>
                      <span style={{ padding: "4px 10px", borderRadius: 6, background: medalColor, color: "#111216", fontSize: 15, fontWeight: 900 }}>
                        {d.badge}
                      </span>
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                      {`${d.team} · ${d.wins} Wins · ${d.podiums} Podiums`}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: medalColor, fontSize: isChamp ? 54 : 40, fontWeight: 900, lineHeight: 1 }}>{d.points}</div>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: 800, letterSpacing: 1.5 }}>POINTS</div>
                </div>
              </div>
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: "1px solid rgba(255,255,255,0.15)",
                  color: isChamp ? "#fff7cc" : "rgba(255,255,255,0.75)",
                  fontSize: isChamp ? 20 : 18,
                  fontWeight: 600,
                  fontStyle: "italic",
                }}
              >
                {`“${d.quizzical}”`}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** Scene 3: National Anthem of the Champion */
function AnthemOverlay({ frame, fps }: { frame: number; fps: number }) {
  const x = frame - 990;
  const inn = spring({ frame: x - 6, fps, config: { damping: 14 } });
  const out = interpolate(x, [515, 540], [1, 0], clamp);
  const t = x / 60;
  const champ = DRIVERS_PODIUM[0];

  return (
    <AbsoluteFill style={{ opacity: out, pointerEvents: "none" }}>
      <TopHeader
        badge="🎶 NATIONAL ANTHEM OF THE CHAMPION"
        badgeBg={champ.color}
        badgeColor="#ffffff"
        title={`${champ.country.toUpperCase()} · ${champ.team.toUpperCase()}`}
        subtitle="CROWNED 2027 MARBLE FORMULA WORLD CHAMPION"
      />

      <div
        style={{
          position: "absolute",
          left: 64,
          top: 154,
          width: 870,
          display: "flex",
          flexDirection: "column",
          gap: 22,
          opacity: inn,
          transform: `translateY(${(1 - inn) * 30}px)`,
        }}
      >
        {/* Flag + Champion Banner */}
        <div
          style={{
            padding: "26px 30px",
            borderRadius: 22,
            background: "linear-gradient(135deg, rgba(188,0,45,0.92), rgba(18,20,28,0.95))",
            border: `3px solid ${gold}`,
            boxShadow: "0 18px 48px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Flag code={champ.id} h={74} />
            <div>
              <div style={{ color: gold, fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>2027 WORLD DRIVERS’ CHAMPION</div>
              <div style={{ color: "#fff", fontSize: 54, fontWeight: 900, lineHeight: 1.05 }}>{`${champ.country.toUpperCase()} (${champ.id})`}</div>
              <div style={{ color: "rgba(255,255,255,0.88)", fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                {`Scuderia: ${champ.team} · ${champ.points} Points · ${champ.wins} Wins · ${champ.podiums} Podiums`}
              </div>
            </div>
          </div>

          {/* Animated Anthem Soundwave Equalizer */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 7, height: 54, marginTop: 24, padding: "0 6px" }}>
            {Array.from({ length: 32 }).map((_, i) => {
              const wave = 0.25 + 0.75 * Math.abs(Math.sin(t * 6.5 + i * 0.45) * Math.cos(t * 3.2 - i * 0.2));
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${Math.round(wave * 100)}%`,
                    borderRadius: 4,
                    background: i % 2 === 0 ? "#ffffff" : gold,
                    boxShadow: "0 0 10px rgba(255,204,0,0.5)",
                  }}
                />
              );
            })}
          </div>

          <div style={{ marginTop: 18, color: "#fff", fontSize: 25, fontWeight: 800, textAlign: "center", letterSpacing: 0.6 }}>
            {t < 4.2
              ? `🎵 OFFICIAL NATIONAL ANTHEM OF ${champ.country.toUpperCase()} 🎵`
              : `🏆 ALL HAIL THE 2027 WORLD DRIVERS’ CHAMPION: ${champ.country.toUpperCase()}! 🏆`}
          </div>
          <div style={{ marginTop: 6, color: gold, fontSize: 19, fontWeight: 700, textAlign: "center" }}>
            {`(${champ.points} Championship Points across 5 World Tour Circuits)`}
          </div>
        </div>

        {/* Stat Card: Championship Dominance */}
        <div
          style={{
            padding: "22px 28px",
            borderRadius: 18,
            background: darkCard,
            borderLeft: `8px solid ${gold}`,
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ color: gold, fontSize: 19, fontWeight: 900, letterSpacing: 1.5 }}>{`ROAD TO THE ${champ.points}-POINT WORLD TITLE`}</div>
          <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginTop: 8, lineHeight: 1.4 }}>
            • <b>Consistency Wins Titles:</b> Survived all 3 Knockout Checkpoints when rivals were eliminated.<br />
            • <b>Championship Record:</b> Clinched <b>{champ.wins} Grand Prix {champ.wins === 1 ? "Victory" : "Victories"}</b> and <b>{champ.podiums} Podium Finishes</b>.<br />
            • <b>Final Margin:</b> Defeated P2 <b>{DRIVERS_PODIUM[1].country} ({DRIVERS_PODIUM[1].points} pts)</b> by <b>{champ.points - DRIVERS_PODIUM[1].points} points</b>!
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** Scene 4: Scuderia / Constructors' World Championship Trophy */
function ScuderiaOverlay({ frame, fps }: { frame: number; fps: number }) {
  const x = frame - 1530;
  const out = interpolate(x, [515, 540], [1, 0], clamp);
  const heroIn = spring({ frame: x - 6, fps, config: { damping: 14 } });
  const topScuderia = SCUDERIA_STANDINGS[0];
  const d0Pts = driverStats[topScuderia.drivers[0]]?.points ?? 0;
  const d1Pts = driverStats[topScuderia.drivers[1]]?.points ?? 0;
  const d0Name = driverStats[topScuderia.drivers[0]]?.country ?? topScuderia.drivers[0];
  const d1Name = driverStats[topScuderia.drivers[1]]?.country ?? topScuderia.drivers[1];

  return (
    <AbsoluteFill style={{ opacity: out, pointerEvents: "none" }}>
      <TopHeader
        badge="SCUDERIA / CONSTRUCTORS' TROPHY"
        badgeBg={topScuderia.colors[0]}
        badgeColor="#ffffff"
        title={`${topScuderia.name.toUpperCase()} · 2027 WORLD CHAMPIONS`}
        subtitle={`${topScuderia.driverNames.toUpperCase()} — ${topScuderia.points} POINTS & ${topScuderia.note.toUpperCase()}`}
      />

      <div style={{ position: "absolute", left: 64, top: 146, width: 920, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Winner Scuderia Hero Card */}
        <div
          style={{
            padding: "22px 28px",
            borderRadius: 20,
            background: "linear-gradient(135deg, rgba(188,0,45,0.94), rgba(20,22,30,0.96))",
            border: `3px solid ${gold}`,
            boxShadow: "0 16px 44px rgba(188,0,45,0.45)",
            opacity: heroIn,
            transform: `translateY(${(1 - heroIn) * 25}px)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: gold, fontSize: 19, fontWeight: 900, letterSpacing: 2 }}>🏆 SCUDERIA CONSTRUCTORS' CUP WINNER</div>
              <div style={{ color: "#fff", fontSize: 48, fontWeight: 900, lineHeight: 1.05 }}>{topScuderia.name.toUpperCase()}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 10 }}>
                <Flag code={topScuderia.drivers[0]} h={38} />
                <span style={{ color: "#fff", fontSize: 23, fontWeight: 800 }}>{`${d0Name} (${d0Pts} pts)`}</span>
                <span style={{ color: gold, fontSize: 24, fontWeight: 900 }}>+</span>
                <Flag code={topScuderia.drivers[1]} h={38} />
                <span style={{ color: "#fff", fontSize: 23, fontWeight: 800 }}>{`${d1Name} (${d1Pts} pts)`}</span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: gold, fontSize: 64, fontWeight: 900, lineHeight: 1 }}>{topScuderia.points}</div>
              <div style={{ color: "#fff", fontSize: 18, fontWeight: 800, letterSpacing: 1.5 }}>TOTAL PTS</div>
            </div>
          </div>
        </div>

        {/* Top 5 Constructors Table */}
        <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 18, fontWeight: 800, letterSpacing: 1.5, marginTop: 4 }}>
          TOP 5 SCUDERIA STANDINGS
        </div>
        {SCUDERIA_STANDINGS.map((tm, idx) => {
          const sp = spring({ frame: x - (45 + idx * 28), fps, config: { damping: 15 } });
          return (
            <div
              key={tm.short}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "13px 22px",
                borderRadius: 14,
                background: darkCard,
                borderLeft: `8px solid ${tm.colors[0]}`,
                opacity: sp,
                transform: `translateX(${(1 - sp) * -40}px)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ width: 38, color: idx === 0 ? gold : "#fff", fontSize: 24, fontWeight: 900 }}>{`P${tm.pos}`}</span>
                <Flag code={tm.drivers[0]} h={30} />
                <Flag code={tm.drivers[1]} h={30} />
                <div>
                  <div style={{ color: "#fff", fontSize: 23, fontWeight: 900 }}>{tm.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 16, fontWeight: 600 }}>{`${tm.driverNames} · ${tm.note}`}</div>
                </div>
              </div>
              <div style={{ color: idx === 0 ? gold : "#fff", fontSize: 30, fontWeight: 900 }}>{`${tm.points} PTS`}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** Scene 5: The Unlucky Consolation Prize ("The Golden Plunger & Wooden Spoon") */
function LoserOverlay({ frame, fps }: { frame: number; fps: number }) {
  const x = frame - 2070;
  const card1 = spring({ frame: x - 18, fps, config: { damping: 12 } });
  const card2 = spring({ frame: x - 140, fps, config: { damping: 13 } });
  const card3 = spring({ frame: x - 260, fps, config: { damping: 13 } });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <TopHeader
        badge="🪠 CONSOLATION PRIZE · HALL OF SHAME"
        badgeBg="#ff7f00"
        badgeColor="#111216"
        title="THE “GOLDEN PLUNGER” AWARDS"
        subtitle="SPECIAL MENTION TO OUR HEROES AT THE VERY BOTTOM OF THE TABLE"
      />

      <div style={{ position: "absolute", left: 56, top: 148, width: 830, display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Card 1: P20 Dead Last Driver */}
        <div
          style={{
            padding: "22px 26px",
            borderRadius: 20,
            background: "linear-gradient(135deg, rgba(255,127,0,0.92), rgba(24,20,18,0.96))",
            border: "3px solid #ffcc00",
            boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
            opacity: card1,
            transform: `translateX(${(1 - card1) * -60}px)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <span style={{ fontSize: 48 }}>🪠</span>
              <Flag code={LAST_DRIVER.id} h={54} />
              <div>
                <div style={{ color: "#fff7cc", fontSize: 17, fontWeight: 900, letterSpacing: 1.5 }}>
                  P20 DEAD LAST DRIVER · THE GOLDEN PLUNGER WINNER
                </div>
                <div style={{ color: "#fff", fontSize: 40, fontWeight: 900, lineHeight: 1.05 }}>
                  {`${LAST_DRIVER.country.toUpperCase()} (${LAST_DRIVER.id})`}
                </div>
                <div style={{ color: "rgba(255,255,255,0.9)", fontSize: 19, fontWeight: 700 }}>
                  {`${LAST_DRIVER.team} · ${LAST_DRIVER.wins} Wins · ${LAST_DRIVER.podiums} Podiums`}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#fff", fontSize: 54, fontWeight: 900, lineHeight: 1 }}>{LAST_DRIVER.points}</div>
              <div style={{ color: "#fff7cc", fontSize: 15, fontWeight: 900, letterSpacing: 1 }}>TOTAL PTS</div>
            </div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.25)", color: "#fff", fontSize: 19, fontWeight: 700 }}>
            🎁 <b>Consolation Prize:</b> One 24-Karat Toilet Plunger & a Garmin GPS after finishing 20th out of 20 countries on the World Tour!
          </div>
        </div>

        {/* Card 2: P10 Dead Last Scuderia */}
        <div
          style={{
            padding: "20px 26px",
            borderRadius: 18,
            background: darkCard,
            borderLeft: `8px solid ${LAST_SCUDERIA.colors[0]}`,
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            opacity: card2,
            transform: `translateX(${(1 - card2) * -60}px)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 40 }}>🔧</span>
              <Flag code={LAST_SCUDERIA.drivers[0]} h={38} />
              <Flag code={LAST_SCUDERIA.drivers[1]} h={38} />
              <div>
                <div style={{ color: gold, fontSize: 16, fontWeight: 900, letterSpacing: 1.5 }}>
                  P10 LAST PLACE SCUDERIA · “THE CHECK ENGINE LIGHT” AWARD
                </div>
                <div style={{ color: "#fff", fontSize: 30, fontWeight: 900 }}>
                  {`${LAST_SCUDERIA.name.toUpperCase()} (${LAST_SCUDERIA.drivers[0]} + ${LAST_SCUDERIA.drivers[1]})`}
                </div>
              </div>
            </div>
            <div style={{ color: "#ff6a00", fontSize: 32, fontWeight: 900 }}>{`${LAST_SCUDERIA.points} PTS`}</div>
          </div>
          <div style={{ marginTop: 8, color: "rgba(255,255,255,0.85)", fontSize: 18, fontWeight: 600 }}>
            {`Combined for ${LAST_SCUDERIA.points} points (${LAST_SCUDERIA.note}) across all 5 World Tour rounds. Sent back to the wind tunnel for a full rebuild!`}
          </div>
        </div>

        {/* Card 3: Official Sewer Pipe Inspector — P19 & P20 */}
        <div
          style={{
            padding: "20px 26px",
            borderRadius: 18,
            background: darkCard,
            borderLeft: "8px solid #38b6ff",
            boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            opacity: card3,
            transform: `translateX(${(1 - card3) * -60}px)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 40 }}>🕳️</span>
              <Flag code={PENULT_DRIVER.id} h={38} />
              <Flag code={LAST_DRIVER.id} h={38} />
              <div>
                <div style={{ color: "#38b6ff", fontSize: 16, fontWeight: 900, letterSpacing: 1.5 }}>
                  THE “MARIO BROS. PLUMBING” AWARD FOR KNOCKOUT INSPECTION
                </div>
                <div style={{ color: "#fff", fontSize: 28, fontWeight: 900 }}>
                  {`${PENULT_DRIVER.country.toUpperCase()} (${PENULT_DRIVER.points} PTS) & ${LAST_DRIVER.country.toUpperCase()} (${LAST_DRIVER.points} PTS)`}
                </div>
              </div>
            </div>
            <div style={{ color: "#38b6ff", fontSize: 24, fontWeight: 900 }}>VIP PLUMBERS</div>
          </div>
          <div style={{ marginTop: 8, color: "rgba(255,255,255,0.85)", fontSize: 18, fontWeight: 600 }}>
            Caught more times by the Knockout Checkpoints than any other drivers on the World Tour grid!
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

export const ChampionshipGala = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: "#080a10", fontFamily: font }}>
      <Audio src={staticFile("gp/gala-2027.wav")} />
      <ThreeCanvas width={width} height={height} dpr={quality().dpr} shadows gl={{ antialias: true, alpha: false }}>
        <GalaStage3D frame={frame} />
      </ThreeCanvas>
      {frame < 390 && <IntroOverlay frame={frame} fps={fps} />}
      {frame >= 390 && frame < 990 && <PodiumOverlay frame={frame} fps={fps} />}
      {frame >= 990 && frame < 1530 && <AnthemOverlay frame={frame} fps={fps} />}
      {frame >= 1530 && frame < 2070 && <ScuderiaOverlay frame={frame} fps={fps} />}
      {frame >= 2070 && <LoserOverlay frame={frame} fps={fps} />}
    </AbsoluteFill>
  );
};
