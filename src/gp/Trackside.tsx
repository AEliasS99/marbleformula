import { useMemo } from "react";
import * as THREE from "three";
import { TRACK } from "./trackMesh.js";
import { venueLayout, yawAlong } from "./venue.js";
import { getCircuitTheme } from "./Themes";
import type { Race, Vec3 } from "./race";

// Everything around the circuit, so wide shots show a race venue instead of a
// void: the service road under the track, grandstands with seated crowds, a
// pit building by the finish straight, floodlight masts, advertising boards
// and tyre stacks at the bends. All built from the track samples.

type Sample = { u: number; p: Vec3; t: Vec3; r: Vec3; n: Vec3; curv: number; w?: number };

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function textBoard(text: string, bg: string, fg: string, w = 1024, h = 192) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `900 ${h * 0.62}px 'Avenir Next', system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + h * 0.03);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  return t;
}

const BOARDS: [string, string, string][] = [
  ["MFC 2027", "#111216", "#ffffff"],
  ["ROLL FASTER", "#d8232a", "#ffffff"],
  ["GLASS & CHROME", "#ffffff", "#111216"],
  ["ROUND 5 · MONZA", "#0055a4", "#ffffff"],
  ["PIRELLO", "#ffcc00", "#111216"],
];

export function Trackside({ race }: { race: Race }) {
  const theme = getCircuitTheme(race);
  const built = useMemo(() => {
    const samples = race.data.samples as unknown as Sample[];
    const layout = venueLayout(samples, race.L) as unknown as {
      groundY: number;
      stands: { base: [number, number, number]; yaw: number; side: number; len: number }[];
      pit: { base: [number, number, number]; yaw: number; side: number } | null;
    };
    const groundY = layout.groundY;
    const flatRight = (s: Sample) => new THREE.Vector3(s.r[0], 0, s.r[2]).normalize();
    const flatFwd = (s: Sample) => new THREE.Vector3(s.t[0], 0, s.t[2]).normalize();
    const at = (u: number) => samples[Math.max(0, Math.min(samples.length - 1, Math.round((u - samples[0].u) / 0.5)))];
    const height = (s: Sample) => s.p[1] - groundY;
    const W2 = TRACK.width / 2;

    // Service road: a dark ribbon on the ground under the whole track.
    const road = (() => {
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      let n = 0;
      for (let k = 0; k < samples.length; k += 2) {
        const s = samples[k];
        const r = flatRight(s);
        for (const side of [-1, 1]) {
          pos.push(s.p[0] + r.x * side * 4.5, groundY + 0.03, s.p[2] + r.z * side * 4.5);
          uv.push(s.u / 6, side > 0 ? 1 : 0);
        }
        if (n > 0) idx.push(n * 2 - 2, n * 2 - 1, n * 2, n * 2, n * 2 - 1, n * 2 + 1);
        n++;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    })();

    // Grandstands and the pit building: placed by src/gp/venue.js, which the director also reads.
    const stands = layout.stands.map((st) => ({ ...st, base: new THREE.Vector3(...st.base) }));
    void height;
    // Seats: instanced, in coloured blocks, on every stand.
    const rows = 10;
    const seatGeo = new THREE.BoxGeometry(0.34, 0.3, 0.3);
    const seatColors = [theme.kerbColorA, theme.kerbColorB, ...theme.neonPalette];
    const seatCount = stands.reduce((n, st) => n + rows * Math.floor(st.len / 0.4), 0);
    const seats = new THREE.InstancedMesh(seatGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), Math.max(1, seatCount));
    let si = 0;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    stands.forEach((st, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.yaw);
      const cols = Math.floor(st.len / 0.4);
      for (let rI = 0; rI < rows; rI++)
        for (let c = 0; c < cols; c++) {
          const along = (c - cols / 2 + 0.5) * 0.4;
          const back = rI * 0.75 + 0.6;
          const up = 0.5 + rI * 0.46 + 0.15;
          const local = new THREE.Vector3(along, up, st.side * back);
          const world = local.applyQuaternion(q).add(st.base);
          m.compose(world, q, new THREE.Vector3(1, 1, 1));
          seats.setMatrixAt(si, m);
          // Blocks of colour, with the odd empty-looking darker seat.
          const block = Math.floor(c / 9 + k * 2) % seatColors.length;
          const col = new THREE.Color(seatColors[block]);
          if (hash(si * 3.3) < 0.12) col.multiplyScalar(0.55);
          seats.setColorAt(si, col);
          si++;
        }
    });
    seats.instanceMatrix.needsUpdate = true;
    if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
    seats.castShadow = true;
    seats.receiveShadow = true;

    // Floodlight masts around the venue.
    const masts: { pos: THREE.Vector3; yaw: number }[] = [];
    for (let k = 0; k < 6; k++) {
      const s = at(((k + 0.5) / 6) * race.L);
      const r = flatRight(s);
      const side = k % 2 ? 1 : -1;
      const t = flatFwd(s);
      masts.push({ pos: new THREE.Vector3(s.p[0], groundY, s.p[2]).addScaledVector(r, side * (W2 + 16)), yaw: yawAlong([t.x, 0, t.z]) + (side > 0 ? Math.PI : 0) });
    }

    // Advertising boards along the service road, facing the track.
    const activeBoards = theme.boards.length ? theme.boards : BOARDS;
    const boards: { pos: THREE.Vector3; yaw: number; tex: number }[] = [];
    for (let u = 16, k = 0; u < race.L - 10; u += 9, k++) {
      const s = at(u);
      if (Math.abs(s.curv) > 0.05) continue;
      const r = flatRight(s);
      const side = Math.floor(u / 40) % 2 ? 1 : -1;
      const t = flatFwd(s);
      boards.push({ pos: new THREE.Vector3(s.p[0], groundY, s.p[2]).addScaledVector(r, side * (W2 + 6.2)), yaw: yawAlong([t.x, 0, t.z]) + (side > 0 ? Math.PI : 0), tex: k % activeBoards.length });
    }
    const boardTex = activeBoards.map(([t, bg, fg]) => textBoard(t, bg, fg));

    // Tyre stacks at the bends, outside the road.
    const tyreGeo = new THREE.TorusGeometry(0.42, 0.17, 10, 24);
    const tyres: { pos: THREE.Vector3; band: boolean }[] = [];
    for (let k = 0; k < samples.length; k += 4) {
      const s = samples[k];
      if (Math.abs(s.curv) < 0.06 || s.u < 12 || s.u > race.L - 4) continue;
      const r = flatRight(s);
      const side = s.curv > 0 ? -1 : 1; // outside of the bend
      for (let st = 0; st < 3; st++)
        tyres.push({ pos: new THREE.Vector3(s.p[0], groundY + 0.17 + st * 0.34, s.p[2]).addScaledVector(r, side * (W2 + 5.4)), band: st === 1 });
    }
    const tyreMesh = new THREE.InstancedMesh(tyreGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), Math.max(1, tyres.length));
    tyres.forEach((t, i) => {
      m.compose(t.pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1));
      tyreMesh.setMatrixAt(i, m);
      tyreMesh.setColorAt(i, new THREE.Color(t.band ? (hash(i) < 0.5 ? theme.kerbColorA : theme.kerbColorB) : "#1b1c20"));
    });
    tyreMesh.instanceMatrix.needsUpdate = true;
    if (tyreMesh.instanceColor) tyreMesh.instanceColor.needsUpdate = true;
    tyreMesh.castShadow = true;

    const pit = layout.pit ? { base: new THREE.Vector3(...layout.pit.base), yaw: layout.pit.yaw, side: layout.pit.side } : null;

    return { road, stands, seats, masts, boards, boardTex, tyreMesh, pit, groundY };
  }, [race, theme]);

  const concrete = { color: "#c9c6bf", roughness: 0.85 } as const;
  const steel = { color: "#dfe2e8", metalness: 1, roughness: 0.25 } as const;
  return (
    <>
      <mesh geometry={built.road} receiveShadow>
        <meshStandardMaterial color={theme.trackFloorColor} roughness={0.9} />
      </mesh>

      {built.stands.map((st, i) => (
        <group key={i} position={st.base} rotation-y={st.yaw}>
          {/* Terraces: ten stepped tiers on a concrete base, a rear wall and a roof on posts. */}
          {Array.from({ length: 10 }, (_, rI) => (
            <mesh key={rI} position={[0, 0.5 + rI * 0.46 - 0.23, st.side * (rI * 0.75 + 0.6)]} castShadow receiveShadow>
              <boxGeometry args={[st.len, 0.46 + rI * 0.46, 0.75]} />
              <meshStandardMaterial {...concrete} />
            </mesh>
          ))}
          <mesh position={[0, 0.25, 0]} receiveShadow>
            <boxGeometry args={[st.len + 1, 0.5, 1.2]} />
            <meshStandardMaterial {...concrete} />
          </mesh>
          <mesh position={[0, 0.75, -st.side * 0.55]}>
            <boxGeometry args={[st.len + 1, 0.06, 0.06]} />
            <meshStandardMaterial {...steel} />
          </mesh>
          <mesh position={[0, 3.2, st.side * 8.2]} castShadow>
            <boxGeometry args={[st.len + 1, 5.6, 0.3]} />
            <meshStandardMaterial color="#e9e8e3" roughness={0.8} />
          </mesh>
          <mesh position={[0, 6.6, st.side * 4.4]} rotation-x={-st.side * 0.12} castShadow receiveShadow>
            <boxGeometry args={[st.len + 2, 0.18, 9.5]} />
            <meshStandardMaterial color="#f2f3f5" roughness={0.5} metalness={0.3} />
          </mesh>
          {Array.from({ length: Math.max(2, Math.round(st.len / 6)) }, (_, k) => (
            <mesh key={`p${k}`} position={[(k - (Math.max(2, Math.round(st.len / 6)) - 1) / 2) * 6, 3.4, st.side * 0.3]} castShadow>
              <cylinderGeometry args={[0.12, 0.12, 6.6, 16]} />
              <meshStandardMaterial {...steel} />
            </mesh>
          ))}
          <mesh position={[0, 6.0, -st.side * 0.35]} rotation-y={st.side > 0 ? Math.PI : 0}>
            <planeGeometry args={[st.len * 0.6, 1.1]} />
            <meshStandardMaterial map={built.boardTex[0]} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      <primitive object={built.seats} />

      {/* Pit building, its garages facing the track. */}
      {built.pit && (
      <group position={built.pit.base} rotation-y={built.pit.yaw + (built.pit.side > 0 ? Math.PI : 0)}>
        <mesh position={[0, 1.6, 0]} castShadow receiveShadow>
          <boxGeometry args={[26, 3.2, 7]} />
          <meshStandardMaterial color="#e6e6e2" roughness={0.75} />
        </mesh>
        <mesh position={[0, 3.3, 0]} castShadow>
          <boxGeometry args={[26.6, 0.25, 7.6]} />
          <meshStandardMaterial color="#9ea3ad" roughness={0.6} metalness={0.4} />
        </mesh>
        {Array.from({ length: 7 }, (_, k) => (
          <mesh key={k} position={[(k - 3) * 3.4, 1.3, 3.51]}>
            <planeGeometry args={[2.6, 2.3]} />
            <meshStandardMaterial color="#1d2430" roughness={0.2} metalness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, 2.95, 3.52]}>
          <planeGeometry args={[14, 0.9]} />
          <meshStandardMaterial map={built.boardTex[3]} roughness={0.6} />
        </mesh>
      </group>
      )}

      {built.masts.map((mt, i) => (
        <group key={`m${i}`} position={mt.pos} rotation-y={mt.yaw}>
          <mesh position={[0, 11, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.26, 22, 12]} />
            <meshStandardMaterial {...steel} />
          </mesh>
          <mesh position={[0, 22.3, 0]} castShadow>
            <boxGeometry args={[3.2, 1.0, 0.4]} />
            <meshStandardMaterial color="#2a2d33" roughness={0.6} />
          </mesh>
          {[-1.1, -0.37, 0.37, 1.1].map((x) => (
            <mesh key={x} position={[x, 22.3, 0.22]}>
              <planeGeometry args={[0.6, 0.7]} />
              <meshStandardMaterial color="#ffffff" emissive="#fff6e0" emissiveIntensity={1.2} />
            </mesh>
          ))}
        </group>
      ))}

      {built.boards.map((b, i) => (
        <group key={`b${i}`} position={b.pos} rotation-y={b.yaw}>
          <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
            <boxGeometry args={[7, 1.3, 0.12]} />
            <meshStandardMaterial map={built.boardTex[b.tex]} roughness={0.55} />
          </mesh>
          {[-3, 3].map((x) => (
            <mesh key={x} position={[x, 0.4, -0.2]}>
              <boxGeometry args={[0.1, 0.8, 0.3]} />
              <meshStandardMaterial {...steel} />
            </mesh>
          ))}
        </group>
      ))}

      <primitive object={built.tyreMesh} />
    </>
  );
}
