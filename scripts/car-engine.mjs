import { Vector3 } from "three";

// ============================================================================
// DEDICATED TCR CAR ENGINE (scripts/car-engine.mjs)
// - Separate physics & OBB (Oriented Bounding Box) Car-to-Car collision solver
//   so 3D car bodies (1.38m long x 0.76m wide) NEVER blend or clip into each other.
// - Car-specific track features only (Guided Shortcut Splits, FIA Tire Chicanes,
//   Nitro Boosters, Rumble Strips, Rally Crests — zero marble hammers/spinners/pegs/lifts).
// - Zero-White-Noise Harmonic Audio & Synthwave Soundtrack.
// ============================================================================

export const CAR_LEN = 1.54; // Full physical bumper-to-bumper car length (m)
export const CAR_WID = 0.88; // Full physical wheel-to-wheel car width (m)

/**
 * Replaces marble-only obstacles (spinners, hammers, peg forests, rollers, pushers, vortices, lifts, AND middle splitter walls)
 * with clean F1/GT DRS Attack Zones placed only on genuine straights.
 */
export function sanitizeCarFeatures(features, END) {
  // Keep zero middle-of-the-track splitter walls so cars have the full 4.2m asphalt width for real racing lines!
  const out = [];
  for (let u = 58; u < END - 48; u += 108) {
    out.push({ type: "booster", label: "DRS ATTACK ZONE", span: [1, 7], u: Math.round(u) });
  }
  return out;
}

/**
 * Precomputes a genuine Motorsport Telemetry Profile along the entire circuit:
 *  1) `vTarget[k]`: Forward-backward tire-grip speed profile (high top speed on straights ~18.5 m/s,
 *     progressive carbon-brake deceleration in braking zones before bends, and realistic apex speed
 *     v_apex = sqrt(mu * g / |curv|) ~9.8-13.5 m/s in corners — never crawling at 2-4 m/s!).
 *  2) `racingLat[k]`: Continuous Optimal Racing Line (Outside on corner entry -> Inside Apex kerb
 *     at peak curvature -> Outside on corner exit), smoothed with a 16-pass Gaussian filter.
 */
