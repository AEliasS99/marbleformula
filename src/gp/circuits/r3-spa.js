// The Belgian Grand Prix: designed with `npm run design -- r3-spa` (layout below).
export default {
  id: "r3-spa",
  title: "Belgian Grand Prix",
  geo: "be-1925",
  gp: "Belgium",
  country: "Belgium",
  flag: ["#000000", "#fdda24"],
  scale: 0.068,
  seed: 1,
  start: "auto", // the line moves to the straightest stretch: the lift tower and the grid need one
  // Big elevation changes: a drop at Eau Rouge, the turntable, a jump on the
  // Kemmel straight with a gate and another drop after it, the whirlwind and
  // the hammer through the middle sector, the chain lift and the pusher last.
  dq: { target: 1.5 }, // the pads are cut to catch about this many per race (the hammer and turntable throw marbles at the walls)
  layout: [
    ["drop", 90],
    ["turntable", 141],
    ["jump", 225],
    ["regroup", 245],
    ["drop", 254],
    ["spinner", 286],
    ["hammer", 324],
    ["lift", 363],
    ["pusher", 413],
  ],
};
