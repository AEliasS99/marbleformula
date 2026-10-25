// Synthesizes the stereo 44.1 kHz soundtrack for the 2027 Marble Formula
// Championship Awards Gala (public/gp/gala-2027.wav, 46.0 s = 2760 frames @ 60 fps):
//   0.0s -  6.5s  Opening Gala Fanfare & 5 Round Winners chimes
//   6.5s - 16.5s  Drivers' World Championship Podium Fanfare & Champagne Pop
//  16.5s - 25.5s  Polish National Anthem ("Mazurek Dąbrowskiego") in F major
//  25.5s - 34.5s  Scuderia / Constructors' Trophy Anthem (Crimson Dynamics)
//  34.5s - 46.0s  Record Scratch + Sad Trombone + Oompah Tuba + Drain Glug for the Losers
import { writeFileSync } from "node:fs";

const FPS = 60;
const FRAMES = 2760; // 46.0 seconds
const RATE = 44100;
const total = Math.ceil((FRAMES / FPS) * RATE) + RATE;
const Lc = new Float32Array(total);
const Rc = new Float32Array(total);

let seed = 2027;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const add = (i, s, pan = 0) => {
  if (i < 0 || i >= total) return;
  Lc[i] += s * Math.cos(((pan + 1) * Math.PI) / 4);
  Rc[i] += s * Math.sin(((pan + 1) * Math.PI) / 4);
};

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Warm orchestral brass + strings note
function brassNote(t0, dur, freq, amp = 0.16, pan = 0, vib = 4.5) {
  const start = Math.round(t0 * RATE);
  const n = Math.round(dur * RATE);
  for (let k = 0; k < n; k++) {
    const tt = k / RATE;
    const attack = Math.min(1, tt / 0.045);
    const release = Math.min(1, (dur - tt) / 0.09);
    const env = attack * release * (0.85 + 0.15 * Math.exp(-tt / 0.25));
    const f = freq * (1 + 0.0035 * Math.sin(2 * Math.PI * vib * tt) * Math.min(1, tt / 0.2));
    const sig =
      1.0 * Math.sin(2 * Math.PI * f * tt) +
      0.65 * Math.sin(2 * Math.PI * f * 2 * tt + 0.2) +
      0.38 * Math.sin(2 * Math.PI * f * 3 * tt + 0.5) +
      0.22 * Math.sin(2 * Math.PI * f * 4 * tt) +
      0.1 * Math.sin(2 * Math.PI * f * 5 * tt);
    add(start + k, (amp * env * sig) / 2.1, pan);
  }
}

// Chime / bell
function bell(t0, freq, amp = 0.16, pan = 0, length = 1.8) {
  const start = Math.round(t0 * RATE);
  for (let k = 0; k < length * RATE; k++) {
    const tt = k / RATE;
    let s = 0;
    for (const [mul, a] of [
      [1, 1],
      [2.0, 0.5],
      [3.0, 0.25],
      [4.2, 0.12],
    ]) {
      s += a * Math.exp((-tt * (1 + mul * 0.7)) / length) * Math.sin(2 * Math.PI * freq * mul * tt);
    }
    add(start + k, amp * s * Math.min(1, k / 50), pan);
  }
}

// Deep timpani / cinematic boom
function boom(t0, freq = 55, amp = 0.55) {
  const start = Math.round(t0 * RATE);
  let lp = 0;
  for (let k = 0; k < 1.8 * RATE; k++) {
    const tt = k / RATE;
    lp += 0.08 * (rand() * 2 - 1 - lp);
    const f = freq + 40 * Math.exp(-tt / 0.06);
    const sig = Math.exp(-tt / 0.45) * Math.sin(2 * Math.PI * f * tt) + Math.exp(-tt / 0.12) * lp * 0.9;
    add(start + k, amp * sig, 0);
  }
}

