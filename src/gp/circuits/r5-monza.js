// The Italian Grand Prix at Monza: 459 units a lap at scale 0.08, three laps.
//
// The layout is a list of [obstacle, u]: u is the distance along the lap
// (0 = start line, the lap ends at the lift tower ~446). Leave u out
// (["hammer"]) to place it at the first legal spot after the previous entry.
// `npm run design -- r5-monza` draws the map, checks every placement against
// the obstacle's rules (src/gp/obstacles/) and lists where each one could go.
//
// The order of beats: an early drain to scramble the start, a long middle with
// the whirlwind and the chain lift, gates before each hard section so the pack
// arrives together, and a rough last sector into the lift tower.
export default {
  id: "r5-monza",
  title: "Italian Grand Prix",
  geo: "it-1922",
  gp: "Italy",
  country: "Italy",
  flag: ["#009246", "#ce2b37"],
  scale: 0.08,
  seed: 2,
  dq: { target: 1.5 }, // calibrated pads, like the other circuits
  layout: [
    ["vortex", 30],
    ["drop", 69.623],
    ["jump", 92.741],
    ["hammer", 111],
    ["regroup", 134.534],
    ["spinner", 159],
    ["turntable", 217],
    ["lift", 229.861],
    ["jump", 254.223],
    ["bumpers", 268.266],
    ["rollers", 313],
    ["regroup", 328.912],
    ["fan", 335.93],
    ["drop", 347.975],
    ["jump", 365.704],
    ["bumps", 400.58],
    ["pusher", 416],
    ["pusher", 424.358],
    ["turntable", 434.971],
  ],
};
