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

export const TEAM_FRAMES = 90;
export const GRID_U = -9.5; // where the samples (and the grid) begin

/**
 * @param {{ round: number, L: number, highlight: number | null, cards: { type: string, u: number }[], teams: number }} o
 */
export function introPlan({ round, L, highlight, cards, teams }) {
  // Slow enough to follow: ~20 units of track a second between obstacles (it was ~70 and made people dizzy).
  const fly = Math.max(1080, Math.min(2100, 600 + 110 * cards.length));
  const scenes = [
    { id: "cold", frames: highlight === null ? 0 : 180 },
    { id: "title", frames: 210 },
    round === 1 ? { id: "teams", frames: teams * TEAM_FRAMES } : { id: "stakes", frames: 300 },
    { id: "flyover", frames: fly },
    { id: "lineup", frames: 480 },
  ].filter((sc) => sc.frames > 0);
  let at = 0;
  for (const sc of scenes) {
    sc.at = at;
    at += sc.frames;
  }
  const pace = flyPacing(L, cards, fly);
  // Each card shows while the drone passes its obstacle (at least 1.3 s).
  const shown = cards.map((c) => {
    const a = Math.round(pace.xAt(c.u - 5));
    const b = Math.round(Math.max(pace.xAt(c.u + 7), a + 78));
    return { ...c, from: a, to: b };
  });
  // Every card stays up at least 1.3 s (a close neighbour waits its turn), and
  // gives way when the next one comes in.
  for (let k = 1; k < shown.length; k++) {
    shown[k].from = Math.max(shown[k].from, shown[k - 1].from + 78);
    shown[k].to = Math.max(shown[k].to, shown[k].from + 78);
  }
  for (let k = 0; k < shown.length; k++) {
    if (k + 1 < shown.length) shown[k].to = Math.min(shown[k].to, shown[k + 1].from);
    shown[k].to = Math.min(shown[k].to, fly);
  }
  return { scenes, total: at, highlight, L, cards: shown };
}

/**
 * The drone's pace along the lap: fast on the straights, slow over each
 * obstacle. Time density 1 + 6·e^(-(d/6)²) per unit of track around each card;
 * `uAt(x)` is the drone's u at frame x of the flyover, `xAt(u)` the inverse,
 * and `slow(u)` 0..1, how much it has slowed there (it flies lower).
 */
export function flyPacing(L, cards, frames) {
  const step = 0.5;
  const u0 = GRID_U;
  const n = Math.ceil((L - u0) / step);
  const dens = (u) => 1 + cards.reduce((a, c) => a + 2.5 * Math.exp(-(((u - c.u - 1) / 7) ** 2)), 0);
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