export function buildCarTelemetryProfile(course) {
  const samples = course.samples;
  const M = samples.length;
  const ds = course.SAMPLE ?? 0.5;

  // 1. Smooth curvature over ±10 samples (±5m) for tire-grip speed, and ±26 samples (±13m) for macro corner geometry
  const curvSmooth = new Float32Array(M);
  const curvMacro = new Float32Array(M);
  for (let k = 0; k < M; k++) {
    let sum = 0;
    let cnt = 0;
    for (let j = -10; j <= 10; j++) {
      const idx = Math.max(0, Math.min(M - 1, k + j));
      sum += samples[idx].curv;
      cnt++;
    }
    curvSmooth[k] = sum / cnt;

    let sumM = 0;
    let cntM = 0;
    for (let j = -26; j <= 26; j++) {
      const idx = Math.max(0, Math.min(M - 1, k + j));
      const w = Math.cos((j / 27) * (Math.PI / 2));
      sumM += samples[idx].curv * w;
      cntM += w;
    }
    curvMacro[k] = sumM / cntM;
  }

  // 2. Maximum cornering speed at each sample from lateral tire grip: v = sqrt(a_lat_max / |curv|)
  const V_TOP = 18.0; // Baseline straight-line top speed (m/s) before slipstream/DRS
  const V_MIN_APEX = 8.5; // Hairpin apex speed (m/s) — creates visible braking zones & corner-exit acceleration!
  const A_LAT_MAX = 8.4; // Lateral tire grip limit (m/s^2)
  const vTarget = new Float32Array(M);
  for (let k = 0; k < M; k++) {
    const absC = Math.max(Math.abs(curvSmooth[k]), Math.abs(curvMacro[k]) * 0.9);
    if (absC < 0.015) {
      vTarget[k] = V_TOP;
    } else {
      const vGrip = Math.sqrt(A_LAT_MAX / absC);
      vTarget[k] = Math.max(V_MIN_APEX, Math.min(V_TOP, vGrip));
    }
  }

  // 3. Backward pass: propagate Braking Zones upstream from every corner apex (a_brake = 11.5 m/s^2)
  const A_BRAKE = 11.5;
  for (let k = M - 2; k >= 0; k--) {
    const vMaxBrake = Math.sqrt(vTarget[k + 1] * vTarget[k + 1] + 2 * A_BRAKE * ds);
    if (vMaxBrake < vTarget[k]) vTarget[k] = vMaxBrake;
  }

  // 4. Forward pass: propagate progressive Corner-Exit Acceleration downstream (a_accel = 6.4 m/s^2)
  const A_ACCEL = 6.4;
  vTarget[0] = Math.min(vTarget[0], 9.5);
  for (let k = 1; k < M; k++) {
    const vMaxAccel = Math.sqrt(vTarget[k - 1] * vTarget[k - 1] + 2 * A_ACCEL * ds);
    if (vMaxAccel < vTarget[k]) vTarget[k] = vMaxAccel;
  }

  // 5. Optimal Racing Line (Outside on corner entry -> Inside Apex at peak curvature -> Outside exit)
  // Note: in season.mjs, curv > 0 means bending to the RIGHT (+r is INSIDE of the bend, -r is OUTSIDE!)
  // Using curvMacro treats multi-segment compound bends as a single continuous corner (zero mid-turn slaloming!)
  let racingLat = new Float32Array(M);
  for (let k = 0; k < M; k++) {
    const wMax = Math.max(0.6, Math.min(1.25, (samples[k].w ?? 2.1) - 0.72));
    const cNow = curvMacro[k];
    const cAhead = curvMacro[Math.min(M - 1, k + 28)]; // 14m ahead
    const cBehind = curvMacro[Math.max(0, k - 24)]; // 12m behind
    if (Math.abs(cNow) > 0.022) {
      // Clip the INSIDE apex kerb of the bend (+sign(curv) is the inside of the turn!)
      const apexDepth = Math.min(1.0, Math.abs(cNow) / 0.09);
      racingLat[k] = Math.sign(cNow) * wMax * (0.45 + 0.45 * apexDepth);
    } else if (Math.abs(cAhead) > 0.028) {
      // Approaching a bend: swing toward the OUTSIDE (-sign(cAhead)) to open up the turn entry!
      racingLat[k] = -Math.sign(cAhead) * wMax * 0.52;
    } else if (Math.abs(cBehind) > 0.028) {
      // Exiting a bend: track out toward the OUTSIDE edge (-sign(cBehind)) under throttle!
      racingLat[k] = -Math.sign(cBehind) * wMax * 0.48;
    } else {
      racingLat[k] = 0;
    }
  }

  // Smooth the racing line with 32 Gaussian passes so transitions are silky-smooth splines
  for (let pass = 0; pass < 32; pass++) {
    const next = new Float32Array(M);
    for (let k = 0; k < M; k++) {
      const prevL = racingLat[Math.max(0, k - 1)];
      const currL = racingLat[k];
      const nextL = racingLat[Math.min(M - 1, k + 1)];
      next[k] = 0.25 * prevL + 0.5 * currL + 0.25 * nextL;
    }
    racingLat = next;
  }

  const indexAtU = (u) => {
    const idx = Math.round((u - samples[0].u) / ds);
    return Math.max(0, Math.min(M - 1, idx));
  };

  return {
    vTargetAt: (u) => vTarget[indexAtU(u)],
    racingLatAt: (u) => racingLat[indexAtU(u)],
    curvSmoothAt: (u) => curvMacro[indexAtU(u)],
    isBrakingAt: (u) => {
      const k = indexAtU(u);
      const kAhead = Math.min(M - 1, k + 8);
      return vTarget[kAhead] < vTarget[k] - 0.35;
    },
  };
}

/**
 * Solves 3D Oriented Bounding Box (OBB) Car-to-Car collisions in the local track frame (u, lat, n).
 * Uses smooth, damped relaxation and continuous velocity matching (zero teleport spikes or rebound oscillation)
 * so car meshes never overlap or flicker!
 */
