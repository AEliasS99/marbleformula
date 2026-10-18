import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  bounds,
  finishLine,
  fps,
  marbleRadius,
  marblePose,
  marbles,
  moverPose,
  movers,
  statics,
  winnerFrame,
  type Quat,
  type Vec3,
} from "./race";
import type { Shot } from "./camera";

// The 3D world. Components take the (possibly fractional) simulation frame `t`
// and the camera shot, and render a pure function of them.

export function CameraRig({ shot }: { shot: Shot }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  camera.fov = shot.fov;
  camera.updateProjectionMatrix();
  camera.position.set(...shot.pos);
  camera.lookAt(...shot.target);
  return null;
}

/** Image-based lighting from three's procedural studio room: glossy marbles need something to reflect. */
export function Environment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }, [gl, scene]);
  return null;
}

/** Key light that tracks the camera target so a small shadow map stays sharp. */
export function Sun({ target }: { target: Vec3 }) {
  const light = useMemo(() => {
    const l = new THREE.DirectionalLight("#fff1dc", 2.2);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.02;
    Object.assign(l.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
    return l;
  }, []);
  const [x, y, z] = target;
  light.position.set(x - 8, y + 18, z + 14);
  light.target.position.set(x, y, z);
  light.target.updateMatrixWorld();
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
}

// --- Procedural textures (canvas, built once) -------------------------------------

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Deterministic pseudo-random for texture detail (Math.random would differ per tab).
const hash = (n: number) => {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
};

const woodTexture = () =>
  canvasTexture(1024, 256, (g) => {
    g.fillStyle = "#c98d52";
    g.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 90; i++) {
      const y = hash(i) * 256;
      g.strokeStyle = `rgba(${hash(i + 1) > 0.5 ? "90,50,20" : "255,220,170"},${0.08 + hash(i + 2) * 0.12})`;
      g.lineWidth = 1 + hash(i + 3) * 3;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 4);
      g.stroke();
    }
  });

const gridTexture = () =>
  canvasTexture(512, 512, (g) => {
    g.fillStyle = "#151b2b";
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "rgba(140,160,220,0.10)";
    g.lineWidth = 2;
    for (let k = 0; k <= 512; k += 64) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k, 512);
      g.moveTo(0, k);
      g.lineTo(512, k);
      g.stroke();
    }
  });

const checkerTexture = (cols: number, rows: number) => {
  const t = canvasTexture(cols * 16, rows * 16, (g) => {
    for (let x = 0; x < cols; x++)
      for (let y = 0; y < rows; y++) {
        g.fillStyle = (x + y) % 2 ? "#111" : "#f4f4f4";
        g.fillRect(x * 16, y * 16, 16, 16);
      }
  });
  t.magFilter = THREE.NearestFilter;
  return t;
};

const bannerTexture = (text: string, color: string) =>
  canvasTexture(1024, 256, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 1024, 256);
    g.fillStyle = "white";
    g.font = "900 150px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 512, 138);
  });

/** Swirled glass-marble look: base colour, a white ribbon and a darker vein. */
const marbleTexture = (color: string, k: number) =>
  canvasTexture(256, 128, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 128);
    const ribbon = (offset: number, amp: number, width: number, style: string) => {
      g.strokeStyle = style;
      g.lineWidth = width;
      g.beginPath();
      for (let x = 0; x <= 256; x += 4) {
        const y = 64 + offset + Math.sin((x / 256) * Math.PI * 2 * 2 + k) * amp;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    };
    ribbon(0, 22, 14, "rgba(255,255,255,0.9)");
    ribbon(18, 14, 5, "rgba(0,0,0,0.25)");
  });

// --- Course -----------------------------------------------------------------------