// Whoosh transition
function whoosh(t0, dur = 0.8, amp = 0.65, pan = 0) {
  const start = Math.round(t0 * RATE);
  const n = Math.round(dur * RATE);
  let lp = 0;
  for (let k = 0; k < n; k++) {
    const p = k / n;
    lp += (0.02 + 0.25 * p) * (rand() * 2 - 1 - lp);
    add(start + k, lp * Math.sin(Math.PI * p) * amp, pan * (2 * p - 1));
  }
}

// Stadium crowd cheer + applause
function crowd(t0, dur, amp = 0.45) {
  const start = Math.round(t0 * RATE);
  const n = Math.round(dur * RATE);
  let lpL = 0;
  let lpR = 0;
  let bpL = 0;
  let bpR = 0;
  for (let k = 0; k < n; k++) {
    const tt = k / RATE;
    const env = Math.min(1, tt / 0.5) * Math.min(1, (dur - tt) / 0.8);
    const nL = rand() * 2 - 1;
    const nR = rand() * 2 - 1;
    lpL += 0.06 * (nL - lpL);
    lpR += 0.06 * (nR - lpR);
    bpL += 0.015 * (lpL - bpL);
    bpR += 0.015 * (lpR - bpR);
    const roarL = (lpL - bpL) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 3.1 * tt));
    const roarR = (lpR - bpR) * (0.75 + 0.25 * Math.cos(2 * Math.PI * 2.7 * tt));
    if (start + k >= 0 && start + k < total) {
      Lc[start + k] += amp * env * roarL;
      Rc[start + k] += amp * env * roarR;
    }
  }
}

// Warm pad chord
function padChord(t0, t1, midiNotes, amp = 0.09) {
  const a = Math.round(t0 * RATE);
  const b = Math.round(t1 * RATE);
  const freqs = midiNotes.map(midiToFreq);
  for (let k = a; k < b; k++) {
    const tt = (k - a) / RATE;
    const env = Math.min(1, tt / 0.8) * Math.min(1, (b - k) / RATE / 0.8);
    let s = 0;
    for (const f of freqs) {
      s += Math.sin(2 * Math.PI * f * tt + 0.25 * Math.sin(2 * Math.PI * 0.3 * tt)) + 0.35 * Math.sin(2 * Math.PI * f * 2.002 * tt);
    }
    add(k, (amp * env * s) / freqs.length, 0);
  }
}

// --- SCENE 1: OPENING GALA & 5 ROUND WINNERS (0.0s - 6.5s) ---------------------------
boom(0.05, 58.27, 0.75);
crowd(0.1, 6.2, 0.32);
padChord(0.0, 6.5, [53, 57, 60, 65], 0.11); // F major grand pad
// Regal opening brass fanfare
const openFanfare = [
  [0.15, 0.35, 65], // F4
  [0.5, 0.35, 69],  // A4
  [0.85, 0.35, 72], // C5
  [1.2, 1.1, 77],   // F5
  [2.5, 0.35, 76],  // E5
  [2.85, 0.35, 77], // F5
  [3.2, 0.45, 79],  // G5
  [3.7, 2.2, 81],   // A5
];
for (const [t, d, m] of openFanfare) {
  brassNote(t, d, midiToFreq(m), 0.16, -0.15);
  brassNote(t, d, midiToFreq(m - 12), 0.12, 0.15);
}
// 5 Round card chimes at 1.4s, 2.2s, 3.0s, 3.8s, 4.6s
[65, 69, 72, 74, 77].forEach((m, idx) => {
  bell(1.4 + idx * 0.8, midiToFreq(m + 12), 0.16, (idx - 2) * 0.25, 1.5);
});

// --- SCENE 2: DRIVERS' WORLD CHAMPIONSHIP PODIUM (6.5s - 16.5s) ----------------------
whoosh(6.3, 0.7, 0.7);
boom(6.5, 65.41, 0.8);
crowd(6.5, 9.8, 0.48);
padChord(6.5, 16.5, [60, 64, 67, 72], 0.11); // C major heroic bed

