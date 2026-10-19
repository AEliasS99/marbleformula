// Circuit design sheet: `npm run design -- r5-monza [--sweep 1-4]`.
//
// Builds the circuit from its design file (src/gp/circuits/), checks the
// layout, and writes out/design/<id>.html: the map with every obstacle, the
// elevation profile, the obstacle list with each one's card, where every
// obstacle type would still fit, and (with --sweep) a seed sweep: winner,
// margin, stuck marbles and disqualifications per seed.
import { mkdirSync, writeFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildCourse, featureRule, placementRules, runRound } from "./season.mjs";
import { CIRCUITS } from "../src/gp/circuits/index.js";
import { BY_TYPE, OBSTACLES } from "../src/gp/obstacles/index.js";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--")) ?? "r5-monza";
const sweepArg = args.includes("--sweep") ? args[args.indexOf("--sweep") + 1] : null;
const circuit = CIRCUITS.find((c) => c.id === id);
if (!circuit) throw new Error(`unknown circuit "${id}"; one of ${CIRCUITS.map((c) => c.id).join(", ")}`);

const CARDS = {
  lift: { difficulty: 1, chaos: 1, seconds: 4, summary: "A chain lift with cleats carries the field up a level." },
  elevator: { difficulty: 1, chaos: 2, seconds: 8, summary: "The lift tower: two cabins carry the field back up to the grid, by arrivals." },
};
const cardOf = (type) => BY_TYPE[type]?.card ?? CARDS[type] ?? { difficulty: 0, chaos: 0, seconds: 0, summary: "" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let course;
let layoutError = null;
try {
  course = buildCourse(circuit);
} catch (e) {
  layoutError = e.message;
  course = buildCourse({ ...circuit, layout: "auto" }); // draw the circuit anyway, with the planner's layout
}
const { samples, L, features } = course;
const curv = samples.map((s) => s.curv);
const { clear } = placementRules(curv);

// Where each obstacle type would still fit, given the layout: intervals of legal u.
const placed = features.filter((f) => f.type !== "elevator");
const fits = (type) => {
  const f = featureRule(type);
  const overlaps = (u) => placed.some((g) => !(u + f.after + 4 < g.u - g.span[0] || u - f.before - 4 > g.u + g.span[1]));
  const runs = [];
  let start = null;
  for (let u = 23; u <= L - 18; u += 1) {
    const ok = clear(u, f) && !overlaps(u);
    if (ok && start === null) start = u;
    if ((!ok || u === Math.floor(L - 18)) && start !== null) {
      runs.push([start, ok ? u : u - 1]);
      start = null;
    }
  }
  return runs;
};

// --- Map --------------------------------------------------------------------------
const W = 900;
const H = 640;
const xs = samples.map((s) => s.p[0]);
const zs = samples.map((s) => s.p[2]);
const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
const k = Math.min((W - 80) / (x1 - x0), (H - 80) / (z1 - z0));
const px = (p) => [40 + (p[0] - x0) * k + ((W - 80) - (x1 - x0) * k) / 2, 40 + (p[2] - z0) * k + ((H - 80) - (z1 - z0) * k) / 2];
const colourOf = (c) => (Math.abs(c) < 0.025 ? "#2fb35a" : Math.abs(c) < 0.05 ? "#9cc43a" : Math.abs(c) < 0.09 ? "#f2b705" : "#e8414a");
let mapSegs = "";
for (let i = 0; i + 1 < samples.length; i++) {
  if (samples[i].gap && samples[i + 1].gap) continue;
  const [ax, ay] = px(samples[i].p);
  const [bx, by] = px(samples[i + 1].p);
  mapSegs += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${colourOf(samples[i].curv)}" stroke-width="7" stroke-linecap="round"/>`;
}
const at = (u) => samples[Math.max(0, Math.min(samples.length - 1, Math.round((u - samples[0].u) / (samples[1].u - samples[0].u))))];
let ticks = "";
for (let u = 0; u < L; u += 50) {
  const [tx, ty] = px(at(u).p);
  ticks += `<circle cx="${tx}" cy="${ty}" r="3" fill="#111"/><text x="${tx + 6}" y="${ty - 6}" class="tick">${u}</text>`;
}
const marks = features
  .map((f, n) => {
    const [mx, my] = px(at(f.u).p);
    const c = cardOf(f.type);
    const r = 7 + c.chaos * 1.6;
    return `<g><circle cx="${mx}" cy="${my}" r="${r}" fill="#111" stroke="#ffcc00" stroke-width="3"/><text x="${mx}" y="${my + 4}" class="num">${n + 1}</text></g>`;
  })
  .join("");
const [sx, sy] = px(at(0).p);
const map = `<svg viewBox="0 0 ${W} ${H}" class="map">${mapSegs}${ticks}<rect x="${sx - 7}" y="${sy - 7}" width="14" height="14" fill="#fff" stroke="#111" stroke-width="2"/>${marks}</svg>`;

// --- Elevation profile --------------------------------------------------------------
const PW = 900;
const PH = 200;
const ys = samples.map((s) => s.p[1]);
const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
const pu = (u) => 40 + ((u - samples[0].u) / (samples.at(-1).u - samples[0].u)) * (PW - 60);
const py = (y) => PH - 25 - ((y - y0) / (y1 - y0 || 1)) * (PH - 45);
const prof = samples.map((s, i) => `${i ? "L" : "M"}${pu(s.u).toFixed(1)},${py(s.p[1]).toFixed(1)}`).join("");
const profMarks = features.map((f, n) => `<line x1="${pu(f.u)}" x2="${pu(f.u)}" y1="10" y2="${PH - 25}" stroke="#ffcc00" stroke-width="2"/><text x="${pu(f.u) + 3}" y="20" class="tick">${n + 1}</text>`).join("");
const profile = `<svg viewBox="0 0 ${PW} ${PH}" class="profile"><path d="${prof}" fill="none" stroke="#111" stroke-width="2.5"/>${profMarks}<text x="40" y="${PH - 6}" class="tick">u 0</text><text x="${PW - 60}" y="${PH - 6}" class="tick">u ${L.toFixed(0)}</text></svg>`;

// --- Tables -----------------------------------------------------------------------
const rows = features
  .map((f, n) => {
    const c = cardOf(f.type);
    const dots = (v) => "●".repeat(v) + "○".repeat(Math.max(0, 5 - v));
    return `<tr><td class="n">${n + 1}</td><td><b>${esc(f.label)}</b><div class="t">${esc(f.type)}</div></td><td class="r">${f.u.toFixed(1)}</td><td>${dots(c.difficulty)}</td><td>${dots(c.chaos)}</td><td class="r">${c.seconds}s</td><td class="s">${esc(c.summary)}</td></tr>`;
  })
  .join("");
const totals = features.reduce((a, f) => ({ chaos: a.chaos + cardOf(f.type).chaos, seconds: a.seconds + cardOf(f.type).seconds }), { chaos: 0, seconds: 0 });
const gaps = [];
for (let i = 0; i + 1 < features.length; i++) gaps.push(features[i + 1].u - features[i].u);
const longestQuiet = gaps.length ? Math.max(...gaps) : 0;
const types = ["lift", ...OBSTACLES.map((o) => o.type)];
const fitRows = types
  .map((t) => {
    const runs = fits(t);
    return `<tr><td><b>${esc(featureRule(t).label)}</b><div class="t">${t}</div></td><td>${runs.length ? runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ") : "<span class=\"none\">no room</span>"}</td></tr>`;
  })
  .join("");

let sweep = "";
if (sweepArg) {
  await RAPIER.init();
  const [a, b] = sweepArg.split("-").map(Number);
  const lines = [];
  for (let seed = a; seed <= (b ?? a); seed++) {
    process.stdout.write(`seed ${seed}… `);
    const r = await runRound(circuit, seed, { quiet: true });
    console.log(r.summary);
    lines.push(`<tr><td class="r">${seed}</td><td>${esc(r.summary.replace(/^[^:]+: /, ""))}</td></tr>`);
  }
  sweep = `<h2>Seed sweep</h2><table><tr><th>seed</th><th>result</th></tr>${lines.join("")}</table>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(circuit.title)} · design</title>
<style>
:root{--ink:#111;--muted:#666;--bg:#f6f6f3;--card:#fff;--line:#e3e3df}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 60px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px}
.meta{color:var(--muted)}.err{background:#fde8ea;border:1px solid #e8414a;border-radius:10px;padding:12px 14px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:13px}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin-top:10px}
.map,.profile{width:100%;height:auto;display:block}.tick{font-size:12px;fill:#444}.num{font-size:12px;font-weight:800;fill:#ffcc00;text-anchor:middle}
.legend span{display:inline-block;margin-right:14px;font-size:13px}.legend i{display:inline-block;width:18px;height:6px;border-radius:3px;vertical-align:middle;margin-right:6px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.n,.r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.t{color:var(--muted);font-size:12px}.s{color:#333;font-size:13px}.none{color:#e8414a}
.kpis{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px}.kpi b{display:block;font-size:22px}
@media (max-width:640px){td.s{display:none}}
</style></head><body><main>
<h1>${esc(circuit.title)}</h1>
<div class="meta">${esc(circuit.id)} · ${esc(course.props.Name ?? "")} · lap ${L.toFixed(0)} units · layout: ${Array.isArray(circuit.layout) ? "designed (src/gp/circuits/" + esc(circuit.id) + ".js)" : "automatic (from the seed)"}</div>
${layoutError ? `<h2>Layout problems</h2><div class="err">${esc(layoutError)}</div><p class="meta">The map below shows the automatic layout instead.</p>` : ""}
<div class="kpis"><div class="kpi"><b>${features.length}</b>obstacles</div><div class="kpi"><b>${totals.chaos}</b>chaos points</div><div class="kpi"><b>${totals.seconds.toFixed(0)}s</b>of obstacle action per lap</div><div class="kpi"><b>${longestQuiet.toFixed(0)}</b>longest quiet stretch (u)</div></div>
<h2>Map</h2><div class="panel">${map}<div class="legend"><span><i style="background:#2fb35a"></i>straight (machines fit)</span><span><i style="background:#9cc43a"></i>near straight</span><span><i style="background:#f2b705"></i>gentle bend (drops, bumps)</span><span><i style="background:#e8414a"></i>bend</span><span>circle size = chaos</span></div></div>
<h2>Elevation</h2><div class="panel">${profile}</div>
<h2>Obstacles</h2><table><tr><th class="n">#</th><th>obstacle</th><th class="r">u</th><th>difficulty</th><th>chaos</th><th class="r">time</th><th>what it does</th></tr>${rows}</table>
<h2>Where each obstacle still fits</h2><p class="meta">Legal u for one more of each, given the layout above (straight enough, 4 units clear of its neighbours).</p><table><tr><th>obstacle</th><th>legal u</th></tr>${fitRows}</table>
${sweep}
</main></body></html>`;

mkdirSync(new URL("../out/design/", import.meta.url), { recursive: true });
const outFile = new URL(`../out/design/${id}.html`, import.meta.url);
writeFileSync(outFile, html);
console.log(`wrote out/design/${id}.html${layoutError ? " (with layout problems)" : ""}`);
