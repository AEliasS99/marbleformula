import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {drawFlag,FLAGS} from "./flags";
export function bakedTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  draw(g);
  const src = g.getImageData(0, 0, w, h).data;
  // Rows flipped: a data texture's first row is the bottom (v = 0).
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) data.set(src.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  c.width = c.height = 0;
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 16;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
export function carLiveryTexture(code: string, color?: string, carNum = 1) {
  const W = 1024;
  const H = 1024;
  const flag = (FLAGS as Record<string, { colors: readonly string[] }>)[code];
  const base = color ?? flag?.colors[0] ?? "#d82828";
  const accent = flag?.colors.find((c) => c.toLowerCase() !== base.toLowerCase()) ?? "#ffffff";
  const third = flag?.colors[2] ?? "#ffcc00";

  return bakedTexture(W, H, (g) => {
    // 1. Metallic team paint base with 3D crown highlight & dark carbon lower skirts
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.0, "#10131a");
    grad.addColorStop(0.11, "#161a24");
    grad.addColorStop(0.14, base);
    grad.addColorStop(0.42, base);
    grad.addColorStop(0.5, "#ffffff");
    grad.addColorStop(0.58, base);
    grad.addColorStop(0.86, base);
    grad.addColorStop(0.89, "#161a24");
    grad.addColorStop(1.0, "#10131a");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // Blend base over centerline so the highlight is a soft metallic sheen
    g.globalAlpha = 0.72;
    g.fillStyle = base;
    g.fillRect(0, H * 0.14, W, H * 0.72);
    g.globalAlpha = 1;

    // 2. Carbon-fiber weave & neon edge pin-stripes on side skirts
    g.fillStyle = accent;
    g.fillRect(0, H * 0.135, W, 6);
    g.fillRect(0, H * 0.859, W, 6);

    // 3. Twin Le Mans / Formula center racing stripes running nose-to-tail
    g.fillStyle = accent;
    g.fillRect(0, H * 0.452, W, H * 0.034);
    g.fillRect(0, H * 0.514, W, H * 0.034);
    g.fillStyle = third;
    g.fillRect(0, H * 0.488, W, H * 0.024);

    // 4. Prominent Country Flag on the Front Hood / Nosecone (u ∈ [0.64, 0.88])
    const fx = W * 0.64;
    const fw = W * 0.24;
    const fy = H * 0.32;
    const fh = H * 0.36;
    drawFlag(g, code, fx, fy, fw, fh);
    g.strokeStyle = "#11141c";
    g.lineWidth = 6;
    g.strokeRect(fx, fy, fw, fh);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 2.5;
    g.strokeRect(fx - 3, fy - 3, fw + 6, fh + 6);

    // 5. Prominent Country Flag on Rear Engine Cover / Deck (u ∈ [0.12, 0.36], visible from chase & grid cameras!)
    drawFlag(g, code, W * 0.12, H * 0.30, W * 0.24, H * 0.40);
    g.strokeStyle = "#11141c";
    g.lineWidth = 6;
    g.strokeRect(W * 0.12, H * 0.30, W * 0.24, H * 0.40);

    // 6. Twin Country Flags on Left & Right Sidepods (u ∈ [0.34, 0.58])
    for (const sy of [H * 0.155, H * 0.665]) {
      drawFlag(g, code, W * 0.34, sy, W * 0.24, H * 0.18);
      g.strokeStyle = "#11141c";
      g.lineWidth = 5;
      g.strokeRect(W * 0.34, sy, W * 0.24, H * 0.18);
    }

    // 7. Aero heat-extractor carbon louvers on rear sidepods (u ∈ [0.16, 0.29])
    g.fillStyle = "rgba(10,12,18,0.82)";
    for (let k = 0; k < 6; k++) {
      const lx = W * (0.16 + k * 0.02);
      g.fillRect(lx, H * 0.18, W * 0.009, H * 0.09);
      g.fillRect(lx, H * 0.73, W * 0.009, H * 0.09);
    }

    // 8. Racing Number Roundel on Nosecone (u = 0.91), Rear Deck (u = 0.24), & Both Flanks (u = 0.46)
    const drawRoundel = (cx: number, cy: number, r: number) => {
      g.fillStyle = "#f8fafd";
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = Math.max(3, r * 0.12);
      g.strokeStyle = "#11131a";
      g.stroke();
      g.fillStyle = "#11131a";
      g.font = `900 ${Math.round(r * 1.25)}px 'Avenir Next', system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(carNum), cx, cy + r * 0.06);
    };
    drawRoundel(W * 0.91, H * 0.5, 38);
    drawRoundel(W * 0.24, H * 0.5, 42);
    drawRoundel(W * 0.46, H * 0.245, 38);
    drawRoundel(W * 0.46, H * 0.755, 38);
  });
}

export function createCarGeometries() {
    const bump = (x: number, c: number, w: number) => Math.exp(-Math.pow((x - c) / w, 2));

    // True 3D multi-station lofted car body with plan-view UVs (u along length X, v across width Z)
    const buildLoftedHull = (style: 0 | 1 | 2 | 3) => {
      const NX = 56;
      const NR = 48;
      const xMin = -0.43;
      const xMax = 0.55;
      const pos: number[] = [];
      const uvs: number[] = [];
      const idx: number[] = [];

      for (let ix = 0; ix <= NX; ix++) {
        const u = ix / NX;
        const x = xMin + u * (xMax - xMin);
        const noseT = Math.max(0, (x - 0.16) / (xMax - 0.16));
        const tailT = Math.max(0, (-0.18 - x) / (-0.18 - xMin));

        // 1) Half-width profile w(x) for each racing class
        let halfW = 0.21;
        if (style === 0) {
          // Formula Apex: needle nosecone -> wide Venturi sidepods -> tight coke-bottle rear
          const noseW = 0.036 + 0.068 * (1 - Math.pow(noseT, 1.35));
          const podBulge = 0.135 * bump(x, -0.03, 0.22);
          const rearTap = 1 - 0.38 * Math.pow(tailT, 1.4);
          halfW = x > 0.18 ? noseW : (0.102 + podBulge) * rearTap;
        } else if (style === 1) {
          // Le Mans Hypercar / Cyber-GT: wide low nose + muscular front/rear wheel arches + pinched waist
          const fArch = 0.038 * bump(x, 0.25, 0.13);
          const rArch = 0.045 * bump(x, -0.24, 0.14);
          const waist = -0.022 * bump(x, 0.01, 0.14);
          const noseRound = x > 0.42 ? 1 - 0.32 * Math.pow((x - 0.42) / (xMax - 0.42), 2) : 1;
          halfW = (0.225 + fArch + rArch + waist) * noseRound;
        } else if (style === 2) {
          // Dakar / WRC Rally Raid Prototype: wide muscular off-road stance with flared arches
          const arch = 0.034 * bump(x, 0.25, 0.13) + 0.038 * bump(x, -0.24, 0.14);
          const noseRound = x > 0.38 ? 1 - 0.28 * Math.pow((x - 0.38) / (xMax - 0.38), 2) : 1;
          halfW = (0.215 + arch) * noseRound;
        } else {
          // Bonneville Jet-Streamliner: supersonic needle nose + twin side nacelles + turbine tail
          const noseTap = x > 0.15 ? 1 - 0.72 * Math.pow((x - 0.15) / (xMax - 0.15), 1.45) : 1;
          const nacelle = 0.065 * bump(x, -0.06, 0.25);
          halfW = (0.145 + nacelle) * noseTap;
        }

        // Longitudinal tip closure at very front/back
        const tipScale = ix === 0 || ix === NX ? 0.08 : ix === 1 || ix === NX - 1 ? 0.68 : 1;
        const w = halfW * tipScale;

        // 2) Vertical profile: floor yBot(x), central spine yCenter(x), and outer pontoon/fender ySide(x)
        const noseLift = x > 0.35 ? 0.028 * Math.pow((x - 0.35) / 0.2, 1.6) : 0;
        const tailDiffuser = x < -0.26 ? 0.032 * Math.pow((-0.26 - x) / 0.17, 1.5) : 0;
        const yBot = (style === 2 ? -0.225 : -0.242) + noseLift + tailDiffuser;

        // Centerline height (nose slope + recessed cockpit tub + raised airbox / engine cover spine)
        const cockpitDip = -0.065 * bump(x, 0.02, 0.115);
        const airboxHump = (style === 2 ? 0.095 : style === 1 ? 0.075 : 0.088) * bump(x, -0.17, 0.16);
        const noseSlope = x > 0.12 ? -0.085 * Math.pow((x - 0.12) / (xMax - 0.12), 1.25) : 0;
        const tailSlope = x < -0.22 ? -0.045 * Math.pow((-0.22 - x) / (-0.22 - xMin), 1.4) : 0;
        const yCenterBase = (style === 2 ? -0.078 : -0.102) + cockpitDip + airboxHump + noseSlope + tailSlope;

        // Outer flank / fender / sidepod shoulder height
        let yFlankBase = yCenterBase - 0.028;
        if (style === 0) {
          // F1 Venturi sidepod shoulder
          yFlankBase = -0.158 + 0.052 * bump(x, 0.03, 0.17) - 0.035 * noseT;
        } else if (style === 1) {
          // LMP / GT3 tall sculpted front & rear wheel-arch fenders with low central hood channel
          const fenderH = 0.078 * bump(x, 0.25, 0.13) + 0.086 * bump(x, -0.24, 0.14);
          yFlankBase = -0.155 + fenderH;
        } else if (style === 2) {
          // Rally Raid high fender arches
          const fenderH = 0.065 * bump(x, 0.25, 0.13) + 0.068 * bump(x, -0.24, 0.14);
          yFlankBase = -0.125 + fenderH;
        }

        for (let ir = 0; ir <= NR; ir++) {
          const vRing = ir / NR;
          const theta = vRing * Math.PI * 2; // 0 = top-center, π/2 = right flank, π = bottom-center, 3π/2 = left flank
          const sinT = Math.sin(theta);
          const cosT = Math.cos(theta);

          // Super-elliptical cross-section with aerodynamic sidepod undercut
          const absSin = Math.abs(sinT);
          const signZ = sinT >= 0 ? 1 : -1;
          const zNorm = signZ * Math.pow(absSin, 0.82);
          let z = zNorm * w;

          // Undercut on lower sidepods so flanks curve inward at the floor
          if (cosT < 0 && style !== 3) {
            const undercut = 1 - 0.18 * Math.pow(-cosT, 0.8) * bump(x, -0.04, 0.24);
            z *= undercut;
          }

          let y: number;
          if (cosT >= 0) {
            // Upper deck: blend smoothly between centerline (airbox / cockpit tub) and outer fender/sidepod shoulders
            const lat = absSin;
            const shoulderBlend = Math.sin(lat * Math.PI * 0.88);
            const yDeck = yCenterBase * (1 - 0.68 * shoulderBlend) + yFlankBase * (0.68 * shoulderBlend);
            // Cockpit coaming rim around the driver opening
            const coaming = 0.022 * bump(x, 0.02, 0.12) * bump(lat, 0.42, 0.16);
            const crown = Math.pow(cosT, 0.55);
            y = yBot + (yDeck + coaming - yBot) * (0.32 + 0.68 * crown);
          } else {
            // Lower hull: flat Venturi floor with beveled outer chine
            const bottomFlat = Math.pow(-cosT, 0.42);
            const yMid = 0.5 * (yBot + yFlankBase);
            y = yMid - (yMid - yBot) * bottomFlat;
          }

          if (ix === 0 || ix === NX) {
            y = 0.5 * (yBot + yCenterBase) + 0.08 * cosT * tipScale;
          }

          pos.push(x, y, z);
          // Plan-view UV mapping: u along length, v across width from left flank (0) to right flank (1)
          const uvU = Math.max(0.01, Math.min(0.99, u));
          const uvV = Math.max(0.02, Math.min(0.98, 0.5 + (z / Math.max(0.18, halfW * 2.15))));
          uvs.push(uvU, uvV);
        }
      }

      for (let ix = 0; ix < NX; ix++) {
        for (let ir = 0; ir < NR; ir++) {
          const a = ix * (NR + 1) + ir;
          const b = a + NR + 1;
          idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    };

    // Sculpted 3D Swept Delta Front Wing Mainplane
    const fwShape = new THREE.Shape();
    fwShape.moveTo(0.08, 0);
    fwShape.quadraticCurveTo(0.07, 0.16, 0.015, 0.285);
    fwShape.lineTo(-0.075, 0.285);
    fwShape.quadraticCurveTo(-0.03, 0.14, -0.045, 0);
    fwShape.quadraticCurveTo(-0.03, -0.14, -0.075, -0.285);
    fwShape.lineTo(0.015, -0.285);
    fwShape.quadraticCurveTo(0.07, -0.16, 0.08, 0);
    const f1FrontWing = new THREE.ExtrudeGeometry(fwShape, {
      depth: 0.018,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.006,
      bevelThickness: 0.006,
      curveSegments: 24,
    });
    f1FrontWing.rotateX(Math.PI / 2);
    f1FrontWing.computeVertexNormals();

    // Sculpted 3D Swept Rear Wing Airfoil Plane
    const rwShape = new THREE.Shape();
    rwShape.moveTo(0.065, 0);
    rwShape.quadraticCurveTo(0.055, 0.15, 0.03, 0.255);
    rwShape.lineTo(-0.065, 0.255);
    rwShape.quadraticCurveTo(-0.045, 0.14, -0.055, 0);
    rwShape.quadraticCurveTo(-0.045, -0.14, -0.065, -0.255);
    rwShape.lineTo(0.03, -0.255);
    rwShape.quadraticCurveTo(0.055, -0.15, 0.065, 0);
    const rearWingPlane = new THREE.ExtrudeGeometry(rwShape, {
      depth: 0.014,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.005,
      bevelThickness: 0.005,
      curveSegments: 24,
    });
    rearWingPlane.rotateX(Math.PI / 2);
    rearWingPlane.computeVertexNormals();

    // Sculpted Wing Endplate (curved profile)
    const epShape = new THREE.Shape();
    epShape.moveTo(-0.09, -0.03);
    epShape.lineTo(0.09, -0.03);
    epShape.quadraticCurveTo(0.11, 0.02, 0.06, 0.075);
    epShape.lineTo(-0.08, 0.085);
    epShape.quadraticCurveTo(-0.11, 0.03, -0.09, -0.03);
    const wingEndplate = new THREE.ExtrudeGeometry(epShape, {
      depth: 0.012,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      curveSegments: 20,
    });
    wingEndplate.translate(0, 0, -0.006);
    wingEndplate.computeVertexNormals();

    // 3D Titanium Halo Hoop (TubeGeometry along a 3D curve around the cockpit)
    const haloCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.09, -0.055, -0.095),
      new THREE.Vector3(0.03, -0.012, -0.082),
      new THREE.Vector3(0.145, -0.018, 0),
      new THREE.Vector3(0.03, -0.012, 0.082),
      new THREE.Vector3(-0.09, -0.055, 0.095),
    ]);
    const haloHoop = new THREE.TubeGeometry(haloCurve, 32, 0.014, 12, false);

    // LatheGeometry Rounded-Shoulder Racing Slick Tire (aligned with Z-axis via rotation-x = Math/2)
    const buildTireGeo = (rOuter: number, rInner: number, width: number) => {
      const hw = width / 2;
      const sh = width * 0.18;
      const pts = [
        new THREE.Vector2(rInner, -hw * 0.88),
        new THREE.Vector2(rOuter * 0.92, -hw),
        new THREE.Vector2(rOuter, -hw + sh),
        new THREE.Vector2(rOuter, hw - sh),
        new THREE.Vector2(rOuter * 0.92, hw),
        new THREE.Vector2(rInner, hw * 0.88),
        new THREE.Vector2(rInner * 0.92, 0),
        new THREE.Vector2(rInner, -hw * 0.88),
      ];
      const g = new THREE.LatheGeometry(pts, 40);
      g.rotateX(Math.PI / 2);
      g.computeVertexNormals();
      return g;
    };

    // 6-Spoke 3D Star Alloy Wheel Rim (3D torus rim lips + 6 radial 3D spokes)
    const buildSpokeRim = (rRim: number, width: number) => {
      const parts: THREE.BufferGeometry[] = [];
      const lipOut = new THREE.TorusGeometry(rRim * 0.92, rRim * 0.095, 14, 36);
      const lipIn = lipOut.clone();
      lipOut.translate(0, 0, width * 0.36);
      lipIn.translate(0, 0, -width * 0.36);
      parts.push(lipOut, lipIn);
      for (let k = 0; k < 6; k++) {
        const ang = (k * Math.PI) / 3;
        const sp = new THREE.BoxGeometry(rRim * 1.72, rRim * 0.15, width * 0.22);
        sp.rotateZ(ang);
        sp.translate(0, 0, width * 0.18);
        const spIn = sp.clone();
        spIn.translate(0, 0, -width * 0.36);
        parts.push(sp, spIn);
      }
      const merged = mergeGeometries(parts);
      merged.computeVertexNormals();
      return merged;
    };

    return {
      hulls: [buildLoftedHull(0), buildLoftedHull(1), buildLoftedHull(2), buildLoftedHull(3)],
      f1FrontWing,
      rearWingPlane,
      wingEndplate,
      haloHoop,
      tireFront: buildTireGeo(0.132, 0.076, 0.112),
      tireRear: buildTireGeo(0.144, 0.082, 0.134),
      tireRally: buildTireGeo(0.146, 0.08, 0.128),
      rimFront: buildSpokeRim(0.078, 0.112),
      rimRear: buildSpokeRim(0.085, 0.134),
    };
}


export type CarWheel = [number, number, number];
export function CarBody({carGeoms,carStyle,teamColor,texture,helmetTexture=texture,night=false,onWheel=()=>{},onFlame=()=>{},onBrake=()=>{},driverView=false,onCockpitPart=()=>{},physics,wheelY,materials,realistic=false}: {
 carGeoms:ReturnType<typeof createCarGeometries>;carStyle:0|1|2|3;teamColor:string;texture:THREE.Texture;helmetTexture?:THREE.Texture;night?:boolean;
 onWheel?:(index:number,el:THREE.Object3D|null)=>void;onFlame?:(index:number,el:THREE.Object3D|null)=>void;onBrake?:(el:THREE.Mesh|null)=>void;
 driverView?:boolean;onCockpitPart?:(part:'helmet'|'glass'|'exterior'|'interior'|'steering',el:THREE.Object3D|null)=>void;
 physics?:{size:number;wheels:CarWheel[]};
 realistic?:boolean;wheelY?:number[];materials?:{rubberNormal:THREE.Texture;rubberRoughness:THREE.Texture;carbonColor:THREE.Texture;carbonNormal:THREE.Texture};
}) {
 const wheels=()=>((
                  [
                    [0.26, -0.195, -0.262, true, 0],
                    [0.26, -0.195, 0.262, true, 1],
                    [-0.25, -0.185, -0.272, false, 2],
                    [-0.25, -0.185, 0.272, false, 3],
                  ] as const
                ).map(([wx, wy, wz, isFront, wIdx]) => {
                  const wr = isFront ? 0.132 : 0.144;
                  const ww = isFront ? 0.112 : 0.134;
                  const signZ = physics ? (wIdx % 2 ? -1 : 1) : wz >= 0 ? 1 : -1;
                  return (
                    <group key={wIdx} position={physics ? [isFront ? .55 : -.55, -physics.wheels[wIdx][2] / physics.size, (wIdx % 2 ? -.45 : .45)] : [wx, wheelY?.[wIdx]??wy, wz]} rotation={physics ? [0, physics.wheels[wIdx][0], -physics.wheels[wIdx][1]] : undefined} scale={physics ? [.23 / wr, .23 / wr, .15 / ww] : undefined} ref={(el) => void onWheel(wIdx, el)}>
                      {/* LatheGeometry Rounded-Shoulder Racing Slick Tire */}
                      <mesh
                        geometry={carStyle === 2 ? carGeoms.tireRally : isFront ? carGeoms.tireFront : carGeoms.tireRear}
                        castShadow
                        receiveShadow
                      >
                        <meshStandardMaterial color={materials?'#191b20':'#121419'} roughness={materials ? .88:.68} metalness={materials ? .015:.16} normalMap={materials?.rubberNormal} roughnessMap={materials?.rubberRoughness} normalScale={materials?new THREE.Vector2(.055,.055):undefined}/>
                      </mesh>
                      {/* Pirelli-Style Colored Sidewall Stripe Ring on Outer Face */}
                      <mesh position={[0, 0, signZ * (ww * 0.495)]} rotation={[0, signZ > 0 ? 0 : Math.PI, 0]}>
                        <ringGeometry args={[wr * 0.66, wr * 0.78, 36]} />
                        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={materials ? .035:.48} roughness={materials ? .58:.22} metalness={materials ? .12:.6} side={THREE.DoubleSide} />
                      </mesh>
                      {/* 6-Spoke 3D Star Forged Alloy Wheel Rim */}
                      <mesh
                        geometry={isFront ? carGeoms.rimFront : carGeoms.rimRear}
                        rotation={[0, signZ > 0 ? 0 : Math.PI, 0]}
                        castShadow
                      >
                        <meshStandardMaterial color="#e6ecf5" roughness={0.15} metalness={0.94} />
                      </mesh>
                      {/* Anodized Center-Lock Wheel Nut */}
                      <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[wr * 0.16, wr * 0.16, ww * 0.92, 18]} />
                        <meshStandardMaterial color={teamColor} roughness={0.18} metalness={0.88} />
                      </mesh>
                    </group>
                  );
                }));
 return <group>              <group scale={physics ? [1.6, 1.6, 1.5] : [1.22, .92, 1.05]} position={physics ? [0, .18, 0] : undefined}>
                {/* 1. Ground-Effect Carbon-Fiber Underbody Floor Plank & Rear Diffuser */}
                <mesh position={[0.02, -0.242, 0]} castShadow receiveShadow>
                  <boxGeometry args={[0.78, 0.016, carStyle === 1 ? 0.48 : 0.42]} />
                  <meshStandardMaterial color={materials?'#ffffff':'#12151d'} map={materials?.carbonColor} normalMap={materials?.carbonNormal} normalScale={materials?new THREE.Vector2(.12,.12):undefined} metalness={materials ? .06:.55} roughness={materials ? .55:.32} />
                </mesh>
                {/* Glowing Constructor Floor Edge LED Underglow Strips */}
                {([-1, 1] as const).map((side) => (
                  <mesh key={`fl${side}`} position={[0.0, -0.236, side * (carStyle === 1 ? 0.242 : 0.212)]}>
                    <boxGeometry args={[0.48, 0.012, 0.012]} />
                    <meshStandardMaterial color="#ffffff" emissive={teamColor} emissiveIntensity={realistic?.08:2.4} toneMapped={false} />
                  </mesh>
                ))}

                {/* 2. True 3D Lofted Aerodynamic Bodywork with Plan-View Country Flag & Racing Livery */}
                <mesh geometry={carGeoms.hulls[carStyle]} castShadow receiveShadow>
                  <meshPhysicalMaterial
                    map={texture}
                    emissiveMap={texture}
                    emissive="#ffffff"
                    emissiveIntensity={realistic?0:.14}
                    metalness={realistic?.22:.42}
                    roughness={realistic?.26:.18}
                    clearcoat={1}
                    clearcoatRoughness={realistic?.16:.04}
                    envMapIntensity={realistic?.85:night?1.4:1.1}
                  />
                </mesh>

                {/* 3. Sidepod Radiator Intakes & Aero Mirrors (Styles 0 & 1) */}
                {(carStyle === 0 || carStyle === 1) &&
                  ([-1, 1] as const).map((side) => (
                    <group key={`sp${side}`}>
                      {/* Dark carbon radiator intake mouth on front of sidepods */}
                      <mesh position={[0.14, -0.145, side * 0.165]} rotation={[0, side * 0.18, 0]}>
                        <boxGeometry args={[0.03, 0.068, 0.095]} />
                        <meshStandardMaterial color="#0b0d12" roughness={0.85} metalness={0.2} />
                      </mesh>
                      {/* Sculpted wing mirror pod on stalk */}
                      <mesh position={[0.11, -0.055, side * 0.155]} rotation={[0.3 * side, 0, -0.2]}>
                        <boxGeometry args={[0.045, 0.022, 0.036]} />
                        <meshPhysicalMaterial color={teamColor} metalness={0.6} roughness={0.18} clearcoat={1} />
                      </mesh>
                    </group>
                  ))}

                {/* 4. Class 0 (Formula Apex): Swept Delta Multi-Element Front Wing + 3D Titanium Halo + Airbox Intake */}
                {carStyle === 0 && (
                  <group>
                    {/* Swept 3D Delta Carbon Front Wing + Team Secondary Flap + Curved Endplates */}
                    <group position={[0.49, -0.238, 0]}>
                      <mesh geometry={carGeoms.f1FrontWing} castShadow receiveShadow>
                        <meshStandardMaterial color="#161a22" metalness={0.65} roughness={0.26} />
                      </mesh>
                      <mesh geometry={carGeoms.f1FrontWing} position={[-0.025, 0.018, 0]} scale={[0.72, 1, 0.94]} rotation={[0, 0, 0.18]} castShadow>
                        <meshPhysicalMaterial color={teamColor} emissive={teamColor} emissiveIntensity={realistic?0:0.2} metalness={0.5} roughness={0.2} clearcoat={1} />
                      </mesh>
                      {([-1, 1] as const).map((side) => (
                        <mesh key={side} geometry={carGeoms.wingEndplate} position={[-0.01, 0.02, side * 0.282]} castShadow>
                          <meshPhysicalMaterial color="#f4f7fc" metalness={0.35} roughness={0.22} clearcoat={1} />
                        </mesh>
                      ))}
                    </group>
                    {/* 3D Titanium FIA Halo Protection Hoop + Front Pylon */}
                    <group ref={el=>onCockpitPart('exterior',el)} visible={!driverView}>
                    <mesh geometry={carGeoms.haloHoop} castShadow>
                      <meshStandardMaterial color="#202530" metalness={0.88} roughness={0.18} />
                    </mesh>
                    <mesh position={[0.135, -0.055, 0]} rotation={[0, 0, -0.38]} castShadow>
                      <cylinderGeometry args={[0.011, 0.013, 0.085, 16]} />
                      <meshStandardMaterial color="#202530" metalness={0.88} roughness={0.18} />
                    </mesh>
                    </group>
                    {/* Overhead Roll-Hoop Ram-Air Intake Scoop */}
                    <mesh position={[-0.105, -0.005, 0]} rotation={[0, 0, Math.PI / 2]}>
                      <cylinderGeometry args={[0.032, 0.038, 0.06, 20]} />
                      <meshStandardMaterial color="#0c0e14" metalness={0.5} roughness={0.4} />
                    </mesh>
                  </group>
                )}

                {/* 5. Class 1 (Le Mans Hypercar / Cyber-GT): Wraparound GT Windshield, Roof Scoop, Splitter, Dorsal Fin & Quad LEDs */}
                {carStyle === 1 && (
                  <group>
                    {/* Front Carbon GT Splitter Lip */}
                    <mesh position={[0.48, -0.242, 0]} castShadow>
                      <boxGeometry args={[0.14, 0.018, 0.52]} />
                      <meshStandardMaterial color="#11141c" metalness={0.7} roughness={0.24} />
                    </mesh>
                    {/* Curved Wraparound Smoked-Glass GT Windshield Visor */}
                    <mesh ref={el=>onCockpitPart('glass',el)} visible={!driverView} position={[0.09, -0.052, 0]} rotation={[0, Math.PI / 2, -0.32]}>
                      <cylinderGeometry args={[0.115, 0.138, 0.068, 32, 1, true, -Math.PI * 0.45, Math.PI * 0.9]} />
                      <meshPhysicalMaterial color="#090e18" emissive={teamColor} emissiveIntensity={realistic?0:0.25} metalness={0.92} roughness={0.05} clearcoat={1} side={THREE.DoubleSide} />
                    </mesh>
                    {/* GT3 Roof Halo Hoop + Overhead Ram-Air Scoop */}
                    <mesh ref={el=>onCockpitPart('exterior',el)} visible={!driverView} geometry={carGeoms.haloHoop} scale={[1.05, 1.02, 1.08]} castShadow>
                      <meshPhysicalMaterial color={teamColor} metalness={0.65} roughness={0.18} clearcoat={1} />
                    </mesh>
                    {/* LMP Central Carbon Dorsal Shark-Fin */}
                    <mesh position={[-0.24, -0.015, 0]} castShadow>
                      <boxGeometry args={[0.24, 0.11, 0.014]} />
                      <meshPhysicalMaterial color={teamColor} metalness={0.55} roughness={0.2} clearcoat={1} />
                    </mesh>
                    {/* Glowing Quad Cyber-GT Laser Headlights on Front Fenders */}
                    {([-1, 1] as const).map((side) => (
                      <mesh key={side} position={[0.42, -0.115, side * 0.195]} rotation={[0, -side * 0.22, 0.18]}>
                        <boxGeometry args={[0.055, 0.02, 0.082]} />
                        <meshStandardMaterial color="#e0ffff" emissive="#00f0ff" emissiveIntensity={realistic?1.2:3.6} toneMapped={false} />
                      </mesh>
                    ))}
                  </group>
                )}

                {/* 6. Class 2 (Dakar / WRC Rally Raid): Tubular Bull-Bar, Full Roll Cage, 4-Pod Roof Lightbar & Twin Spare Tires */}
                {carStyle === 2 && (
                  <group>
                    {/* Front Aluminum Skid-Plate & Bull-Bar */}
                    <mesh position={[0.48, -0.195, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                      <cylinderGeometry args={[0.022, 0.022, 0.36, 20]} />
                      <meshStandardMaterial color="#2a303c" metalness={0.85} roughness={0.22} />
                    </mesh>
                    {/* 3D Tubular Rally Roll Cage + Roof Rack */}
                    <group ref={el=>onCockpitPart('exterior',el)} visible={!driverView}>
                    <mesh geometry={carGeoms.haloHoop} position={[0, 0.025, 0]} scale={[1.15, 1.15, 1.18]} castShadow>
                      <meshStandardMaterial color={teamColor} metalness={0.7} roughness={0.22} />
                    </mesh>
                    {/* 4-Pod Rally Raid LED Roof Lightbar */}
                    {[-0.075, -0.025, 0.025, 0.075].map((lz, li) => (
                      <mesh key={li} position={[0.12, 0.055, lz]} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.02, 0.018, 0.032, 16]} />
                        <meshStandardMaterial color="#fffbe6" emissive="#ffdd66" emissiveIntensity={realistic?1.2:3.6} toneMapped={false} />
                      </mesh>
                    ))}
                    </group>
                    {/* Angled Rear Dakar Spare Wheel & Tire in Rear Bed */}
                    <group position={[-0.32, -0.055, 0]} rotation={[Math.PI / 2, 0.42, 0]}>
                      <mesh geometry={carGeoms.tireFront} scale={[0.82, 0.82, 0.82]} castShadow>
                        <meshStandardMaterial color="#15181f" roughness={0.72} metalness={0.18} />
                      </mesh>
                      <mesh geometry={carGeoms.rimFront} scale={[0.82, 0.82, 0.82]}>
                        <meshStandardMaterial color={teamColor} metalness={0.85} roughness={0.2} />
                      </mesh>
                    </group>
                  </group>
                )}

                {/* 7. Class 3 (Bonneville Jet-Streamliner): 8 Individual Chrome V8 Exhaust Headers, Twin Tailfins & Jet Turbine */}
                {carStyle === 3 && (
                  <group>
                    {/* 4 Individual Curved Chrome V8 Exhaust Pipes per Flank */}
                    {([-1, 1] as const).map((side) =>
                      [0.2, 0.09, -0.02, -0.13].map((px, pi) => (
                        <mesh key={`${side}-${pi}`} position={[px, -0.155, side * 0.175]} rotation={[side * 0.25, -side * 0.35, Math.PI / 2]} castShadow>
                          <cylinderGeometry args={[0.016, 0.021, 0.14, 16]} />
                          <meshStandardMaterial color="#eef4ff" metalness={0.96} roughness={0.07} />
                        </mesh>
                      )),
                    )}
                    {/* Twin Swept Supersonic Tailfins */}
                    {([-1, 1] as const).map((side) => (
                      <mesh key={side} geometry={carGeoms.wingEndplate} position={[-0.31, -0.04, side * 0.155]} scale={[1.35, 1.45, 1.2]} castShadow>
                        <meshPhysicalMaterial color={teamColor} emissive={teamColor} emissiveIntensity={realistic?0:0.22} metalness={0.55} roughness={0.18} clearcoat={1} />
                      </mesh>
                    ))}
                    {/* Massive Rear Jet-Turbine Nozzle & Multi-Stage Afterburner Plume */}
                    <mesh position={[-0.41, -0.145, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                      <cylinderGeometry args={[0.078, 0.062, 0.12, 32]} />
                      <meshStandardMaterial color="#1d222c" metalness={0.88} roughness={0.2} />
                    </mesh>
                    <mesh
                      visible={!physics&&!realistic} ref={(el) => void onFlame(0, el)}
                      position={[-0.52, -0.145, 0]}
                      rotation={[0, 0, Math.PI / 2]}
                    >
                      <coneGeometry args={[0.056, 0.22, 28]} />
                      <meshStandardMaterial color="#88f0ff" emissive="#ff6600" emissiveIntensity={3.8} toneMapped={false} />
                    </mesh>
                  </group>
                )}

                {/* 8. Recessed Driver Helmet + Iridescent Visor inside the Cockpit */}
                <group ref={el=>onCockpitPart('helmet',el)} visible={!driverView} position={[0.01, -0.068, 0]}>
                  <mesh castShadow>
                    <sphereGeometry args={[0.088, 36, 28]} />
                    <meshPhysicalMaterial
                      map={helmetTexture}
                      emissiveMap={helmetTexture}
                      emissive="#ffffff"
                      emissiveIntensity={0.18}
                      metalness={0.75}
                      roughness={0.14}
                      clearcoat={1}
                    />
                  </mesh>
                  <mesh position={[0.022, 0.008, 0]} rotation={[0, Math.PI / 2, -0.12]}>
                    <cylinderGeometry args={[0.091, 0.091, 0.044, 28, 1, true, -Math.PI * 0.36, Math.PI * 0.72]} />
                    <meshStandardMaterial color="#080c14" emissive={teamColor} emissiveIntensity={realistic?0:0.45} metalness={0.96} roughness={0.05} side={THREE.DoubleSide} />
                  </mesh>
                </group>

                {/* Seat-view interior: visible only to this car's own cockpit camera. */}
                <group ref={el=>onCockpitPart('interior',el)} visible={driverView}>
                  <mesh position={[.29,-.11,0]}><boxGeometry args={[.045,.018,.17]}/><meshStandardMaterial color="#141923" roughness={.65}/></mesh>
                  <group ref={el=>onCockpitPart('steering',el)} position={[.20,-.10,0]}>
                    <mesh rotation-y={Math.PI/2}><torusGeometry args={[.038,.005,12,40]}/><meshStandardMaterial color="#151a22" roughness={.52}/></mesh>
                    <mesh><boxGeometry args={[.01,.016,.055]}/><meshStandardMaterial color="#242c37" metalness={.5} roughness={.4}/></mesh>
                    <mesh position={[.008,.004,0]}><boxGeometry args={[.003,.012,.025]}/><meshStandardMaterial color="#49cfce" emissive="#49cfce" emissiveIntensity={.6}/></mesh>
                  </group>
                </group>
                {/* 9. Swan-Neck Dual-Plane Rear Wing + Curved Endplates + Rear Diffuser Strakes + FIA Rain Light & Twin Exhausts */}
                {carStyle !== 3 && (
                  <group position={[-0.37, -0.025, 0]}>
                    {/* Twin Swan-Neck Wing Pylons */}
                    {([-1, 1] as const).map((side) => (
                      <mesh key={`py${side}`} position={[0.04, -0.045, side * 0.068]} rotation={[0, 0, -0.22]} castShadow>
                        <boxGeometry args={[0.065, 0.105, 0.012]} />
                        <meshStandardMaterial color="#151922" metalness={0.75} roughness={0.25} />
                      </mesh>
                    ))}
                    {/* Lower Sculpted Carbon Mainplane + Upper Team-Colored DRS Swept Wing */}
                    <mesh geometry={carGeoms.rearWingPlane} position={[0.015, -0.008, 0]} scale={[1, 1, carStyle === 1 ? 1.06 : 0.96]} rotation={[0, 0, 0.06]} castShadow>
                      <meshStandardMaterial color="#151922" metalness={0.65} roughness={0.24} />
                    </mesh>
                    <mesh geometry={carGeoms.rearWingPlane} position={[-0.018, 0.024, 0]} scale={[0.88, 1, carStyle === 1 ? 1.06 : 0.96]} rotation={[0, 0, 0.14]} castShadow>
                      <meshPhysicalMaterial color={teamColor} emissive={teamColor} emissiveIntensity={realistic?0:0.26} metalness={0.55} roughness={0.16} clearcoat={1} />
                    </mesh>
                    {/* Sculpted Curved Rear Wing Endplates */}
                    {([-1, 1] as const).map((side) => (
                      <mesh key={side} geometry={carGeoms.wingEndplate} position={[0, -0.015, side * (carStyle === 1 ? 0.272 : 0.246)]} scale={[1.02, 1.22, 1]} castShadow>
                        <meshPhysicalMaterial color={teamColor} metalness={0.5} roughness={0.2} clearcoat={1} />
                      </mesh>
                    ))}
                    {/* 4 Vertical Carbon Venturi Diffuser Strakes under Rear Bumper */}
                    {[-0.15, -0.055, 0.055, 0.15].map((dz, di) => (
                      <mesh key={`df${di}`} position={[-0.02, -0.175, dz]}>
                        <boxGeometry args={[0.08, 0.048, 0.008]} />
                        <meshStandardMaterial color="#10131a" metalness={0.6} roughness={0.3} />
                      </mesh>
                    ))}
                    {/* Glowing Red FIA Rain Light / Cyber-GT Full-Width LED Taillight Bar (flares intensely under braking!) */}
                    <mesh ref={(el) => void onBrake(el)} position={[-0.045, -0.135, 0]}>
                      <boxGeometry args={[0.026, 0.032, carStyle === 1 ? 0.46 : 0.052]} />
                      <meshStandardMaterial color="#ff2233" emissive="#ff1122" emissiveIntensity={2.2} toneMapped={false} />
                    </mesh>
                    {/* Twin Titanium Exhaust Pipes with Recessed Glowing Core & Dynamic DRS/Overtake Afterburner Flames */}
                    {([-1, 1] as const).map((side, exIdx) => (
                      <group key={`ex${side}`} position={[-0.052, -0.132, side * 0.092]}>
                        <mesh rotation={[0, 0, Math.PI / 2]}>
                          <cylinderGeometry args={[0.022, 0.024, 0.062, 24]} />
                          <meshStandardMaterial color="#c8d4e8" metalness={0.92} roughness={0.15} />
                        </mesh>
                        <mesh position={[-0.029, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                          <cylinderGeometry args={[0.016, 0.016, 0.008, 20]} />
                          <meshStandardMaterial color="#77e8ff" emissive="#00c8ff" emissiveIntensity={2.8} toneMapped={false} />
                        </mesh>
                        <mesh
                          visible={!physics&&!realistic}
                          ref={(el) => void onFlame(exIdx, el)}
                          position={[-0.11, 0, 0]}
                          rotation={[0, 0, Math.PI / 2]}
                        >
                          <coneGeometry args={[0.024, 0.16, 20]} />
                          <meshStandardMaterial color="#88f8ff" emissive="#00d8ff" emissiveIntensity={realistic?1.2:3.6} transparent opacity={0.88} toneMapped={false} />
                        </mesh>
                      </group>
                    ))}
                  </group>
                )}

                {/* 10. Double-Wishbone Carbon Suspension Arms & Pushrods connecting Chassis to Wheel Hubs */}
                {(
                  [
                    [0.26, -0.195, -1],
                    [0.26, -0.195, 1],
                    [-0.25, -0.19, -1],
                    [-0.25, -0.19, 1],
                  ] as const
                ).map(([sx, sy, side], sIdx) => (
                  <group key={`susp${sIdx}`}>
                    {/* Upper & Lower Carbon Wishbone Arms */}
                    <mesh position={[sx, sy + 0.022, side * 0.165]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                      <cylinderGeometry args={[0.008, 0.008, 0.17, 10]} />
                      <meshStandardMaterial color="#181c24" metalness={0.75} roughness={0.25} />
                    </mesh>
                    <mesh position={[sx, sy - 0.022, side * 0.165]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                      <cylinderGeometry args={[0.009, 0.009, 0.17, 10]} />
                      <meshStandardMaterial color="#181c24" metalness={0.75} roughness={0.25} />
                    </mesh>
                    {/* Angled Coilover Pushrod */}
                    <mesh position={[sx - 0.01, sy + 0.035, side * 0.155]} rotation={[side * 0.62, 0, 0]}>
                      <cylinderGeometry args={[0.007, 0.007, 0.15, 10]} />
                      <meshStandardMaterial color={teamColor} metalness={0.8} roughness={0.2} />
                    </mesh>
                    {/* Non-rotating Slotted Carbon Brake Disc & Glowing Red Brembo Caliper */}
                    <mesh position={[sx, sy, side * (sIdx < 2 ? 0.24 : 0.25)]}>
                      <cylinderGeometry args={[0.064, 0.064, 0.016, 24]} />
                      <meshStandardMaterial color="#383e4c" metalness={0.85} roughness={0.28} />
                    </mesh>
                  </group>
                ))}

{!physics && wheels()}</group>{physics && wheels()}</group>;
}