// P3 reveal (7.0s), P2 reveal (8.6s), P1 Champion Poland reveal (10.4s)
[67, 71, 74].forEach((m, k) => bell(7.0 + k * 0.1, midiToFreq(m), 0.18, 0.35, 1.8));
[69, 72, 76].forEach((m, k) => bell(8.6 + k * 0.1, midiToFreq(m), 0.2, -0.35, 1.8));
boom(10.4, 65.41, 0.85);
// Champagne cork pop & fizz at 10.6s!
{
  const popAt = Math.round(10.6 * RATE);
  for (let k = 0; k < 0.08 * RATE; k++) {
    const tt = k / RATE;
    add(popAt + k, 0.75 * Math.exp(-tt / 0.012) * Math.sin(2 * Math.PI * (340 + 500 * Math.exp(-tt / 0.005)) * tt), 0);
  }
  for (let k = 0; k < 1.8 * RATE; k++) {
    const tt = k / RATE;
    const env = Math.min(1, tt / 0.08) * Math.exp(-tt / 0.65);
    add(popAt + 1200 + k, 0.18 * env * (rand() * 2 - 1), (rand() - 0.5) * 0.6);
  }
}
// Heroic Podium Brass Theme (10.4s - 16.2s)
const podiumNotes = [
  [10.4, 0.4, 72], // C5
  [10.8, 0.2, 72], // C5
  [11.0, 0.6, 79], // G5
  [11.6, 0.4, 76], // E5
  [12.0, 0.8, 72], // C5
  [12.8, 0.4, 74], // D5
  [13.2, 0.4, 76], // E5
  [13.6, 0.4, 77], // F5
  [14.0, 0.5, 79], // G5
  [14.5, 1.7, 84], // C6
];
for (const [t, d, m] of podiumNotes) {
  brassNote(t, d, midiToFreq(m), 0.18, 0);
  brassNote(t, d, midiToFreq(m - 12), 0.13, 0.2);
  bell(t, midiToFreq(m), 0.11, -0.2, d + 0.6);
}

// --- SCENE 3: POLAND NATIONAL ANTHEM - MAZUREK DĄBROWSKIEGO (16.5s - 25.5s) ----------
whoosh(16.3, 0.6, 0.55);
boom(16.5, 58.27, 0.65);
padChord(16.5, 25.5, [53, 57, 60, 65], 0.1); // F major solemn & proud harmony

// Mazurek Dąbrowskiego in F major (3/4 mazurka rhythm, quarter = 0.36s):
// Verse: "Jeszcze Polska nie zginęła, kiedy my żyjemy..."
// Chorus: "Marsz, marsz, Dąbrowski, z ziemi włoskiej do Polski!"
const q = 0.34;
const anthem = [
  // Bar 1: A4. Bb4 | C5 C5 ("Jesz-cze Pol-ska")
  [0.0, 0.75 * q, 69, 53],
  [0.75 * q, 0.25 * q, 70, null],
  [1.0 * q, 1.0 * q, 72, 57],
  [2.0 * q, 1.0 * q, 72, 60],
  // Bar 2: C5. A4 | D5 C5 Bb4 ("nie zgi-nę-ła,")
  [3.0 * q, 0.75 * q, 72, 58],
  [3.75 * q, 0.25 * q, 69, null],
  [4.0 * q, 0.65 * q, 74, 62],
  [4.65 * q, 0.65 * q, 72, 60],
  [5.3 * q, 0.7 * q, 70, 58],
  // Bar 3: A4. G4 | F4 F4 ("kie-dy my ży-")
  [6.0 * q, 0.75 * q, 69, 53],
  [6.75 * q, 0.25 * q, 67, null],
  [7.0 * q, 1.0 * q, 65, 57],
  [8.0 * q, 1.0 * q, 65, 60],
  // Bar 4: Bb4 A4 | G4 (half) ("je-my.")
  [9.0 * q, 1.0 * q, 70, 55],
  [10.0 * q, 0.8 * q, 69, 57],
  [10.8 * q, 1.2 * q, 67, 60],
  // Bar 5: D5. D5 | D5 Bb4 ("Marsz, marsz, Dą-")
  [12.0 * q, 1.35 * q, 74, 58],
  [13.35 * q, 0.65 * q, 74, 62],
  [14.0 * q, 0.5 * q, 74, 65],
  [14.5 * q, 0.5 * q, 70, null],
  // Bar 6: F5 E5 | D5 (half) ("brow-ski,")
  [15.0 * q, 1.0 * q, 77, 58],
  [16.0 * q, 0.8 * q, 76, 60],
  [16.8 * q, 1.2 * q, 74, 62],
  // Bar 7: C5. C5 | C5 A4 Bb4 ("z zie-mi wło-skiej do")
  [18.0 * q, 1.35 * q, 72, 60],
  [19.35 * q, 0.65 * q, 72, 64],
  [20.0 * q, 0.5 * q, 72, 67],
  [20.5 * q, 0.25 * q, 69, null],
  [20.75 * q, 0.25 * q, 70, null],
  // Bar 8: C5 A4 | F4 (grand finish) ("Pol-ski!")
  [21.0 * q, 1.0 * q, 72, 53],
  [22.0 * q, 1.0 * q, 69, 60],
  [23.0 * q, 2.5 * q, 65, 53],
];
const anthemStart = 16.8;
for (const [dt, dur, mel, bass] of anthem) {
  const t = anthemStart + dt;
  brassNote(t, dur * 1.04, midiToFreq(mel), 0.20, -0.1, 5.0);
  brassNote(t, dur * 1.04, midiToFreq(mel - 12), 0.11, 0.15, 4.5);
  bell(t, midiToFreq(mel), 0.08, 0.2, dur + 0.4);
  if (bass !== null) {
    brassNote(t, dur * 1.1, midiToFreq(bass), 0.13, 0, 2.0);
  }
}
boom(anthemStart + 23.0 * q, 53, 0.65);
crowd(24.2, 1.5, 0.38);

