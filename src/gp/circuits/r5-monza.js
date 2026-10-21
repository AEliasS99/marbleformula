// The Italian Grand Prix at Monza ("The Temple of Speed"): a 352-unit
// high-speed sweeping circuit generated from a Catmull-Rom subdivided outline
// so every curve has continuous curvature and uninterrupted banking:
//   1. Rettifilo Sprint + 360° Vortex (u = 0..64)
//   2. Long Sweeping Curva Grande (u = 64..118, continuous 16°–20° banking)
//   3. Roggia Straight + Split Lanes (u = 118..134)
//   4. Sweeping Curve di Lesmo + Drop (u = 134..184)
//   5. Hammer + Flowing Variante Ascari Counter-Sweeper (u = 184..216)
//   6. Serraglio High-Speed Back Sprint with Slingshot Rollers & Booster (u = 216..246)
//   7. Grand 180° Sweeping Curva Parabolica + Final Sprint to the Line (u = 246..338)
const SCALE = 0.862;
const CTRL = [
  [-44, 0],
  [-22, 0],
  [0, 0],
  [22, 0],
  [44, 0],
  [60, -3],
  [73, -12],
  [80, -25],
  [79, -40],
  [71, -53],
  [63, -66],
  [51, -75],
  [35, -77],
  [20, -71],
  [6, -61],
  [-8, -55],
  [-26, -55],
  [-44, -55],
  [-60, -55],
  [-74, -49],
  [-83, -36],
  [-83, -20],
  [-74, -7],
  [-60, 0],
].map(([x, z]) => [x * SCALE, z * SCALE]);

const OUTLINE = [];
for (let i = 0; i < CTRL.length; i++) {
  const n = CTRL.length;
  const p0 = CTRL[(i - 1 + n) % n];
  const p1 = CTRL[i];
  const p2 = CTRL[(i + 1) % n];
  const p3 = CTRL[(i + 2) % n];
  for (let s = 0; s < 4; s++) {
    const t = s / 4;
    const cr = (a, b, c, d) =>
      0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    OUTLINE.push([
      Math.round(cr(p0[0], p1[0], p2[0], p3[0]) * 10) / 10,
      Math.round(cr(p0[1], p1[1], p2[1], p3[1]) * 10) / 10,
    ]);
  }
}

export default {
  id: "r5-monza",
  title: "Italian Grand Prix",
  circuit: "Autodromo Nazionale Monza",
  location: "Monza, Italy",
  realLength: 5793,
  geo: "it-1922",
  gp: "Italy",
  country: "Italy",
  flag: ["#009246", "#ce2b37"],
  outline: OUTLINE,
  start: 20,
  seed: 1,
  exactLayout: true,
  dq: { target: 1 },
  layout: [
    ["vortex", 26],
    ["booster", 44],
    ["splitter", 120],
    ["drop", 176],
    ["hammer", 190],
    ["rollers", 218],
    ["booster", 232],
  ],
};
