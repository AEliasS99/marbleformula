// The intro's running order, shared by the bake (scripts/season.mjs, which
// stores it in the round's JSON and writes its soundtrack) and the renderer
// (src/gp/Intro.tsx). Lengths in frames at 60 fps.
//   cold     the race's best moment in slow motion ("COMING UP")
//   title    MARBLE FORMULA CHAMPIONSHIP 2027, the round and the circuit
//   teams    round 1: the ten teams in the showroom, 1.5 s each
//   stakes   later rounds: the top of both championships before the race
//   flyover  a drone lap of the circuit, slowing at every obstacle for its card
//   lineup   along the grid: position, flag, team, points
// The intro's simulation clock runs up to 0, where the race's starts: the
// marbles wait on the grid while the machines already turn.

export const TEAM_FRAMES = 150; // 2.5 s per Scuderia/Team in the 3D Showroom (10 teams = 25 s)
export const GRID_U = -9.5; // where the samples (and the grid) begin

/**
 * @param {{ round: number, L: number, highlight: number | null, cards: { type: string, u: number }[], teams: number }} o
 */
export function introPlan({ round, L, highlight, cards, teams }) {
  // Full, unhurried F1 broadcast presentation:
  //   title   (4.5 s = 270 frames: round, circuit, length, laps, knockout format)
  //   teams   (25.0 s = 1500 frames on Round 1: 3D Showroom presenting all 10 Scuderias & their 2 Countries)
  //   stakes  (5.0 s = 300 frames on Rounds 2+: Drivers & Constructors Championship Standings)
  //   flyover (~35.0 s = 2100 frames over the ENTIRE course L: presents all obstacles from Start to Finish & Chain Lift)
  //   lineup  (18.0 s = 1080 frames: steady walk across all 10 lanes / 20 Countries & Scuderias on the Starting Grid)
  const flyL = L;
  const openCards = cards.filter((c) => c.u <= flyL - 2);
  const fly = Math.max(2100, openCards.length * 230);
  const scenes = [
    { id: "cold", frames: 0 },
    { id: "title", frames: 270 },
    { id: "teams", frames: round === 1 ? teams * TEAM_FRAMES : 0 },
    { id: "stakes", frames: round > 1 ? 300 : 0 },
    { id: "flyover", frames: fly },
    { id: "lineup", frames: 1080 },
  ].filter((sc) => sc.frames > 0);
  let at = 0;
  for (const sc of scenes) {
    sc.at = at;
    at += sc.frames;
  }
  const pace = flyPacing(flyL, openCards, fly);
  // Lock each obstacle card's [from, to] window directly to the frames when the drone camera is slowed over c.u
  // (never shift cards after the fact, which previously desynchronized the cards from the 3D obstacle on screen!).
  const shown = openCards.map((c, idx) => {
    const centerFrame = Math.round(pace.xAt(c.u));
    const prevMid = idx > 0 ? Math.round((pace.xAt(openCards[idx - 1].u) + centerFrame) / 2) : 18;
    const nextMid = idx + 1 < openCards.length ? Math.round((centerFrame + pace.xAt(openCards[idx + 1].u)) / 2) : fly - 10;
    const a = Math.max(prevMid, centerFrame - 105);
    const b = Math.min(nextMid, Math.max(a + 150, centerFrame + 105));
    return { ...c, from: a, to: b };
  });
  return { scenes, total: at, highlight, L: flyL, cards: shown };
}

/**
 * The drone's pace along the lap: fast on the straights, slow over each
 * obstacle. Strong density peak (9.5) around each obstacle card so the camera
 * lingers directly over each 3D machine for ~3 seconds while its card is shown.
 */
export function flyPacing(L, cards, frames) {
  const step = 0.5;
  const u0 = GRID_U;
  const n = Math.ceil((L - u0) / step);
  const dens = (u) => 1 + cards.reduce((a, c) => a + 9.5 * Math.exp(-(((u - c.u) / 6.5) ** 2)), 0);
  const cum = [0];
  for (let k = 0; k < n; k++) cum.push(cum[k] + dens(u0 + (k + 0.5) * step) * step);
  const total = cum[n];
  // Ease in and out over the first and last second: the drone takes off and settles.
  const ease = (x) => {
    const e = 60 / frames;
    const p = x / frames;
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    // Constant speed in the middle, quadratic ramps at the ends, continuous slope.
    const v = 1 / (1 - e);
    if (p < e) return (v * p * p) / (2 * e);
    if (p > 1 - e) return 1 - (v * (1 - p) * (1 - p)) / (2 * e);
    return v * (p - e / 2);
  };
  const uAtT = (T) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid + 1] < T) lo = mid + 1;
      else hi = mid;
    }
    const k = Math.min(lo, n - 1);
    const a = (T - cum[k]) / Math.max(1e-9, cum[k + 1] - cum[k]);
    return u0 + (k + Math.max(0, Math.min(1, a))) * step;
  };
  const uAt = (x) => uAtT(ease(x) * total);
  const xAt = (u) => {
    const k = Math.max(0, Math.min(n - 1, Math.floor((u - u0) / step)));
    const a = Math.max(0, Math.min(1, (u - u0) / step - k));
    const T = (cum[k] + (cum[k + 1] - cum[k]) * a) / total;
    // Invert the ease by bisection.
    let lo = 0;
    let hi = frames;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (ease(mid) < T) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const slow = (u) => Math.min(1, (dens(u) - 1) / 2.5);
  return { uAt, xAt, slow };
}