// --- SCENE 4: SCUDERIA / CONSTRUCTORS' TROPHY - CRIMSON DYNAMICS (25.5s - 34.5s) -----
whoosh(25.3, 0.7, 0.7);
boom(25.5, 55, 0.8);
crowd(25.5, 8.5, 0.36);
padChord(25.5, 34.3, [57, 60, 64, 69], 0.1);
{
  const beat = 60 / 128;
  const bassSeq = [55, 55, 65.41, 73.42, 82.41, 73.42, 65.41, 82.41];
  for (let n = 0; 25.6 + n * beat < 34.2; n++) {
    const t = 25.6 + n * beat;
    const k0 = Math.round(t * RATE);
    for (let k = 0; k < 0.22 * RATE; k++) {
      const tt = k / RATE;
      add(k0 + k, 0.22 * Math.exp(-tt / 0.07) * Math.sin(2 * Math.PI * (58 + 75 * Math.exp(-tt / 0.02)) * tt), 0);
    }
    const fq = bassSeq[n % bassSeq.length];
    brassNote(t, beat * 0.85, fq * 2, 0.1, (n % 2 ? 0.2 : -0.2), 3);
  }
  const scuderiaMel = [
    [25.8, 0.5, 69], // A4
    [26.3, 0.5, 72], // C5
    [26.8, 0.5, 76], // E5
    [27.3, 1.2, 81], // A5
    [28.8, 0.5, 79], // G5
    [29.3, 0.5, 76], // E5
    [29.8, 0.5, 74], // D5
    [30.3, 1.4, 76], // E5
    [32.0, 0.6, 81], // A5
    [32.6, 1.5, 84], // C6
  ];
  for (const [t, d, m] of scuderiaMel) {
    brassNote(t, d, midiToFreq(m), 0.16, 0);
    bell(t, midiToFreq(m), 0.1, 0.25, d + 0.5);
  }
}

// --- SCENE 5: THE UNLUCKY CONSOLATION PRIZE (34.5s - 46.0s) --------------------------
// 1. Record scratch at 34.45s!
{
  const s0 = Math.round(34.42 * RATE);
  const n = Math.round(0.42 * RATE);
  for (let k = 0; k < n; k++) {
    const p = k / n;
    const tt = k / RATE;
    const chirp = Math.sin(2 * Math.PI * (900 - 720 * p + 180 * Math.sin(45 * tt)) * tt);
    const grit = (rand() * 2 - 1) * 0.45;
    add(s0 + k, 0.52 * Math.sin(Math.PI * p) * (chirp + grit), 0);
  }
}