export function Course() {
  const tex = useMemo(() => {
    const grid = gridTexture();
    grid.wrapS = grid.wrapT = THREE.RepeatWrapping;
    grid.repeat.set((bounds.xMax - bounds.xMin) / 2, (bounds.yMax - bounds.yMin) / 2);
    return {
      wood: woodTexture(),
      grid,
      checker: checkerTexture(2, 16), // box top: u runs along the 0.5 m strip, v across the depth
      start: bannerTexture("START", "#e5484d"),
      finish: bannerTexture("FINISH", "#111111"),
    };
  }, []);

  const material = (kind: string) => {
    switch (kind) {
      case "ramp":
        return <meshStandardMaterial map={tex.wood} roughness={0.55} />;
      case "peg":
        return <meshStandardMaterial color="#e9edf5" metalness={1} roughness={0.18} />;
      case "back":
        return <meshStandardMaterial map={tex.grid} roughness={0.9} />;
      case "glass":
        return (
          <meshPhysicalMaterial
            color="#cfe3ff"
            transparent
            opacity={0.07}
            roughness={0.04}
            metalness={0}
            envMapIntensity={2}
            depthWrite={false}
          />
        );
      default: // bumpers, basin
        return <meshStandardMaterial color="#232b3d" roughness={0.35} metalness={0.2} />;
    }
  };

  const fl = finishLine;
  const gate = movers.findIndex((m) => m.kind === "gate");
  const gateStart = movers[gate].poses[0];

  return (
    <>
      {statics.map((s, i) => (
        <mesh
          key={i}
          position={s.pos as Vec3}
          quaternion={s.quat as Quat}
          castShadow={s.kind === "ramp" || s.kind === "peg"}
          receiveShadow={s.kind !== "glass"}
          renderOrder={s.kind === "glass" ? 10 : 0}
        >
          {s.shape === "box" ? (
            <boxGeometry args={s.size as Vec3} />
          ) : (
            <cylinderGeometry args={[s.radius!, s.radius!, s.height!, 32]} />
          )}
          {material(s.kind)}
        </mesh>
      ))}

      {/* Finish strip across the last ramp, with a banner on the back wall above it. */}
      <mesh position={fl.pos as Vec3} quaternion={fl.quat as Quat} receiveShadow>
        <boxGeometry args={[0.5, 0.02, fl.depth]} />
        <meshStandardMaterial map={tex.checker} roughness={0.6} />
      </mesh>
      <mesh position={[fl.pos[0], fl.pos[1] + 2.6, -bounds.depth / 2 + 0.02]}>
        <planeGeometry args={[3.2, 0.8]} />
        <meshStandardMaterial map={tex.finish} roughness={0.7} />
      </mesh>
      <mesh position={[gateStart[0] - 1.6, gateStart[1] + 2.2, -bounds.depth / 2 + 0.02]}>
        <planeGeometry args={[3.2, 0.8]} />
        <meshStandardMaterial map={tex.start} roughness={0.7} />
      </mesh>

      {/* Floor under the tower. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, bounds.yMin - 0.31, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#0c0f17" roughness={1} />
      </mesh>
    </>
  );
}

export function Movers({ t }: { t: number }) {
  return (
    <>
      {movers.map((m, i) => {
        const { pos, quat } = moverPose(i, t);
        const gate = m.kind === "gate";
        return (
          <mesh key={i} position={pos} quaternion={quat} castShadow receiveShadow>
            <boxGeometry args={m.size as Vec3} />
            <meshStandardMaterial
              color={gate ? "#e5484d" : "#ffc53d"}
              roughness={0.3}
              metalness={gate ? 0.1 : 0.5}
            />
          </mesh>
        );
      })}
    </>
  );
}

export function Marbles({ t }: { t: number }) {
  const textures = useMemo(() => marbles.map((m, k) => marbleTexture(m.color, k * 1.7)), []);
  return (
    <>
      {marbles.map((_, i) => {
        const { pos, quat } = marblePose(i, t);
        return (
          <mesh key={i} position={pos} quaternion={quat} castShadow>
            <sphereGeometry args={[marbleRadius, 48, 32]} />
            <meshPhysicalMaterial
              map={textures[i]}
              roughness={0.08}
              clearcoat={1}
              clearcoatRoughness={0.03}
              envMapIntensity={1.4}
            />
          </mesh>
        );
      })}
    </>
  );
}

/**
 * Confetti burst at the finish line when the winner crosses. Each piece follows
 * a closed-form drag + gravity trajectory, so any frame can be computed directly.
 */
const CONFETTI = 260;
export function Confetti({ t }: { t: number }) {
  const { mesh, pieces } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(0.14, 0.08);
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 });
    const mesh = new THREE.InstancedMesh(geo, mat, CONFETTI);
    mesh.frustumCulled = false;
    const colors = marbles.map((m) => new THREE.Color(m.color));
    const pieces = Array.from({ length: CONFETTI }, (_, k) => {
      const a = hash(k * 3.1) * Math.PI * 2;
      const up = 6 + hash(k * 5.3) * 6;
      const out = 1.5 + hash(k * 7.7) * 4;
      mesh.setColorAt(k, colors[k % colors.length]);
      return {
        v: new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * Math.min(out, 1.6)),
        spin: new THREE.Vector3(hash(k) * 12 - 6, hash(k + 9) * 12 - 6, hash(k + 17) * 12 - 6),
        delay: hash(k * 11.3) * 0.25,
      };
    });
    return { mesh, pieces };
  }, []);

  const age = (t - winnerFrame) / fps;
  mesh.visible = age > 0 && age < 6;
  if (mesh.visible) {
    const origin = new THREE.Vector3(...(finishLine.pos as Vec3));
    const m = new THREE.Matrix4();
    const e = new THREE.Euler();
    const qq = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const DRAG = 1.6;
    const G = 4.5;
    pieces.forEach((p, k) => {
      const tt = Math.max(0, age - p.delay);
      const ex = (1 - Math.exp(-DRAG * tt)) / DRAG;
      const pos = origin
        .clone()
        .addScaledVector(p.v, ex)
        .add(new THREE.Vector3(0, (-G / DRAG) * (tt - ex), 0));
      e.set(p.spin.x * tt, p.spin.y * tt, p.spin.z * tt);
      qq.setFromEuler(e);
      s.setScalar(tt > 0 ? 1 : 0);
      m.compose(pos, qq, s);
      mesh.setMatrixAt(k, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return <primitive object={mesh} />;
}
