// The British Grand Prix: designed with `npm run design -- r2-silverstone` (layout below).
export default {
  id: "r2-silverstone",
  title: "British Grand Prix",
  geo: "gb-1948",
  gp: "Great Britain",
  country: "United Kingdom",
  flag: ["#012169", "#c8102e"],
  scale: 0.08,
  seed: 1,
  start: "auto", // the line moves to the straightest stretch: the lift tower and the grid need one
  // Fast and flowing: an early drop and jump, a gate and the hammer before the
  // long middle straight where the drain and the whirlwind sit back to back,
  // the turntable, then the chain lift.
  dq: { target: 1.5 }, // the pads are cut to catch about this many per race (the hammer and turntable throw marbles at the walls)
  layout: [
    ["drop", 60],
    ["jump", 92],
    ["regroup", 135],
    ["hammer", 143],
    ["vortex", 232],
    ["spinner", 249],
    ["turntable", 288],
    ["lift", 340],
  ],
};
