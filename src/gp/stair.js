// The endless stair (it replaced the lift cabins, whose doors, waiting and
// state machine kept causing trouble): in each bay a continuous column of
// platforms rises from below the dock to above the grid, like a paternoster.
// A marble rolls off the end of the track onto whichever platform is passing,
// rides up, and rolls off onto the grid (the platforms tilt forward, and the
// shaft's front wall ends at grid level). The platforms return down outside
// the track wall, shifting sideways at the top and the bottom. No doors, no
// waiting. Shared by the bake (kinematic bodies) and the renderer.
//
// Like a paternoster's doors, the platforms crawl through the entry (so an
// arriving marble isn't knocked back by passing edges) and the exit (so the
// riders have time to roll off), and run fast in between.
//
// Local frame of a bay (EV, the bay's dock): x forward, y up, z right; origin
// at the dock floor's centre. `s` is the stair's own clock in seconds (it stops
// on the last lap, when everyone is heading for the finish).
export const STAIR = { plate: 0.14, slow: 1.6, fast: 9, gap: 1.3, below: 1.6, above: 1.4, outGap: 0.7, tilt: (14 * Math.PI) / 180 };

/** The loop a platform travels, with its time-distance table. */
export function stairLoop(EV) {
  const yb = -STAIR.below;
  const yt = EV.lift + STAIR.above;
  const side = EV.lat < 0 ? -1 : 1;
  const zo = side * (EV.bayWidth / 2 + EV.width / 2 + STAIR.outGap);
  const up = yt - yb;
  const across = Math.abs(zo);
  const perimeter = 2 * up + 2 * across;
  // Speed along the loop: slow from below the dock to just above it, and from
  // just under the grid to the top; fast everywhere else (smooth ramps).
  const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const speed = (d) => {
    if (d > up) return STAIR.fast;
    const y = yb + d;
    const entry = 1 - ramp(y, 1.0, 2.5);
    const exit = ramp(y, EV.lift - 2.0, EV.lift - 0.6);
    const k = Math.max(entry, exit);
    return STAIR.slow + (STAIR.fast - STAIR.slow) * (1 - k);
  };
  const step = 0.05;
  const n = Math.ceil(perimeter / step);
  const T = [0];
  for (let i = 0; i < n; i++) T.push(T[i] + step / speed((i + 0.5) * step));
  const cycle = T[n];
  // Platforms one gap apart where they are slowest.
  const dt = STAIR.gap / STAIR.slow + STAIR.plate / STAIR.slow;
  const count = Math.floor(cycle / dt);
  return { yb, yt, zo, up, across, perimeter, T, step, n, cycle, count, dt: cycle / count };
}

/** Platform k's position in the bay's local frame at stair time s. */
export function stairLocal(EV, loop, k, s) {
  let tt = (k * loop.dt + s) % loop.cycle;
  if (tt < 0) tt += loop.cycle;
  // Invert the time table.
  let lo = 0;
  let hi = loop.n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (loop.T[mid + 1] < tt) lo = mid + 1;
    else hi = mid;
  }
  const a = (tt - loop.T[lo]) / Math.max(1e-9, loop.T[lo + 1] - loop.T[lo]);
  let d = (lo + Math.min(1, Math.max(0, a))) * loop.step;
  if (d < loop.up) return [0, loop.yb + d, 0];
  d -= loop.up;
  if (d < loop.across) return [0, loop.yt, (loop.zo * d) / loop.across];
  d -= loop.across;
  if (d < loop.up) return [0, loop.yt - d, loop.zo];
  d -= loop.up;
  return [0, loop.yb, loop.zo * (1 - d / loop.across)];
}

/** The stair's clock at simulation time t (seconds): it runs until it stops. */
export const stairTime = (EV, t) => (EV.stopAt !== undefined && EV.stopAt !== null ? Math.min(t, EV.stopAt) : t);
