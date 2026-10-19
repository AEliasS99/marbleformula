// The Monaco Grand Prix: designed with `npm run design -- r1-monaco` (layout below).
export default {
  id: "r1-monaco",
  title: "Monaco Grand Prix",
  geo: "mc-1929",
  gp: "Monaco",
  country: "Monaco",
  flag: ["#ce1126", "#ffffff"],
  scale: 0.12,
  seed: 2,
  start: "auto", // the line moves to the straightest stretch: the lift tower and the grid need one
  // Technical and twisty: the harbour straight (158–212) is the only long one,
  // so the machines stack there; the early climb gets a gate and a jump to
  // scramble the grid, and a drop and rumble strip wake up the last sector.
  dq: { target: 1.5 }, // the pads are cut to catch about this many per race (the hammer and turntable throw marbles at the walls)
  layout: [
    ["regroup", 45],
    ["jump", 60],
    ["hammer", 159],
    ["drop", 170],
    ["turntable", 196],
    ["spinner", 207],
    ["drop", 235],
    ["bumps", 260],
  ],
};
