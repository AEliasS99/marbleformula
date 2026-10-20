// The Short: the final lap, the finish and the results card, vertical. Its
// first video frame in the full composition (intro included) and its length.
type Data = {
  fps: number;
  intro?: { total: number };
  info: { laps?: number };
  laps?: { lap: number; start: number }[];
  timeline: { raceStart: number; results: { at: number } };
};
export function shortRange(d: Data) {
  const I = d.intro?.total ?? 0;
  const last = (d.info.laps ?? 1) - 1;
  const starts = (d.laps ?? []).filter((l) => l.lap === last).map((l) => l.start);
  // From two seconds before the leader starts the final lap (the race start for one lap).
  const from = Math.max(0, (starts.length ? Math.min(...starts) : d.timeline.raceStart) - 2 * d.fps);
  const to = d.timeline.results.at + Math.round(4.5 * d.fps);
  return { offset: I + from, frames: to - from };
}
