// The Monaco Grand Prix: designed with `npm run design -- r1-monaco` (layout below).
export default {
  id: "r1-monaco",
  title: "Monaco Grand Prix",
  geo: "mc-1929",
  gp: "Monaco",
  country: "Monaco",
  flag: ["#ce1126", "#ffffff"],
  scale: 0.12,
  seed: 6,
  start: "auto", // the line moves to the straightest stretch: the lift tower and the grid need one
  // Technical and twisty: the harbour straight (158–212) is the only long one,
  // so the machines stack there; the early climb gets a gate and a jump to
  // scramble the grid, and a drop and rumble strip wake up the last sector.
  dq: { target: 1 }, // the pads are cut to catch about this many per race (the hammer and turntable throw marbles at the walls)
  layout: [
    ["jump", 60],
    ["spinner", 115], // the whirlwind well before the turntable: two machines back to back blurred into one
    ["hammer", 159],
    ["drop", 170],
    ["turntable", 197],
    ["drop", 235],
    ["bumps", 260],
  ],
};