export function solveCarChassisCollisions({
  bodies,
  course,
  MARBLES,
  R,
  carTcrLane,
  carNextSwitch,
  t,
  impacts,
  step,
  lastImpact,
  finishFrame,
  dqFrame,
}) {
  const N = bodies.length;
  if (N < 2) return;

  // Run 4 damped relaxation passes per physics substep so wheel-to-wheel packs never clip
  for (let iter = 0; iter < 4; iter++) {
    for (let i = 0; i < N; i++) {
      if (dqFrame[i] !== null) continue;
      for (let j = i + 1; j < N; j++) {
        if (dqFrame[j] !== null) continue;

        const pi = bodies[i].translation();
        const pj = bodies[j].translation();
        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        const dz = pj.z - pi.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq > 6.5 || distSq < 1e-9) continue;

        // Evaluate local track basis at midpoint between cars i and j
        const mx = 0.5 * (pi.x + pj.x);
        const my = 0.5 * (pi.y + pj.y);
        const mz = 0.5 * (pi.z + pj.z);
        let bestS = course.samples[0];
        let bestD = Infinity;
        for (let k = 0; k < course.samples.length; k++) {
          const sp = course.samples[k].p;
          const d = (sp[0] - mx) ** 2 + (sp[1] - my) ** 2 + (sp[2] - mz) ** 2;
          if (d < bestD) {
            bestD = d;
            bestS = course.samples[k];
          }
        }

        const tg = bestS.t;
        const rg = bestS.r;
        const ng = bestS.n;

        // Project relative separation (pj - pi) onto track tangent (du), lateral (dLat), normal (dn)
        const du = dx * tg[0] + dy * tg[1] + dz * tg[2];
        const dLat = dx * rg[0] + dy * rg[1] + dz * rg[2];
        const dn = dx * ng[0] + dy * ng[1] + dz * ng[2];

        if (Math.abs(dn) > 0.65) continue;

        const absU = Math.abs(du);
        const absLat = Math.abs(dLat);

        if (absU >= CAR_LEN || absLat >= CAR_WID) continue;

        // Cars i and j overlap in their OBB footprint
        const penU = CAR_LEN - absU;
        const penLat = CAR_WID - absLat;

        // Weight separation by Constructor EST (Estabilidad 1-5: heavier cars hold their ground)
        const estI = MARBLES[i]?.stats?.est ?? 3;
        const estJ = MARBLES[j]?.stats?.est ?? 3;
        const wI = estJ / (estI + estJ);
        const wJ = estI / (estI + estJ);

        const vi = bodies[i].linvel();
        const vj = bodies[j].linvel();

        // Cap per-pass positional shift so cars separate cleanly without 1-frame teleports
        const maxStepShift = 0.045;

        if (penU / CAR_LEN <= (penLat / CAR_WID) * 1.15) {
          // NOSE-TO-TAIL BUMPER CONTACT: smooth longitudinal separation along tg
          const signU = du >= 0 ? 1 : -1; // +1 means j is ahead of i
          const shift = Math.min(maxStepShift, penU * 0.65 + 0.005);
          const wTrail = 0.68;
          const wLead = 0.32;
          const shiftI = signU > 0 ? -shift * wTrail : shift * wLead;
          const shiftJ = signU > 0 ? shift * wLead : -shift * wTrail;

          bodies[i].setTranslation(
            { x: pi.x + tg[0] * shiftI, y: pi.y + tg[1] * shiftI, z: pi.z + tg[2] * shiftI },
            true,
          );
          bodies[j].setTranslation(
            { x: pj.x + tg[0] * shiftJ, y: pj.y + tg[1] * shiftJ, z: pj.z + tg[2] * shiftJ },
            true,
          );

          // Smooth slipstream lane-change trigger + gentle longitudinal speed matching (zero velocity jump!)
          const vLongI = vi.x * tg[0] + vi.y * tg[1] + vi.z * tg[2];
          const vLongJ = vj.x * tg[0] + vj.y * tg[1] + vj.z * tg[2];
          const relLong = signU > 0 ? vLongI - vLongJ : vLongJ - vLongI;
          if (relLong > 0 && iter === 0) {
            const transfer = Math.min(0.45, relLong * 0.22);
            const latI = (pi.x - bestS.p[0]) * rg[0] + (pi.y - bestS.p[1]) * rg[1] + (pi.z - bestS.p[2]) * rg[2];
            const latJ = (pj.x - bestS.p[0]) * rg[0] + (pj.y - bestS.p[1]) * rg[1] + (pj.z - bestS.p[2]) * rg[2];
            if (signU > 0) {
              const passDir = Math.abs(latJ) > 0.45 ? -Math.sign(latJ) : dLat >= 0 ? -1 : 1;
              bodies[i].setLinvel(
                {
                  x: vi.x - tg[0] * transfer * 0.55 + rg[0] * passDir * 0.22,
                  y: vi.y - tg[1] * transfer * 0.55,
                  z: vi.z - tg[2] * transfer * 0.55 + rg[2] * passDir * 0.22,
                },
                true,
              );
              bodies[j].setLinvel(
                { x: vj.x + tg[0] * transfer * 0.35, y: vj.y + tg[1] * transfer * 0.35, z: vj.z + tg[2] * transfer * 0.35 },
                true,
              );
              if (carTcrLane) {
                carTcrLane[i] = passDir;
                if (carNextSwitch) carNextSwitch[i] = t + 0.55;
              }
            } else {
              const passDir = Math.abs(latI) > 0.45 ? -Math.sign(latI) : dLat >= 0 ? 1 : -1;
              bodies[j].setLinvel(
                {
                  x: vj.x - tg[0] * transfer * 0.55 + rg[0] * passDir * 0.22,
                  y: vj.y - tg[1] * transfer * 0.55,
                  z: vj.z - tg[2] * transfer * 0.55 + rg[2] * passDir * 0.22,
                },
                true,
              );
              bodies[i].setLinvel(
                { x: vi.x + tg[0] * transfer * 0.35, y: vi.y + tg[1] * transfer * 0.35, z: vi.z + tg[2] * transfer * 0.35 },
                true,
              );
              if (carTcrLane) {
                carTcrLane[j] = passDir;
                if (carNextSwitch) carNextSwitch[j] = t + 0.55;
              }
            }
            if (impacts && lastImpact && relLong > 1.2 && step - lastImpact[i] > 8) {
              lastImpact[i] = step;
              impacts.push({ t: step * (1 / 120), f: Math.floor(step / 2), i, strength: relLong, glass: true });
            }
          }
        } else {
          // SIDE-BY-SIDE WHEEL-TO-WHEEL CONTACT: smooth lateral separation along rg
          const signLat = dLat >= 0 ? 1 : -1;
          const shift = Math.min(maxStepShift, penLat * 0.65 + 0.005);
          const shiftI = -signLat * shift * wI;
          const shiftJ = signLat * shift * wJ;

          const wMax = (bestS.w ?? 2.1) - 0.44;
          const latI = (pi.x - bestS.p[0]) * rg[0] + (pi.y - bestS.p[1]) * rg[1] + (pi.z - bestS.p[2]) * rg[2];
          const latJ = (pj.x - bestS.p[0]) * rg[0] + (pj.y - bestS.p[1]) * rg[1] + (pj.z - bestS.p[2]) * rg[2];
          const clampedShiftI = Math.max(-wMax - latI, Math.min(wMax - latI, shiftI));
          const clampedShiftJ = Math.max(-wMax - latJ, Math.min(wMax - latJ, shiftJ));

          bodies[i].setTranslation(
            {
              x: pi.x + rg[0] * clampedShiftI,
              y: pi.y + rg[1] * clampedShiftI * 0.2,
              z: pi.z + rg[2] * clampedShiftI,
            },
            true,
          );
          bodies[j].setTranslation(
            {
              x: pj.x + rg[0] * clampedShiftJ,
              y: pj.y + rg[1] * clampedShiftJ * 0.2,
              z: pj.z + rg[2] * clampedShiftJ,
            },
            true,
          );

          // Smoothly damp closing lateral velocity without a rebound bounce
          const vLatI = vi.x * rg[0] + vi.y * rg[1] + vi.z * rg[2];
          const vLatJ = vj.x * rg[0] + vj.y * rg[1] + vj.z * rg[2];
          const relLat = (vLatI - vLatJ) * signLat;
          if (relLat > 0 && iter === 0) {
            const latDamp = Math.min(0.45, relLat * 0.35);
            bodies[i].setLinvel(
              { x: vi.x - rg[0] * signLat * latDamp * wI, y: vi.y, z: vi.z - rg[2] * signLat * latDamp * wI },
              true,
            );
            bodies[j].setLinvel(
              { x: vj.x + rg[0] * signLat * latDamp * wJ, y: vj.y, z: vj.z + rg[2] * signLat * latDamp * wJ },
              true,
            );
          }
        }
      }
    }
  }
}

