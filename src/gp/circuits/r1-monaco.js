// Season 3 · Round 2 — Swiss Alpine Grand Prix (Matterhorn Glacier Switchbacks)
export default {
  id: "r1-monaco",
  gp: "Switzerland",
  title: "Swiss Alpine Grand Prix",
  country: "Switzerland",
  location: "Zermatt",
  circuit: "Matterhorn Glacier Switchbacks",
  flag: ["#ff0000", "#ffffff", "#ff0000"],
  seed: 17,
  scale: 0.56,
  start: "auto",
  // Meltwater on the inside of three existing bends. Keep the original outline,
  // elevation and scenery; dry outside lines remain available to passing cars.
  carChallenges: { racecraft:{boostSeconds:3.2,boostSpeed:3.4,brakingBase:0.94,brakingSpread:0.25}, patches: [
    { id: "glacier-entry", label: "GLACIER MELTWATER", u0: 113, u1: 127, lat: 0.98, halfWidth: 0.92 },
    { id: "village-bend", label: "ALPINE MELTWATER", u0: 233, u1: 248, lat: 0.98, halfWidth: 0.92 },
    { id: "final-hairpin", label: "FINAL HAIRPIN · WET INSIDE", u0: 482, u1: 497, lat: -0.98, halfWidth: 0.92 },
  ] },
  // High-speed alpine valley straight + cascading glacier switchbacks + ridge sweep
  outline: [
    [-72, -78], [74, -78],
    [98, -62], [102, -32], [84, -8],
    [28, -8], [4, 8], [8, 30], [36, 42],
    [82, 42], [100, 58], [96, 86], [68, 102],
    [-62, 102], [-90, 86], [-94, 54], [-72, 36],
    [-26, 36], [-8, 18], [-26, 0],
    [-74, 0], [-96, -18], [-96, -52],
  ],
};
