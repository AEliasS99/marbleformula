// Pinball: three small bouncy bumpers of different sizes, staggered near the
// middle. Wide openings (> 2 marbles) on both sides, never touching a wall (no
// pocket to get pinned in), offset so a marble can't ping-pong between two.
// Small: with twenty marbles arriving together, a gap under ~2.3 marbles beside a bumper clogs.
export default {
  type: "bumpers",
  label: "PINBALL",
  place: { before: 1, after: 5, maxCurv: 0.035 },
  dq: true,
  card: { difficulty: 2, chaos: 3, seconds: 1.5, summary: "Three springy posts that bat marbles sideways." },
  build(f, { cylinder }) {
    cylinder("bumper", f.u, 0.3, 0.2, 0.75, 0.8);
    cylinder("bumper", f.u + 2.3, -0.4, 0.24, 0.75, 0.8);
    cylinder("bumper", f.u + 4.5, 0.35, 0.22, 0.75, 0.8);
  },
};
