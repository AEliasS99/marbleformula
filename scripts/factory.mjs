// The video factory: one command makes a whole season, unattended.
//
//   npm run factory -- --season 2                 # everything, all five circuits
//   npm run factory -- --season 2 --circuits r1-monaco,r5-monza
//   npm run factory -- --season 2 --only metadata  # one step (sweep|bake|render|metadata|thumbs)
//   nohup npm run factory -- --season 3 > out/factory/s3.log 2>&1 &   # overnight
//
// Steps, each skipped when already done (state in out/factory/s<N>/state.json),
// so a crash or a reboot resumes where it stopped:
//   sweep     seeds (season N tries seeds (N-1)·100+1 … +K) for every circuit in
//             parallel, and picks per circuit the closest race with nobody stuck
//   bake      the season with those seeds (scripts/season.mjs, GP_SEEDS)
//   render    per round: the 4K video and the vertical Short, each checked for
//             garbled frames (re-rendered once if any), then encoded for upload
//   metadata  YouTube title, description, chapters and tags per video (spoiler-free
//             title; the results below a spoiler line)
//   thumbs    a 1280×720 thumbnail per round
// Output: out/factory/s<N>/<round>/{video.mp4, short.mp4, youtube.json, youtube.md, thumb.jpg}
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync, renameSync } from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { CIRCUITS } from "../src/gp/circuits/index.js";
import { TEAMS, teamOf } from "../src/gp/teams.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const season = Number(opt("season", 1));
const perCircuit = Number(opt("seeds", 8));
const only = opt("only", null);
const keepMasters = args.includes("--keep-masters");
const circuits = (opt("circuits", null)?.split(",") ?? CIRCUITS.map((c) => c.id)).map((id) => {
  const c = CIRCUITS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown circuit ${id}`);
  return c;
});
const OUT = `${ROOT}out/factory/s${season}/`;
mkdirSync(OUT, { recursive: true });
const statePath = `${OUT}state.json`;
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { season, done: {}, seeds: {} };
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const step = async (name, fn) => {
  if (only && only !== name.split(":")[0]) return;
  if (state.done[name] && !only) return log(`skip ${name} (done)`);
  log(`▶ ${name}`);
  await fn();
  state.done[name] = new Date().toISOString();
  save();
  log(`✓ ${name}`);
};
const freeGB = () => {
  const s = statfsSync(ROOT);
  return (s.bavail * s.bsize) / 1e9;
};
const run = (cmd, argv, opts = {}) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { cwd: ROOT, env: { ...process.env, ...(opts.env ?? {}) }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} ${argv.join(" ")} → ${code}\n${out.slice(-2000)}`))));
  });

// --- sweep -------------------------------------------------------------------------
// "r1-monaco seed 3: L=346 race 143.67s, USA by 0.20s, DNF A B, DQ ESP, 4 classified"
const parseSummary = (line) => {
  const m = line.match(/seed (\d+): L=[\d.]+ race ([\d.]+)s, (.+?) by ([\d.]+|-)s(.*)$/);
  if (!m) return null;
  const rest = m[5];
  const dnf = (rest.match(/DNF ([^,]+)/)?.[1] ?? "").trim();
  const dq = (rest.match(/DQ ([A-Z ]+)/)?.[1] ?? "").trim();
  return { seed: Number(m[1]), race: Number(m[2]), winner: m[3], margin: m[4] === "-" ? null : Number(m[4]), dnf: dnf ? dnf.split(" ").length : 0, drains: dq ? dq.split(" ").length : 0 };
};
/** Lower is better: a close finish, one or two drains, nobody stuck. */
const score = (r) => (r.dnf || r.margin === null ? Infinity : r.margin + (r.drains === 0 ? 0.6 : r.drains > 2 ? 0.8 * (r.drains - 2) : 0));

await step("sweep", async () => {
  const a = (season - 1) * 100 + 1;
  const b = a + perCircuit - 1;
  const lanes = Math.max(1, Math.min(circuits.length, Math.floor(cpus().length / 2)));
  const queue = [...circuits];
  const results = {};
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        const out = await run("node", ["scripts/season.mjs", "--round", c.id, "--seeds", `${a}-${b}`]);
        results[c.id] = out.split("\n").map(parseSummary).filter(Boolean);
        log(`  swept ${c.id}`);
      }
    }),
  );
  for (const c of circuits) {
    const ranked = [...results[c.id]].sort((x, y) => score(x) - score(y));
    if (!ranked.length || score(ranked[0]) === Infinity) throw new Error(`${c.id}: no usable seed in ${a}-${b} (all had stuck marbles)`);
    state.seeds[c.id] = ranked[0].seed;
    log(`  ${c.id}: seed ${ranked[0].seed} — ${ranked[0].winner} by ${ranked[0].margin}s, ${ranked[0].drains} drained`);
  }
  writeFileSync(`${OUT}sweep.json`, JSON.stringify(results, null, 2));
});

