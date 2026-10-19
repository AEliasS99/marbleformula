// The 2027 grid: ten teams of two marbles, like Formula 1. Each team scores
// its two drivers' points in the constructors' championship. Shared by the bake
// (standings) and the renderer (colours, names, the team presentation).
// `story`: a line of fiction for the team presentation.
export const TEAMS = [
  { id: "benelux", name: "Benelux Racing", short: "BNX", colors: ["#ff7f00", "#1b1c20"], drivers: ["NLD", "BEL"], story: "Orange fire, Belgian precision." },
  { id: "autobahn", name: "Autobahn Motorsport", short: "ABN", colors: ["#c0c4cc", "#dd0000"], drivers: ["DEU", "AUT"], story: "Engineered to the last micron." },
  { id: "azzurra", name: "Scuderia Azzurra", short: "AZZ", colors: ["#1f6fd1", "#ffffff"], drivers: ["ITA", "ARG"], story: "Born in Monza, raised in Buenos Aires." },
  { id: "iberia", name: "Iberia Sol", short: "IBS", colors: ["#ffc400", "#c60b1e"], drivers: ["ESP", "MEX"], story: "Sunshine, flair and late braking." },
  { id: "bleu", name: "Bleu Atlantique", short: "BLA", colors: ["#0055a4", "#ef4135"], drivers: ["FRA", "CAN"], story: "Two shores, one blue." },
  { id: "atlantic", name: "Atlantic Union", short: "ATU", colors: ["#012169", "#b22234"], drivers: ["GBR", "USA"], story: "The old rivals, finally team-mates." },
  { id: "nordic", name: "Nordic Ice", short: "NRD", colors: ["#9fd8ff", "#006aa7"], drivers: ["SWE", "DNK"], story: "Cool heads, cold glass." },
  { id: "verde", name: "Verde Racing", short: "VRD", colors: ["#009c3b", "#ffdf00"], drivers: ["BRA", "IRL"], story: "Samba and shamrocks." },
  { id: "saffron", name: "Saffron Sun", short: "SAF", colors: ["#ff9933", "#bc002d"], drivers: ["JPN", "IND"], story: "Patience first, then the strike." },
  { id: "crimson", name: "Crimson Dynamics", short: "CRM", colors: ["#de2910", "#f4f4f2"], drivers: ["POL", "CHN"], story: "Red on red: never quiet." },
];
export const teamOf = (abbr) => TEAMS.find((t) => t.drivers.includes(abbr)) ?? null;
