// The Japanese Grand Prix: designed with `npm run design -- r4-suzuka` (layout below).
export default {
  id: "r4-suzuka",
  title: "Japanese Grand Prix",
  geo: "jp-1962",
  gp: "Japan",
  country: "Japan",
  flag: ["#ffffff", "#bc002d"],
  scale: 0.08,
  seed: 1,
  start: "auto", // the line moves to the straightest stretch: the lift tower and the grid need one
  // The esses and the figure-of-eight crossing: a rumble strip through the
  // esses, the hammer and turntable before the hairpin, then the back straight
  // carries a gate, the whirlwind, the rollers and a jump, and a last drop.
  dq: { target: 1 }, // the pads are cut to catch about this many per race (the hammer and turntable throw marbles at the walls)
  layout: [
    ["bumps", 130],
    ["hammer", 181],
    ["turntable", 236],
    ["drop", 250],
    ["spinner", 314],
    ["rollers", 324],
    ["jump", 341],
    ["drop", 376],
  ],
};
