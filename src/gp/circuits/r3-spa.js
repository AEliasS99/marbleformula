// Season 3 · Round 4 — Australian Grand Prix (Sydney Harbour Bridge Circuit)
export default {
  id: "r3-spa",
  gp: "Australia",
  title: "Australian Grand Prix",
  country: "Australia",
  location: "Sydney",
  circuit: "Sydney Harbour Bridge Circuit",
  flag: ["#00008b", "#ffffff", "#ff0000"],
  seed: 53,
  scale: 0.56,
  start: "auto",
  // Harbour Bridge span + Opera House waterfront S-curves + Circular Quay chicane
  outline: [
    [-83, -65], [83, -65],
    [103, -49], [103, -19], [83, -1],
    [12, -1], [-14, 13], [-12, 37], [16, 49],
    [79, 49], [99, 64], [98, 89], [72, 99],
    [-68, 99], [-94, 83], [-96, 53], [-74, 35],
    [-39, 35], [-23, 17], [-40, -1],
    [-77, -1], [-98, -19], [-100, -46],
  ],
};