// 2. Classic Sad Trombone: "Wah - Wah - Wah - Waaaaaaaah" (35.0s - 38.2s)
function tromboneSlide(t0, dur, fStart, fEnd, wahHz = 5.5, amp = 0.28) {
  const start = Math.round(t0 * RATE);
  const n = Math.round(dur * RATE);
  let phase = 0;
  for (let k = 0; k < n; k++) {
    const tt = k / RATE;
    const p = k / n;
    const fBase = fStart + (fEnd - fStart) * Math.min(1, p * 1.25);
    const vib = 1 + 0.022 * Math.sin(2 * Math.PI * wahHz * tt);
    const f = fBase * vib;
    phase += (2 * Math.PI * f) / RATE;
    const wah = 0.65 + 0.35 * Math.sin(2 * Math.PI * wahHz * tt - Math.PI / 2);
    const env = Math.min(1, tt / 0.04) * Math.min(1, (dur - tt) / 0.12);
    const sig =
      Math.sin(phase) +
      0.75 * wah * Math.sin(2 * phase + 0.3) +
      0.5 * wah * Math.sin(3 * phase + 0.6) +
      0.28 * wah * Math.sin(4 * phase);
    add(start + k, (amp * env * sig) / 2.2, 0);
  }
}
tromboneSlide(35.0, 0.52, midiToFreq(70), midiToFreq(69.7), 4.5, 0.30); // Bb4
tromboneSlide(35.58, 0.52, midiToFreq(69), midiToFreq(68.7), 4.5, 0.30); // A4
tromboneSlide(36.16, 0.52, midiToFreq(68), midiToFreq(67.7), 4.5, 0.30); // Ab4
tromboneSlide(36.75, 1.65, midiToFreq(67), midiToFreq(63.5), 6.2, 0.34); // G4 sagging down to Eb4!

// 3. Drain "Glug-glug-plop" sound effect at 38.6s!
for (let g = 0; g < 5; g++) {
  const t = 38.55 + g * 0.14;
  const s0 = Math.round(t * RATE);
  const f0 = 260 + g * 65;
  for (let k = 0; k < 0.11 * RATE; k++) {
    const tt = k / RATE;
    const f = f0 + 280 * (tt / 0.11);
    add(s0 + k, 0.32 * Math.sin((Math.PI * tt) / 0.11) * Math.sin(2 * Math.PI * f * tt), (g - 2) * 0.2);
  }
}

// 4. Funny Oompah Tuba & Clarinet Circus March (38.5s - 45.8s)
{
  const step = 0.42;
  const oompah = [
    [48, 60, 63, 67], // C minor goofy
    [43, 59, 62, 67], // G7
    [48, 60, 63, 67], // Cm
    [42, 58, 61, 66], // F# dim
    [41, 56, 60, 65], // Fm
    [43, 59, 62, 67], // G7
    [48, 60, 63, 67], // Cm
  ];
  oompah.forEach(([tuba, ...chord], bar) => {
    const tBar = 38.6 + bar * step * 2;
    // Tuba "OOM"
    brassNote(tBar, step * 0.8, midiToFreq(tuba), 0.24, -0.2, 2.0);
    // High quirky chord "PAH"
    chord.forEach((m) => brassNote(tBar + step, step * 0.45, midiToFreq(m + 12), 0.08, 0.25, 7.0));
  });
  // Funny squeaky clown horn at 44.6s ("honk-honk!")
  for (const hAt of [44.5, 44.85]) {
    tromboneSlide(hAt, 0.24, 620, 580, 14, 0.26);
  }
}

// Write stereo 16-bit WAV
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
writeFileSync(new URL("../public/gp/gala-2027.wav", import.meta.url), wav);
console.log("Wrote public/gp/gala-2027.wav", (wav.length / 1024 / 1024).toFixed(2), "MB");
