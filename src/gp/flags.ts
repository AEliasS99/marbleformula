// National flags for the marbles, drawn procedurally (no image files), both
// onto canvases (marble textures, minimap) and as data URLs for the overlay.
// Emblems are simplified to what reads at marble size.

export type FlagCode = keyof typeof FLAGS;
type Draw = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

const stripesH = (colors: string[], weights?: number[]): Draw => (g, x, y, w, h) => {
  const ws = weights ?? colors.map(() => 1);
  const total = ws.reduce((a, b) => a + b, 0);
  let yy = y;
  colors.forEach((c, i) => {
    const hh = (h * ws[i]) / total;
    g.fillStyle = c;
    g.fillRect(x, yy, w, hh + 1);
    yy += hh;
  });
};
const stripesV = (colors: string[]): Draw => (g, x, y, w, h) => {
  colors.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(x + (w * i) / colors.length, y, w / colors.length + 1, h);
  });
};
const disc = (color: string, r: number) => (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x + w / 2, y + h / 2, h * r, 0, Math.PI * 2);
  g.fill();
};

export const FLAGS = {
  ESP: {
    name: "Spain",
    colors: ["#c60b1e", "#ffc400"],
    draw: ((g, x, y, w, h) => {
      stripesH(["#c60b1e", "#ffc400", "#c60b1e"], [1, 2, 1])(g, x, y, w, h);
    }) as Draw,
  },
  ITA: { name: "Italy", colors: ["#009246", "#ce2b37"], draw: stripesV(["#009246", "#ffffff", "#ce2b37"]) },
  FRA: { name: "France", colors: ["#0055a4", "#ef4135"], draw: stripesV(["#0055a4", "#ffffff", "#ef4135"]) },
  DEU: { name: "Germany", colors: ["#000000", "#ffce00"], draw: stripesH(["#000000", "#dd0000", "#ffce00"]) },
  GBR: {
    name: "Britain",
    colors: ["#012169", "#c8102e"],
    draw: ((g, x, y, w, h) => {
      g.fillStyle = "#012169";
      g.fillRect(x, y, w, h);
      g.save();
      g.beginPath();
      g.rect(x, y, w, h);
      g.clip();
      const diag = (color: string, width: number) => {
        g.strokeStyle = color;
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + w, y + h);
        g.moveTo(x + w, y);
        g.lineTo(x, y + h);
        g.stroke();
      };
      diag("#ffffff", h * 0.2);
      diag("#c8102e", h * 0.07);
      g.fillStyle = "#ffffff";
      g.fillRect(x + w / 2 - h * 0.17, y, h * 0.34, h);
      g.fillRect(x, y + h / 2 - h * 0.17, w, h * 0.34);
      g.fillStyle = "#c8102e";
      g.fillRect(x + w / 2 - h * 0.1, y, h * 0.2, h);
      g.fillRect(x, y + h / 2 - h * 0.1, w, h * 0.2);
      g.restore();
    }) as Draw,
  },
  USA: {
    name: "USA",
    colors: ["#b22234", "#3c3b6e"],
    draw: ((g, x, y, w, h) => {
      const cols = [];
      for (let i = 0; i < 13; i++) cols.push(i % 2 ? "#ffffff" : "#b22234");
      stripesH(cols)(g, x, y, w, h);
      g.fillStyle = "#3c3b6e";
      g.fillRect(x, y, w * 0.4, h * 0.54);
      g.fillStyle = "#ffffff";
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 6; c++) {
          g.beginPath();
          g.arc(x + w * 0.4 * ((c + 0.5 + (r % 2) * 0.5) / 6.5), y + h * 0.54 * ((r + 0.5) / 5), h * 0.025, 0, Math.PI * 2);
          g.fill();
        }
    }) as Draw,
  },
  BRA: {
    name: "Brazil",
    colors: ["#009c3b", "#ffdf00"],
    draw: ((g, x, y, w, h) => {
      g.fillStyle = "#009c3b";
      g.fillRect(x, y, w, h);
      g.fillStyle = "#ffdf00";
      g.beginPath();
      g.moveTo(x + w / 2, y + h * 0.08);
      g.lineTo(x + w * 0.5 + h * 0.75, y + h / 2);
      g.lineTo(x + w / 2, y + h * 0.92);
      g.lineTo(x + w * 0.5 - h * 0.75, y + h / 2);
      g.closePath();
      g.fill();
      disc("#002776", 0.27)(g, x, y, w, h);
      g.strokeStyle = "#ffffff";
      g.lineWidth = h * 0.045;
      g.beginPath();
      g.arc(x + w / 2, y + h * 0.62, h * 0.4, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
    }) as Draw,
  },
  JPN: {
    name: "Japan",
    colors: ["#bc002d", "#ffffff"],
    draw: ((g, x, y, w, h) => {
      g.fillStyle = "#ffffff";
      g.fillRect(x, y, w, h);
      disc("#bc002d", 0.3)(g, x, y, w, h);
    }) as Draw,
  },
  ARG: {
    name: "Argentina",
    colors: ["#74acdf", "#f6b40e"],
    draw: ((g, x, y, w, h) => {
      stripesH(["#74acdf", "#ffffff", "#74acdf"])(g, x, y, w, h);
      disc("#f6b40e", 0.12)(g, x, y, w, h);
    }) as Draw,
  },
  MEX: {
    name: "Mexico",
    colors: ["#006847", "#ce1126"],
    draw: ((g, x, y, w, h) => {
      stripesV(["#006847", "#ffffff", "#ce1126"])(g, x, y, w, h);
      disc("#8a5a2b", 0.11)(g, x, y, w, h);
      disc("#4a7c3f", 0.06)(g, x, y, w, h);
    }) as Draw,
  },
  NLD: { name: "Netherlands", colors: ["#ae1c28", "#21468b"], draw: stripesH(["#ae1c28", "#ffffff", "#21468b"]) },
  BEL: { name: "Belgium", colors: ["#000000", "#fdda24"], draw: stripesV(["#000000", "#fdda24", "#ef3340"]) },
  AUT: { name: "Austria", colors: ["#ed2939", "#ffffff"], draw: stripesH(["#ed2939", "#ffffff", "#ed2939"]) },
  POL: { name: "Poland", colors: ["#ffffff", "#dc143c"], draw: stripesH(["#ffffff", "#dc143c"]) },
  IRL: { name: "Ireland", colors: ["#169b62", "#ff883e"], draw: stripesV(["#169b62", "#ffffff", "#ff883e"]) },
  SWE: { name: "Sweden", colors: ["#006aa7", "#fecc00"], draw: nordic("#006aa7", "#fecc00") },
  DNK: { name: "Denmark", colors: ["#c8102e", "#ffffff"], draw: nordic("#c8102e", "#ffffff") },
  CAN: {
    name: "Canada",
    colors: ["#ff0000", "#ffffff"],
    draw: ((g, x, y, w, h) => {
      g.fillStyle = "#ffffff";
      g.fillRect(x, y, w, h);
      g.fillStyle = "#ff0000";
      g.fillRect(x, y, w * 0.25, h);
      g.fillRect(x + w * 0.75, y, w * 0.25 + 1, h);
      // A maple leaf, simplified to its silhouette.
      const cx = x + w / 2;
      const cy = y + h / 2;
      const r = h * 0.36;
      const pts: [number, number][] = [
        [0, -1], [0.18, -0.55], [0.45, -0.68], [0.38, -0.28], [0.8, -0.38], [0.66, -0.02], [0.95, 0.12], [0.5, 0.42], [0.58, 0.68], [0.12, 0.55], [0.12, 1.0],
        [-0.12, 1.0], [-0.12, 0.55], [-0.58, 0.68], [-0.5, 0.42], [-0.95, 0.12], [-0.66, -0.02], [-0.8, -0.38], [-0.38, -0.28], [-0.45, -0.68], [-0.18, -0.55],
      ];
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(cx + px * r, cy + py * r) : g.moveTo(cx + px * r, cy + py * r)));
      g.closePath();
      g.fill();
    }) as Draw,
  },
  CHN: {
    name: "China",
    colors: ["#de2910", "#ffde00"],
    draw: ((g, x, y, w, h) => {
      g.fillStyle = "#de2910";
      g.fillRect(x, y, w, h);
      g.fillStyle = "#ffde00";
      star(g, x + w * 0.17, y + h * 0.27, h * 0.16);
      for (const [sx, sy] of [[0.33, 0.1], [0.4, 0.2], [0.4, 0.33], [0.33, 0.43]]) star(g, x + w * sx, y + h * sy, h * 0.05);
    }) as Draw,
  },
  IND: {
    name: "India",
    colors: ["#ff9933", "#138808"],
    draw: ((g, x, y, w, h) => {
      stripesH(["#ff9933", "#ffffff", "#138808"])(g, x, y, w, h);
      g.strokeStyle = "#000080";
      g.lineWidth = h * 0.03;
      g.beginPath();
      g.arc(x + w / 2, y + h / 2, h * 0.13, 0, Math.PI * 2);
      g.stroke();
    }) as Draw,
  },
} as const;

function nordic(bg: string, cross: string): Draw {
  return (g, x, y, w, h) => {
    g.fillStyle = bg;
    g.fillRect(x, y, w, h);
    g.fillStyle = cross;
    g.fillRect(x + w * 0.3, y, h * 0.16, h);
    g.fillRect(x, y + h / 2 - h * 0.08, w, h * 0.16);
  };
}
function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.4 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

export const drawFlag = (g: CanvasRenderingContext2D, code: string, x: number, y: number, w: number, h: number) => {
  const f = (FLAGS as Record<string, { draw: Draw }>)[code];
  if (f) f.draw(g, x, y, w, h);
  else {
    g.fillStyle = "#888";
    g.fillRect(x, y, w, h);
  }
};

const urls = new Map<string, string>();
/** A small flag image for the overlay, drawn once per country. */
export function flagDataUrl(code: string, w = 96, h = 64) {
  const key = `${code}:${w}x${h}`;
  const hit = urls.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  drawFlag(c.getContext("2d")!, code, 0, 0, w, h);
  const url = c.toDataURL("image/png");
  urls.set(key, url);
  return url;
}