// --- bake --------------------------------------------------------------------------
await step("bake", async () => {
  writeFileSync(`${OUT}seeds.json`, JSON.stringify(state.seeds));
  const out = await run("node", ["scripts/season.mjs"], { env: { GP_SEEDS: `${OUT}seeds.json` } });
  writeFileSync(`${OUT}bake.log`, out);
  // Keep this season's data with its videos (the next season's bake replaces src/gp/races).
  mkdirSync(`${OUT}data`, { recursive: true });
  for (const c of CIRCUITS) for (const f of [`src/gp/races/${c.id}.json`]) spawnSync("cp", [f, `${OUT}data/`], { cwd: ROOT });
});

// --- render ------------------------------------------------------------------------
const bundleDir = `${OUT}bundle`;
const ensureBundle = async () => {
  if (state.bundled && existsSync(bundleDir)) return;
  await run("npx", ["remotion", "bundle", "src/index.ts", "--out-dir", bundleDir, "--log=error"]);
  state.bundled = true;
  save();
};
const garbled = (file) => {
  const r = spawnSync("python3", ["scripts/check-frames.py", file], { cwd: ROOT, encoding: "utf8" });
  const m = r.stdout.match(/(\d+) garbled/);
  return m ? Number(m[1]) : 0;
};
const renderChecked = async (comp, master, props) => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (freeGB() < 12) throw new Error(`only ${freeGB().toFixed(0)} GB free: stopping before ${comp}`);
    await run("npx", ["remotion", "render", bundleDir, comp, master, `--props=${JSON.stringify(props)}`, `--browser-executable=${CHROME}`, "--log=error"]);
    const bad = garbled(master);
    if (bad === 0) return;
    log(`  ${comp}: ${bad} garbled frame(s), ${attempt === 1 ? "rendering again" : "keeping it (check by hand)"}`);
    if (attempt === 2) return;
  }
};
const encode = (master, out, maxrate) => {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", master, "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-maxrate", maxrate, "-bufsize", "60000k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", `${out}.part.mp4`], { cwd: ROOT });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${master}`);
  renameSync(`${out}.part.mp4`, out);
};
for (const c of circuits) {
  const dir = `${OUT}${c.id}/`;
  mkdirSync(dir, { recursive: true });
  await step(`render:${c.id}:video`, async () => {
    await ensureBundle();
    const master = `${dir}master-4k.mp4`;
    await renderChecked(`GP-${c.id}-4k`, master, { dpr: 1 });
    encode(master, `${dir}video.mp4`, "30000k");
    if (!keepMasters) rmSync(master);
  });
  await step(`render:${c.id}:short`, async () => {
    await ensureBundle();
    const master = `${dir}master-short.mp4`;
    await renderChecked(`GP-${c.id}-short`, master, {});
    encode(master, `${dir}short.mp4`, "12000k");
    if (!keepMasters) rmSync(master);
  });
}