/**
 * Clean, Warm Melodic Synthwave & Tactile Car Audio Engine (ZERO White Noise!).
 * Replaces the marble soundtrack when GP_CARS=1 so there is zero static/white-noise hiss.
 */
export function carSoundtrack(result) {
  const { data, impacts } = result;
  const { timeline, cams, frames, fps } = data;
  const RATE = 44100;
  const total = Math.ceil((timeline.total / fps) * RATE);
  const simTotal = Math.ceil((frames.length / fps) * RATE);
  const Ls = new Float32Array(simTotal);
  const Rs = new Float32Array(simTotal);
  const Lc = new Float32Array(total);
  const Rc = new Float32Array(total);
  let target = { L: Ls, R: Rs, n: simTotal };

  const add = (i, s, pan = 0) => {
    if (i < 0 || i >= target.n) return;
    target.L[i] += s * Math.cos(((pan + 1) * Math.PI) / 4);
    target.R[i] += s * Math.sin(((pan + 1) * Math.PI) / 4);
  };

  const camAt = (f) => cams[Math.min(f, cams.length - 1)];
  const hear = (f, p) => {
    const c = camAt(f);
    const pos = new Vector3(c[0], c[1], c[2]);
    const fwd = new Vector3(c[3] - c[0], c[4] - c[1], c[5] - c[2]).normalize();
    const right = new Vector3().crossVectors(fwd, new Vector3(0, 1, 0)).normalize();
    const rel = new Vector3(p[0], p[1], p[2]).sub(pos);
    const d = rel.length();
    return {
      gain: Math.max(0.05, 1 / (1 + (d * d) / 28)),
      pan: Math.max(-0.85, Math.min(0.85, rel.dot(right) / (d * 0.7 + 0.01))),
    };
  };

  const tone = (t, freq, dur, amp, pan = 0, decay = null) => {
    const start = Math.round(t * RATE);
    for (let k = 0; k < dur * RATE; k++) {
      const tt = k / RATE;
      const env = decay ? Math.exp(-tt / decay) : Math.min(1, k / 240) * Math.min(1, (dur * RATE - k) / 700);
      add(start + k, amp * env * (0.75 * Math.sin(2 * Math.PI * freq * tt) + 0.25 * Math.sin(4 * Math.PI * freq * tt)), pan);
    }
  };

  const bell = (t, freq, amp, pan = 0, length = 1.6) => {
    const start = Math.round(t * RATE);
    for (let k = 0; k < length * RATE; k++) {
      const tt = k / RATE;
      let s = 0;
      for (const [mul, a] of [
        [1, 1],
        [2.0, 0.42],
        [3.0, 0.18],
        [4.0, 0.07],
      ]) {
        s += a * Math.exp((-tt * (1 + mul * 0.8)) / length) * Math.sin(2 * Math.PI * freq * mul * tt);
      }
      add(start + k, amp * s * Math.min(1, k / 60), pan);
    }
  };

  // 1. F1 Start Gate Beep Sequence + Harmonic Launch Chord (no white noise!)
  timeline.lights.forEach((lf) => tone(lf / fps, 440, 0.22, 0.18, 0, 0.09));
  [440, 554.37, 659.25, 880].forEach((fq, idx) => tone(timeline.raceStart / fps, fq, 0.85, 0.11, (idx - 1.5) * 0.25, 0.35));

  // 2. Smooth Harmonic Car Engine Purr & Tactile TCR Track-Joint Ticks (0% White Noise!)
  const phases = data.marbles.map((_, i) => i * 1.1);
  for (let f = Math.max(1, timeline.raceStart); f < frames.length; f++) {
    const fr = frames[f];
    const prev = frames[f - 1];
    const s0 = Math.round((f / fps) * RATE);
    const s1 = Math.round(((f + 1) / fps) * RATE);

    fr.forEach((m, i) => {
      const speed = Math.hypot(m[0] - prev[i][0], m[1] - prev[i][1], m[2] - prev[i][2]) * fps;
      if (speed < 0.25) return;
      const { gain, pan } = hear(f, m);
      const amp = Math.min(0.065, speed * 0.0045) * gain;
      // Each Constructor class has its own warm harmonic base frequency (75Hz..115Hz)
      const baseFreq = 72 + (i % 4) * 9 + speed * 4.2;
      if (amp > 0.0015) {
        let ph = phases[i];
        const dPh = (2 * Math.PI * baseFreq) / RATE;
        for (let k = s0; k < s1 && k < simTotal; k++) {
          ph += dPh;
          // Pure warm harmonic purr (fundamental + 2nd + 3rd harmonic, zero noise!)
          const wave = 0.62 * Math.sin(ph) + 0.28 * Math.sin(ph * 2) + 0.10 * Math.sin(ph * 3);
          add(k, wave * amp, pan);
        }
        phases[i] = ph % (2 * Math.PI);
      }

      // Tactile ASMR TCR Track-Joint & Kerb Ticks every 2.2m of progress
      const u0 = prev[i][7];
      const u1 = m[7];
      if (u1 > u0 && Math.floor(u1 / 2.2) > Math.floor(u0 / 2.2)) {
        const jAmp = Math.min(0.095, 0.018 * speed) * gain;
        if (jAmp > 0.003) {
          const jFreq = 1680 + ((i * 173) % 620);
          for (let q = 0; q < 320 && s0 + q < simTotal; q++) {
            const qt = q / RATE;
            add(
              s0 + q,
              jAmp * Math.exp(-qt / 0.0028) * (0.72 * Math.sin(2 * Math.PI * jFreq * qt) + 0.28 * Math.sin(2 * Math.PI * jFreq * 1.5 * qt)),
              pan,
            );
          }
        }
      }
    });
  }

  // 3. Clean Multi-Modal Carbon/Diecast Clacks on Bumper & Chicane Impacts (Zero White Noise!)
  for (const im of impacts) {
    const { gain, pan } = hear(im.f, frames[Math.min(im.f, frames.length - 1)][im.i]);
    const amp = Math.min(0.42, Math.max(0.04, (im.strength - 0.3) * 0.12)) * gain;
    if (amp < 0.004) continue;
    const start = Math.round(im.t * RATE);
    const freq = im.glass ? 1420 + (im.i % 5) * 180 : 480 + (im.i % 4) * 90;
    const decay = im.glass ? 0.024 : 0.032;
    for (let k = 0; k < decay * 6 * RATE; k++) {
      const tt = k / RATE;
      const ring =
        0.65 * Math.sin(2 * Math.PI * freq * tt) +
        0.25 * Math.exp(-tt / (decay * 0.6)) * Math.sin(2 * Math.PI * freq * 1.58 * tt) +
        0.10 * Math.exp(-tt / (decay * 0.35)) * Math.sin(2 * Math.PI * freq * 2.24 * tt);
      add(start + k, amp * Math.exp(-tt / decay) * ring, pan);
    }
  }

  // 4. Overtake & Finish Chimes (Melodic Chords instead of White-Noise Crowd Roar!)
  for (const e of data.events) {
    if (e.kind === "overtake" && e.pos <= 3) {
      const t = e.frame / fps;
      bell(t, 587.33, 0.09, -0.15, 0.7);
      bell(t + 0.07, 880.0, 0.11, 0.15, 0.9);
    }
  }
  data.order.forEach((i, k) => {
    const ff = data.marbles[i].finishFrame;
    if (ff === null) return;
    bell(ff / fps, k === 0 ? 1046.5 : k < 3 ? 880 : 659.25, k === 0 ? 0.32 : 0.14, 0, 1.8);
  });

  // 5. Copy Simulation Audio to Video Timeline
  target = { L: Lc, R: Rc, n: total };
  for (const seg of timeline.segments) {
    const at = Math.round((seg.at / fps) * RATE);
    if (seg.kind === "live") {
      const a = Math.round((seg.from / fps) * RATE);
      const b = Math.min(simTotal, Math.round((seg.to / fps) * RATE));
      for (let k = a; k < b; k++) {
        if (at + k - a >= total) break;
        Lc[at + k - a] += Ls[k];
        Rc[at + k - a] += Rs[k];
      }
    }
  }

  // 6. Clean, Warm Melodic Synthwave Music Bed (120 BPM — Zero White Noise Hi-Hats!)
  {
    const bpm = 120;
    const beat = 60 / bpm;
    const t0 = 0.2;
    const t1 = timeline.total / fps - 0.5;
    // Progression: Am -> F -> C -> G (warm, uplifting racing synthwave)
    const bassNotes = [55.0, 55.0, 43.65, 43.65, 65.41, 65.41, 49.0, 49.0];
    const arpNotes = [220.0, 261.63, 329.63, 392.0, 174.61, 220.0, 261.63, 349.23, 261.63, 329.63, 392.0, 523.25, 196.0, 246.94, 293.66, 392.0];
    const amp = 0.042;
    const env = (t) => Math.min(1, Math.max(0, (t - t0) / 1.5)) * Math.min(1, Math.max(0, (t1 - t) / 2.0));

    for (let n = 0; t0 + n * beat < t1; n++) {
      const t = t0 + n * beat;
      const e = env(t) * amp;

      // Warm Sine Kick on every beat
      const k0 = Math.round(t * RATE);
      for (let k = 0; k < 0.22 * RATE; k++) {
        const tt = k / RATE;
        add(k0 + k, e * 1.45 * Math.exp(-tt / 0.065) * Math.sin(2 * Math.PI * (52 + 68 * Math.exp(-tt / 0.018)) * tt), 0);
      }

      // Soft Harmonic Marimba / Clave Off-Beat Pulse (NO white noise!)
      const h0 = Math.round((t + beat / 2) * RATE);
      for (let k = 0; k < 0.045 * RATE; k++) {
        const tt = k / RATE;
        add(h0 + k, e * 0.22 * Math.exp(-tt / 0.011) * Math.sin(2 * Math.PI * 1320 * tt), 0.15);
      }

      // Warm Sub-Bass + Melodic Arpeggio on 8th notes
      for (let half = 0; half < 2; half++) {
        const bFreq = bassNotes[Math.floor(n / 2) % bassNotes.length];
        const aFreq = arpNotes[(n * 2 + half) % arpNotes.length];
        const b0 = Math.round((t + (half * beat) / 2) * RATE);
        const panArp = ((n * 2 + half) % 2 === 0 ? -1 : 1) * 0.28;
        for (let k = 0; k < 0.23 * RATE; k++) {
          const tt = k / RATE;
          const fade = Math.min(1, k / 120) * Math.exp(-tt / 0.14);
          const bassWave = 0.75 * Math.sin(2 * Math.PI * bFreq * tt) + 0.25 * Math.sin(4 * Math.PI * bFreq * tt);
          const arpWave = 0.65 * Math.sin(2 * Math.PI * aFreq * tt) + 0.22 * Math.sin(4 * Math.PI * aFreq * tt);
          add(b0 + k, e * 0.62 * fade * bassWave, -0.08);
          add(b0 + k, e * 0.28 * fade * arpWave, panArp);
        }
      }
    }
  }

  // Final victory chord fanfare
  [523.25, 659.25, 783.99, 1046.5].forEach((fq, k) =>
    bell(timeline.results.at / fps + 0.15 + k * 0.14, fq, 0.2, (k - 1.5) * 0.3, 2.2),
  );
  [392, 493.88, 587.33].forEach((fq, k) => bell(timeline.standings.at / fps + 0.1 + k * 0.08, fq, 0.12, 0, 2));

  let peak = 0;
  for (let k = 0; k < total; k++) peak = Math.max(peak, Math.abs(Lc[k]), Math.abs(Rc[k]));
  const gain = peak > 0.9 ? 0.9 / peak : 1;
  const wav = Buffer.alloc(44 + total * 4);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + total * 4, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(RATE, 24);
  wav.writeUInt32LE(RATE * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(total * 4, 40);
  for (let k = 0; k < total; k++) {
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Lc[k] * gain)) * 32767), 44 + k * 4);
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, Rc[k] * gain)) * 32767), 46 + k * 4);
  }
  return wav;
}