// --- metadata ----------------------------------------------------------------------
const ts = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const dataOf = (id) => JSON.parse(readFileSync(existsSync(`${OUT}data/${id}.json`) ? `${OUT}data/${id}.json` : `${ROOT}src/gp/races/${id}.json`, "utf8"));
const seasonIndex = existsSync(`${ROOT}src/gp/races/season.json`) ? JSON.parse(readFileSync(`${ROOT}src/gp/races/season.json`, "utf8")) : null;
const TAGS = ["marble race", "marble racing", "marble run", "marble formula", "MFC 2027", "marble grand prix", "satisfying", "country marbles", "formula 1", "F1"];
for (const c of circuits) {
  await step(`metadata:${c.id}`, async () => {
    const d = dataOf(c.id);
    const fps = d.fps;
    const I = d.intro?.total ?? 0;
    const name = (i) => d.marbles[i].name;
    const sc = Object.fromEntries((d.intro?.scenes ?? []).map((s) => [s.id, s.at / fps]));
    const lapStart = (lap) => Math.min(...d.laps.filter((l) => l.lap === lap).map((l) => l.start));
    const winner = d.order[0];
    const wf = d.marbles[winner].finishFrame;
    // YouTube wants chapters at least 10 s long: the intro is one chapter, the grid and the lights another.
    const chapters = [
      [0, sc.teams !== undefined ? "Marble Formula Championship 2027: the teams" : "Marble Formula Championship 2027"],
      [sc.flyover, `The circuit: ${d.info.circuit}`],
      [sc.lineup, "Starting grid and lights out"],
      ...Array.from({ length: (d.info.laps ?? 1) - 1 }, (_, k) => [(I + lapStart(k + 1)) / fps, `Lap ${k + 2}`]),
      [(I + wf) / fps - 6, "The finish"],
      [(I + d.timeline.results.at) / fps, "Results and standings"],
].reduce((kept, c) => (kept.length === 0 || c[0] - kept[kept.length - 1][0] >= 10 ? [...kept, c] : kept), []);
    const round = d.round;
    const gp = d.info.title;
    const margin = d.margin ?? null;
    const close = d.marbles[d.order[1]]?.finishFrame ? (d.marbles[d.order[1]].finishFrame - wf) / fps : null;
    const hook = close !== null && close < 0.3 ? "PHOTO FINISH" : (d.events ?? []).some((e) => e.kind === "dq") ? "Down the Drain!" : "Flat Out";
    const title = `${gp} — Marble Formula Championship 2027 · Round ${round} | ${hook} 🏁`;
    const drained = d.marbles.map((m, i) => (m.dqFrame !== null && m.dqFrame !== undefined ? i : -1)).filter((i) => i >= 0);
    const results = d.results.slice(0, 10).map((r) => `${r.pos}. ${name(r.marble)} (${teamOf(d.marbles[r.marble].abbr)?.name ?? ""})${r.time !== null ? ` ${r.time.toFixed(2)}s` : ""} +${r.points}`);
    const standings = (d.standings ?? []).slice(0, 5).map((s) => `${s.pos}. ${name(s.marble)} — ${s.points} pts`);
    const cons = (d.constructors ?? []).slice(0, 5).map((s) => `${s.pos}. ${TEAMS.find((t) => t.id === s.team)?.name} — ${s.points} pts`);
    const nice = (l) => l.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()).replace(/^The /, "the ");
    const obstacles = [...new Set(d.features.map((f) => f.label))].filter((l) => l !== "THE LIFT TOWER").map(nice);
    const description = [
      `Round ${round} of ${d.rounds} of the Marble Formula Championship 2027: the ${gp} at ${d.info.circuit}. Twenty marbles, ten teams, ${d.info.laps} laps, and a lift tower between every lap.`,
      ``,
      `On the track: ${obstacles.join(", ")}.`,
      ``,
      `Pick your country in the comments before the lights go out! 🏁`,
      ``,
      `Chapters`,
      ...chapters.map(([t, l]) => `${ts(t)} ${l}`),
      ``,
      `Every race is a real physics simulation (Rapier): nothing is scripted. Rendered in 4K.`,
      ``,
      `⚠️ Spoilers below ⚠️`,
      ...Array(12).fill("."),
      `Results`,
      ...results,
      ...(drained.length ? [``, `Drained: ${drained.map(name).join(", ")}`] : []),
      ``,
      `Drivers' championship`,
      ...standings,
      ``,
      `Constructors' championship`,
      ...cons,
      ``,
      `#marblerace #marblerun #f1 #satisfying`,
    ].join("\n");
    const short = {
      title: `Final lap at ${d.info.location ?? gp}! Who takes it? 🏁 #marblerace #shorts`,
      description: `The final lap of the ${gp}, Marble Formula Championship 2027 round ${round}. Full race on the channel.\n#marblerace #marblerun #f1 #shorts`,
    };
    const meta = { title, description, tags: [...TAGS, gp, d.info.circuit, `${d.info.gp} Grand Prix`], chapters, short, seed: d.seed, round };
    writeFileSync(`${OUT}${c.id}/youtube.json`, JSON.stringify(meta, null, 2));
    writeFileSync(`${OUT}${c.id}/youtube.md`, `# ${title}\n\n${description}\n\nTags: ${meta.tags.join(", ")}\n\n## Short\n\n${short.title}\n\n${short.description}\n`);
    void seasonIndex;
  });
}

// --- thumbnails --------------------------------------------------------------------
for (const c of circuits) {
  await step(`thumbs:${c.id}`, async () => {
    await ensureBundle();
    const d = dataOf(c.id);
    const I = d.intro?.total ?? 0;
    // The pack in the heat of the first lap: the most marbles on one screen.
    const rs = d.timeline.raceStart;
    const shot =
      d.shots.find((s) => ["chase", "side", "lead", "feature"].includes(s.kind) && s.start > rs + 4 * d.fps && s.start < rs + 30 * d.fps) ??
      d.shots.find((s) => s.start > rs + 4 * d.fps) ??
      d.shots[5];
    const frame = I + Math.round((shot.start + shot.end) / 2);
    const raw = `${OUT}${c.id}/thumb-raw.png`;
    await run("npx", ["remotion", "still", bundleDir, `GP-${c.id}`, raw, `--frame=${frame}`, `--props=${JSON.stringify({ clean: true })}`, "--timeout=240000", `--browser-executable=${CHROME}`, "--log=error"]);
    const r = spawnSync("python3", ["scripts/thumbnail.py", raw, `${OUT}${c.id}/thumb.jpg`, d.info.gp.toUpperCase(), `ROUND ${d.round}`], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    rmSync(raw);
  });
}
if (!only) log(`season ${season} done: ${OUT}`);
