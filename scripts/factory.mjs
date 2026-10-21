// The video factory: one command makes a whole season, unattended.
//
//   npm run factory -- --season 2                 # everything, all five circuits
//   npm run factory -- --season 2 --circuits r1-monaco,r5-monza
//   npm run factory -- --season 2 --only metadata  # one step: sweep|bake|render|metadata|thumbs
//   npm run factory -- --season 2 --only render --force   # redo finished renders (hours!)
//   nohup scripts/factory-loop.sh 3 > out/factory/loop.log 2>&1 &   # season after season
//
// Steps, each skipped when already done (state in out/factory/s<N>/state.json),
// so a crash or a reboot resumes where it stopped:
//   sweep:<id>  season N tries seeds (N-1)·100+1 … +K for a circuit and picks the
//               closest race with nobody stuck. The circuits are swept in parallel.
//               No usable seed: the next K seeds are tried (SWEEP_RANGES ranges).
//   bake        the season with those seeds (scripts/season.mjs, GP_SEEDS), then
//               at once and under the shared lock: its artefacts are copied to
//               out/factory/s<N>/data and the Remotion bundle is built from them.
//               The bake's summary must match each circuit's sweep pick (winner,
//               margin, stuck marbles); on a mismatch that circuit is swept again
//               once, then the factory gives up.
//   render:<id>:video / :short   the 4K video and the vertical Short, each checked
//               for garbled frames (rendered again once; still garbled: kept, but
//               flagged needsReview), then encoded for upload
//   metadata:<id>  YouTube title, description, chapters and tags (spoiler-free
//               title, the results below a spoiler line)
//   thumbs:<id>    a 1280×720 thumbnail
// Output: out/factory/s<N>/<round>/{video.mp4, short.mp4, youtube.json, youtube.md, thumb.jpg}
//
// Dependencies: a (re)bake invalidates the bundle and every render, metadata and
// thumbnail of the season; changed or incomplete seeds (their hash is stored with
// the bake) or damaged data trigger a re-bake. When that would throw away
// finished videos the factory refuses unless --force is given. `--only <step>`
// redoes that step (a finished render only with --force) and invalidates what
// depends on it.
//
// Single instance and clean shutdown:
//   out/factory/s<N>/lock    one factory per season (PID inside). A live holder:
//                            refuse (exit 4). A dead one: take over, and kill the
//                            child processes it left behind.
//   out/factory/shared.lock  held while anything writes or reads the shared
//                            src/gp/races + public/gp folders (bake + copy +
//                            bundle). `npm run season` takes it too (see the
//                            --shared-lock wrapper below), so a manual bake
//                            never collides with the factory.
//   Every child runs in its own process group; SIGINT/SIGTERM/SIGHUP or a crash
//   kills all those groups (SIGTERM, then SIGKILL) and releases the locks.
//   Stop: Ctrl-C, or `kill <pid>` (the PID is in the lock file), or stop the loop.
//
// Failures (for scripts/factory-loop.sh): every failure is counted in state.json
// (reset whenever a step completes). Exit codes:
//   0 done · 1 failed, retry later: out/factory/s<N>/retry-after holds the backoff
//   in seconds (10 min, 20, 40, … capped at 2 h) · 2 usage error (also an
//   --only refused without --force) · 3 gave up:
//   out/factory/s<N>/FAILED holds the error (5 failures in a row, or a permanent
//   error such as "no usable seed" or "re-bake needs --force") · 4 busy: another
//   factory holds this season · 128+n stopped by signal n.
//
// Wrapper mode (used by `npm run season`):
//   node scripts/factory.mjs --shared-lock -- node scripts/season.mjs [args]
// runs the command while holding the shared lock (waiting for it if needed).
// Seed sweeps (--round) only read the circuits, so they run without the lock.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FACTORY = `${ROOT}out/factory/`;
const SHARED_LOCK = `${FACTORY}shared.lock`;
const MIN = 60_000;
/** Every child gets a deadline; on expiry its whole process group is killed.
 *  (FACTORY_TIMEOUT_SCALE=0.001 shrinks them all: for testing the kill path.) */
const TSCALE = Number(process.env.FACTORY_TIMEOUT_SCALE ?? 1);
const TIMEOUT = { sweep: 30 * MIN, bake: 30 * MIN, bundle: 10 * MIN, video: 240 * MIN, short: 60 * MIN, encode: 60 * MIN, check: 30 * MIN, still: 10 * MIN, thumbnail: 5 * MIN };
for (const k of Object.keys(TIMEOUT)) TIMEOUT[k] *= TSCALE;
const EXIT = { OK: 0, RETRY: 1, USAGE: 2, GAVE_UP: 3, BUSY: 4 };
const MAX_FAILURES = 5;
const BACKOFF_FIRST = 10 * MIN;
const BACKOFF_CAP = 120 * MIN;
const SWEEP_RANGES = 3; // seed ranges tried per circuit before "no usable seed"
const SHARED_LOCK_WAIT = 120 * MIN;
const STEPS = ["sweep", "bake", "render", "metadata", "thumbs"];

/** Needs a human: no point retrying. The loop moves on to the next season. */
class PermanentError extends Error {}
/** The factory is being stopped (signal): not a failure. */
class StopError extends Error {}
/** A usage error (bad command line). */
class UsageError extends Error {}

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const shout = (msg) => log(`\n${"!".repeat(78)}\n!! ${msg}\n${"!".repeat(78)}`);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- processes and shutdown ------------------------------------------------------------
// Every child is spawned detached (its own process group, pgid = its pid), so that
// killing the group takes npx, node, Chrome and its helpers down together.
const children = new Set(); // { pid, label, cmd, closed: Promise }
const heldLocks = new Set(); // lock paths we hold
let stopping = null; // the reason, once shutting down
let onChildrenChange = () => {}; // persists the child list into the season lock

const killGroup = (pid, sig) => {
  try {
    process.kill(-pid, sig);
  } catch {
    /* already gone */
  }
};
/** SIGTERM every child group, give them `graceMs`, then SIGKILL whatever is left. */
async function killChildren(graceMs = 5000) {
  const list = [...children];
  if (!list.length) return;
  for (const c of list) killGroup(c.pid, "SIGTERM");
  await Promise.race([Promise.all(list.map((c) => c.closed)), sleep(graceMs)]);
  for (const c of list) killGroup(c.pid, "SIGKILL");
}

/**
 * Runs a child to completion. Resolves { code, out } when the exit code is in
 * `okCodes`; rejects otherwise, on timeout (after killing its group) and when the
 * factory is stopping.
 */
function run(cmd, argv, { label = cmd, timeoutMs, env = {}, tmp = null, okCodes = [0] } = {}) {
  if (stopping) return Promise.reject(new StopError(stopping));
  if (!timeoutMs) throw new Error(`run ${label}: no timeout`);
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, {
      cwd: ROOT,
      env: { ...process.env, ...(tmp ? { TMPDIR: tmp } : {}), ...env },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let closedResolve;
    const child = { pid: p.pid, label, cmd: [cmd, ...argv].join(" ").slice(0, 300), closed: new Promise((r) => (closedResolve = r)) };
    let out = "";
    const keep = (d) => {
      out += d;
      if (out.length > 8e6) out = out.slice(-4e6); // a runaway log can't eat the memory
    };
    p.stdout.on("data", keep);
    p.stderr.on("data", keep);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      log(`  ✗ ${label}: no result after ${(timeoutMs / MIN).toFixed(1)} min; killing its process group`);
      killGroup(p.pid, "SIGTERM");
      setTimeout(() => killGroup(p.pid, "SIGKILL"), 5000).unref();
    }, timeoutMs);
    p.on("error", (e) => {
      // spawn itself failed (ENOENT…): there is no 'close' for a process that never ran
      if (p.pid === undefined) {
        clearTimeout(timer);
        reject(new Error(`${label}: cannot start ${cmd}: ${e.message}`));
      }
    });
    if (p.pid === undefined) return;
    children.add(child);
    onChildrenChange();
    p.on("close", (code, signal) => {
      clearTimeout(timer);
      killGroup(p.pid, "SIGKILL"); // stragglers of the group (Chrome helpers…)
      children.delete(child);
      onChildrenChange();
      closedResolve();
      const tail = out.slice(-2000);
      if (stopping) reject(new StopError(stopping));
      else if (timedOut) reject(new Error(`${label}: timed out after ${(timeoutMs / MIN).toFixed(1)} min\n${tail}`));
      else if (code !== null && okCodes.includes(code)) resolve({ code, out });
      else reject(new Error(`${label}: ${cmd} ${argv.join(" ")} → ${signal ?? code}\n${tail}`));
    });
  });
}

// --- locks -----------------------------------------------------------------------------
const pidAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
/** A lock's holder is alive if its PID runs and is still a factory (not a recycled PID). */
const holderAlive = (h) => {
  if (!h?.pid || !pidAlive(h.pid)) return false;
  const r = spawnSync("ps", ["-p", String(h.pid), "-o", "command="], { encoding: "utf8" });
  return r.status !== 0 || r.stdout.includes("factory.mjs"); // ps failing: assume alive
};
const readJSON = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
/** Writes a file atomically: temp file, fsync, rename (and fsync the folder). */
function writeAtomic(path, text) {
  const tmp = `${path}.tmp-${process.pid}`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
  try {
    const dfd = openSync(path.slice(0, path.lastIndexOf("/") + 1), "r");
    fsyncSync(dfd);
    closeSync(dfd);
  } catch {
    /* not every platform fsyncs folders */
  }
}

/**
 * Tries to take `path` (O_EXCL create). Returns { ok: true, stale } where `stale`
 * is the content of a dead holder's lock we took over, or { ok: false, holder }.
 */
function tryLock(path, what) {
  let stale = null;
  for (let i = 0; i < 3; i++) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, JSON.stringify({ pid: process.pid, what, since: new Date().toISOString(), children: [] }));
      fsyncSync(fd);
      closeSync(fd);
      heldLocks.add(path);
      return { ok: true, stale };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    const holder = readJSON(path);
    if (holder ? holderAlive(holder) : Date.now() - (statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0) < 10_000) {
      return { ok: false, holder }; // alive (or a lock being written this very moment)
    }
    stale = holder ?? stale;
    log(`  taking over a stale lock ${path.replace(ROOT, "")} (PID ${holder?.pid ?? "?"} is gone)`);
    rmSync(path, { force: true });
  }
  throw new Error(`cannot take ${path}`);
}
function releaseLock(path) {
  if (!heldLocks.has(path)) return;
  heldLocks.delete(path);
  if (readJSON(path)?.pid === process.pid) rmSync(path, { force: true });
}
/** Waits (interruptibly) for the shared lock. */
async function acquireShared(what) {
  const t0 = Date.now();
  let told = false;
  for (;;) {
    if (stopping) throw new StopError(stopping);
    const r = tryLock(SHARED_LOCK, what);
    if (r.ok) return;
    if (!told) log(`  waiting for the shared lock (src/gp/races, public/gp): held by PID ${r.holder?.pid} (${r.holder?.what ?? "?"})`);
    told = true;
    if (Date.now() - t0 > SHARED_LOCK_WAIT) throw new Error(`shared lock still held by PID ${r.holder?.pid} after ${SHARED_LOCK_WAIT / MIN} min`);
    await sleep(5000);
  }
}
async function withSharedLock(what, fn) {
  await acquireShared(what);
  try {
    return await fn();
  } finally {
    releaseLock(SHARED_LOCK);
  }
}
/** Kills the process groups a dead factory left behind (recorded in its lock). */
function reapOrphans(stale) {
  const list = stale?.children ?? [];
  if (!list.length) return;
  const ps = spawnSync("ps", ["-A", "-o", "pid=,pgid=,command="], { encoding: "utf8" }).stdout ?? "";
  const procs = ps
    .split("\n")
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), pgid: Number(m[2]), cmd: m[3] }));
  for (const c of list) {
    const members = procs.filter((p) => p.pgid === c.pid);
    // Only groups that still look like ours (a recycled pgid is left alone).
    if (members.some((p) => /remotion|ffmpeg|season\.mjs|check-frames|thumbnail\.py|Chrome|npx/.test(p.cmd))) {
      log(`  killing leftovers of the dead factory: ${c.label} (process group ${c.pid}, ${members.length} processes)`);
      killGroup(c.pid, "SIGKILL");
    }
  }
}

// --- wrapper mode: `npm run season` ----------------------------------------------------
const argvAll = process.argv.slice(2);
if (argvAll[0] === "--shared-lock") {
  const sep = argvAll.indexOf("--");
  const cmd = argvAll.slice(sep >= 0 ? sep + 1 : 1);
  if (!cmd.length) {
    console.error("usage: node scripts/factory.mjs --shared-lock -- <command> [args]");
    process.exit(EXIT.USAGE);
  }
  const needsLock = !cmd.includes("--round"); // a seed sweep writes nothing shared
  mkdirSync(FACTORY, { recursive: true });
  let child = null;
  const forward = (sig) => () => {
    stopping = sig;
    if (child) child.kill(sig);
    else {
      releaseLock(SHARED_LOCK);
      process.exit(128 + (sig === "SIGINT" ? 2 : sig === "SIGHUP" ? 1 : 15));
    }
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, forward(sig));
  process.on("exit", () => releaseLock(SHARED_LOCK));
  if (needsLock) await acquireShared(`${cmd.join(" ")} (manual)`);
  child = spawn(cmd[0], cmd.slice(1), { cwd: ROOT, stdio: "inherit" });
  child.on("error", (e) => {
    console.error(e.message);
    process.exit(127);
  });
  child.on("close", (code, signal) => {
    releaseLock(SHARED_LOCK);
    process.exit(code ?? 128 + (signal === "SIGINT" ? 2 : 15));
  });
} else {
  await factoryMain();
}

// --- the factory -----------------------------------------------------------------------
async function factoryMain() {
  // CLI ---------------------------------------------------------------------------------
  let opts;
  try {
    opts = parseArgs(argvAll);
  } catch (e) {
    console.error(`${e.message}\nusage: node scripts/factory.mjs --season N [--seeds K] [--circuits a,b] [--only ${STEPS.join("|")}] [--force] [--keep-masters]`);
    process.exit(EXIT.USAGE);
  }
  const { season, perCircuit, only, force, keepMasters } = opts;
  const { CIRCUITS } = await import("../src/gp/circuits/index.js");
  const { TEAMS, teamOf } = await import("../src/gp/teams.js");
  const unknown = opts.circuitIds?.filter((id) => !CIRCUITS.some((c) => c.id === id)) ?? [];
  if (unknown.length) {
    console.error(`unknown circuit(s) ${unknown.join(", ")}; one of ${CIRCUITS.map((c) => c.id).join(", ")}`);
    process.exit(EXIT.USAGE);
  }
  const circuits = opts.circuitIds ? CIRCUITS.filter((c) => opts.circuitIds.includes(c.id)) : CIRCUITS;

  const OUT = `${FACTORY}s${season}/`;
  const DATA = `${OUT}data/`;
  const BUNDLE = `${OUT}bundle`;
  const LOCK = `${OUT}lock`;
  const statePath = `${OUT}state.json`;
  const bakPath = `${OUT}state.json.bak`;
  mkdirSync(OUT, { recursive: true });

  // Single instance ----------------------------------------------------------------------
  const got = tryLock(LOCK, `factory season ${season}`);
  if (!got.ok) {
    console.error(`season ${season} is already being made by PID ${got.holder?.pid} (since ${got.holder?.since}); stop it first (kill ${got.holder?.pid})`);
    process.exit(EXIT.BUSY);
  }
  const lockInfo = { pid: process.pid, what: `factory season ${season}`, since: new Date().toISOString(), argv: argvAll, children: [] };
  onChildrenChange = () => {
    lockInfo.children = [...children].map(({ pid, label, cmd }) => ({ pid, label, cmd }));
    try {
      if (heldLocks.has(LOCK)) writeAtomic(LOCK, JSON.stringify(lockInfo));
    } catch {
      /* the lock file is advisory bookkeeping */
    }
  };
  onChildrenChange();
  reapOrphans(got.stale);

  let state = null;
  const save = () => {
    // Atomic, and the previous good copy is kept as state.json.bak.
    if (existsSync(statePath)) {
      copyFileSync(statePath, `${bakPath}.tmp`);
      renameSync(`${bakPath}.tmp`, bakPath);
    }
    writeAtomic(statePath, JSON.stringify(state, null, 2));
  };

  // Shutdown: signals, crashes, and the normal end all come through here.
  let exiting = false;
  const finish = async (code) => {
    if (exiting) return;
    exiting = true;
    await killChildren();
    rmSync(`${OUT}tmp`, { recursive: true, force: true }); // per-step TMPDIRs
    for (const l of [...heldLocks]) releaseLock(l);
    process.exit(code);
  };
  const onSignal = (sig, n) => () => {
    if (stopping) return;
    stopping = sig;
    log(`${sig}: stopping (children: ${[...children].map((c) => c.label).join(", ") || "none"})`);
    finish(128 + n);
  };
  process.on("SIGINT", onSignal("SIGINT", 2));
  process.on("SIGTERM", onSignal("SIGTERM", 15));
  process.on("SIGHUP", onSignal("SIGHUP", 1));
  const fail = (e) => {
    if (stopping || exiting) return; // a stop is not a failure
    if (e instanceof StopError) return;
    if (e instanceof UsageError) {
      // A refused command line (e.g. --only render without --force): not a failure either.
      console.error(e.message);
      finish(EXIT.USAGE);
      return;
    }
    let code = EXIT.RETRY;
    try {
      code = recordFailure(e);
    } catch (e2) {
      log(`(could not record the failure: ${e2.message})`);
    }
    finish(code);
  };
  process.on("uncaughtException", fail);
  process.on("unhandledRejection", fail);
  // Last resort (process.exit from anywhere): no child group and no lock outlives us.
  process.on("exit", () => {
    for (const c of children) killGroup(c.pid, "SIGKILL");
    for (const l of [...heldLocks]) releaseLock(l);
  });

  /** Counts a failure; returns the exit code (retry later, or gave up → FAILED). */
  function recordFailure(e) {
    const msg = (e?.stack ?? String(e)).slice(0, 6000);
    const permanent = e instanceof PermanentError;
    log(`✗ season ${season} failed: ${e?.message ?? e}`);
    if (!state) {
      // Not even the state could be read: that needs a human.
      writeFileSync(`${OUT}FAILED`, `${new Date().toISOString()}\n${msg}\n`);
      return EXIT.GAVE_UP;
    }
    state.failures = (state.failures ?? 0) + 1;
    state.lastError = msg;
    state.lastFailureAt = new Date().toISOString();
    save();
    if (permanent || state.failures >= MAX_FAILURES) {
      const why = permanent ? "permanent error" : `${state.failures} failures in a row`;
      writeFileSync(`${OUT}FAILED`, `${state.lastFailureAt} — gave up (${why})\n\n${msg}\n\nFix it, then run: npm run factory -- --season ${season}\n`);
      rmSync(`${OUT}retry-after`, { force: true });
      shout(`season ${season} GAVE UP (${why}): see ${OUT.replace(ROOT, "")}FAILED`);
      return EXIT.GAVE_UP;
    }
    const delay = Math.min(BACKOFF_CAP, BACKOFF_FIRST * 2 ** (state.failures - 1));
    writeFileSync(`${OUT}retry-after`, `${Math.round(delay / 1000)}\n`);
    log(`  failure ${state.failures}/${MAX_FAILURES}: retry in ${Math.round(delay / MIN)} min`);
    return EXIT.RETRY;
  }

  // --- the season ------------------------------------------------------------------------
  async function runSeason() {
    // Leftovers of a previous run: per-step temp dirs, half-built bundle/data.
    for (const p of [`${OUT}tmp`, `${BUNDLE}.tmp`, `${OUT}data.new`]) rmSync(p, { recursive: true, force: true });
    state = loadState();
    if (got.stale) {
      // The previous instance died without cleaning up (crash, kill -9, power cut): a failure.
      state.failures = (state.failures ?? 0) + 1;
      state.lastError = `the previous run (PID ${got.stale.pid}) died without cleaning up`;
      log(`  ${state.lastError} (failure ${state.failures})`);
    }
    if (existsSync(`${OUT}FAILED`)) {
      // The loop skips FAILED seasons; running one by hand is the human's retry.
      log(`previous run gave up:\n${readFileSync(`${OUT}FAILED`, "utf8").split("\n").slice(0, 3).join("\n")}\n  retrying (failure count reset)`);
      rmSync(`${OUT}FAILED`);
      state.failures = 0;
    }
    save();

    if (only) checkOnly();

    // 1. Sweep: every circuit needs a seed before the bake (--only sweep: just --circuits).
    if (!only || only === "sweep" || only === "bake") await sweepAll(only === "sweep" ? circuits : CIRCUITS, only === "sweep");
    if (only === "sweep") {
      // New seeds for a baked season: with the user's go-ahead (checkOnly), drop the old bake now.
      if (state.bake && state.bake.seedsHash !== seedsHash(state.seeds)) invalidateSeason("--only sweep changed the seeds");
      return;
    }
    // 2. Bake (+ data + bundle), when missing, forced or stale.
    if (!only || only === "bake") await bake(only === "bake");
    if (only === "bake") return;
    // 3. Renders, 4. metadata, 5. thumbnails.
    if (!only || only === "render") for (const c of circuits) await renderCircuit(c, only === "render");
    if (!only || only === "metadata") for (const c of circuits) await step(`metadata:${c.id}`, () => metadata(c), only === "metadata");
    if (!only || only === "thumbs") for (const c of circuits) await step(`thumbs:${c.id}`, (ctx) => thumbnail(c, ctx), only === "thumbs");
    if (!only) {
      state.failures = 0;
      state.lastError = null;
      if (circuits.length === CIRCUITS.length) state.completedAt = new Date().toISOString();
      save();
      rmSync(`${OUT}retry-after`, { force: true });
      log(`season ${season} done: ${OUT}`);
      const review = Object.keys(state.review ?? {});
      if (review.length) shout(`season ${season}: ${review.length} video(s) NEED REVIEW (garbled frames): ${review.join(", ")}`);
    }
  }

  // --- state -------------------------------------------------------------------------------
  function loadState() {
    let corrupt = false;
    for (const p of [statePath, bakPath]) {
      if (!existsSync(p)) continue;
      try {
        const s = JSON.parse(readFileSync(p, "utf8"));
        if (typeof s !== "object" || !s || typeof s.done !== "object") throw new Error("not a factory state");
        if (p === bakPath) shout(`state.json is unreadable: resuming from state.json.bak (the last step may run again)`);
        return migrate(s);
      } catch (e) {
        corrupt = true;
        log(`!! ${p.replace(ROOT, "")} is unreadable (${e.message})`);
        // Set it aside, so the next save doesn't rotate it into state.json.bak.
        if (p === statePath) renameSync(p, `${p}.corrupt-${Date.now()}`);
      }
    }
    if (corrupt) throw new PermanentError(`state.json and state.json.bak are both unreadable in ${OUT}: fix or delete them`);
    return { season, done: {}, seeds: {}, picks: {}, failures: 0 };
  }
  /** States written by the first factory: one whole-season sweep, no bake record. */
  function migrate(s) {
    s.seeds ??= {};
    s.picks ??= {};
    s.review ??= {};
    if (s.done.sweep) {
      const swept = readJSON(`${OUT}sweep.json`) ?? {};
      for (const id of Object.keys(s.seeds)) {
        s.done[`sweep:${id}`] ??= s.done.sweep;
        const pick = (swept[id] ?? []).find((r) => r.seed === s.seeds[id]);
        if (pick && !s.picks[id]) s.picks[id] = { ...pick, id };
      }
      delete s.done.sweep;
    }
    if (s.done.bake && !s.bake && existsSync(DATA)) {
      // Adopt the old data as it is (the round JSONs only: the bundle can't be rebuilt from it).
      const files = readdirSync(DATA).sort();
      s.bake = { seedsHash: seedsHash(s.seeds), dataHash: hashFiles(files), files, at: s.done.bake, legacy: true };
      if (s.bundled && existsSync(`${BUNDLE}/index.html`)) s.bundle = { dataHash: s.bake.dataHash, legacy: true };
      log(`  adopted the season's legacy bake (${files.length} files in data/)`);
    }
    delete s.bundled;
    return s;
  }

  /** Runs a step unless done (or `redo`); each step gets its own TMPDIR, deleted after it. */
  async function step(name, fn, redo = false) {
    if (stopping) throw new StopError(stopping);
    if (state.done[name] && !redo) return log(`skip ${name} (done)`);
    log(`▶ ${name}`);
    const t0 = Date.now();
    const tmp = `${OUT}tmp/${name.replace(/[^\w.-]+/g, "_")}/`;
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    try {
      await fn({ tmp });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    state.done[name] = new Date().toISOString();
    // Progress: the failure counter counts failures in a row. (Not for sweeps: the
    // bake's re-sweep would reset it on every attempt and the season never give up.)
    if (!name.startsWith("sweep:")) state.failures = 0;
    save();
    log(`✓ ${name} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }

  const doneRenders = () => Object.keys(state.done).filter((k) => k.startsWith("render:"));
  /** --only <step>: what it would throw away, refused without --force. */
  function checkOnly() {
    let lost = [];
    if (only === "sweep" || only === "bake") lost = doneRenders();
    if (only === "render") lost = circuits.flatMap((c) => [`render:${c.id}:video`, `render:${c.id}:short`]).filter((k) => state.done[k]);
    if (lost.length && !force) {
      throw new UsageError(
        `--only ${only} would redo or throw away ${lost.length} finished render(s) (${lost.join(", ")}): hours of video. Pass --force to confirm.`,
      );
    }
  }

  // --- 1. sweep ----------------------------------------------------------------------------
  // "r1-monaco seed 3: L=346 race 143.67s, USA by 0.20s, DNF A B, DQ ESP, 4 classified"
  function parseSummary(line) {
    const m = line.match(/^(\S+) seed (\d+): L=[\d.]+ race ([\d.]+)s, (.+?) by ([\d.]+|-)s(.*)$/);
    if (!m) return null;
    const rest = m[6];
    const dnf = (rest.match(/DNF ([^,]+)/)?.[1] ?? "").trim();
    const dq = (rest.match(/DQ ([A-Z ]+)/)?.[1] ?? "").trim();
    return { id: m[1], seed: Number(m[2]), race: Number(m[3]), winner: m[4], margin: m[5] === "-" ? null : Number(m[5]), dnf: dnf ? dnf.split(" ").length : 0, drains: dq ? dq.split(" ").length : 0 };
  }
  /** Lower is better: a close finish (never a 0.00s tie), one or two drains, nobody stuck. */
  const score = (r) =>
    r.dnf || r.margin === null
      ? Infinity
      : r.margin + (r.margin < 0.015 ? 2.5 : 0) + (r.drains === 0 ? 0.6 : r.drains > 2 ? 0.8 * (r.drains - 2) : 0);

  async function sweepAll(list, redo) {
    const todo = list.filter((c) => redo || !state.done[`sweep:${c.id}`] || state.seeds[c.id] === undefined);
    for (const c of list) if (!todo.includes(c)) log(`skip sweep:${c.id} (done)`);
    if (!todo.length) return;
    const lanes = Math.max(1, Math.min(todo.length, Math.floor(cpus().length / 2)));
    const queue = [...todo];
    // allSettled: one circuit failing doesn't kill the sweeps already running.
    const settled = await Promise.allSettled(
      Array.from({ length: lanes }, async () => {
        for (let c = queue.shift(); c; c = queue.shift()) await step(`sweep:${c.id}`, (ctx) => sweepCircuit(c, ctx), true);
      }),
    );
    const err = settled.find((s) => s.status === "rejected");
    if (err) throw err.reason;
  }

  /** Sweeps one circuit, trying the next seed range when none is usable. */
  async function sweepCircuit(c, ctx) {
    const base = (season - 1) * 100 + 1;
    const all = [];
    let last = base;
    for (let k = 0; k < SWEEP_RANGES; k++) {
      const a = base + k * perCircuit;
      const b = Math.min(a + perCircuit - 1, base + 99); // stay in the season's block of 100
      if (a > b) break;
      last = b;
      const { out } = await run("node", ["scripts/season.mjs", "--round", c.id, "--seeds", `${a}-${b}`], { label: `sweep ${c.id} ${a}-${b}`, timeoutMs: TIMEOUT.sweep, tmp: ctx.tmp });
      const rows = out.split("\n").map(parseSummary).filter((r) => r && r.id === c.id);
      if (rows.length !== b - a + 1) throw new Error(`sweep ${c.id} ${a}-${b}: expected ${b - a + 1} summary lines, got ${rows.length}\n${out.slice(-1500)}`);
      all.push(...rows);
      const best = [...all].sort((x, y) => score(x) - score(y))[0];
      const swept = readJSON(`${OUT}sweep.json`) ?? {};
      swept[c.id] = all;
      writeAtomic(`${OUT}sweep.json`, JSON.stringify(swept, null, 2));
      if (best && score(best) < Infinity) {
        state.seeds[c.id] = best.seed;
        state.picks[c.id] = best;
        log(`  ${c.id}: seed ${best.seed} — ${best.winner} by ${best.margin}s, ${best.drains} drained`);
        return;
      }
      log(`  ${c.id}: no usable seed in ${a}-${b}${k + 1 < SWEEP_RANGES ? "; trying the next range" : ""}`);
    }
    throw new PermanentError(`${c.id}: no usable seed in ${base}-${last} (all had stuck marbles or no margin)`);
  }

  // --- 2. bake + data + bundle ------------------------------------------------------------
  function seedsHash(seeds) {
    return sha(JSON.stringify(CIRCUITS.map((c) => [c.id, seeds[c.id] ?? null]))).slice(0, 16);
  }
  /** Everything the bake writes into the shared folders, and its name in OUT/data. */
  const artefacts = () => [
    ...CIRCUITS.flatMap((c) => [
      { src: `src/gp/races/${c.id}.json`, name: `${c.id}.json` },
      { src: `public/gp/${c.id}.wav`, name: `${c.id}.wav` },
      { src: `public/gp/${c.id}-intro.wav`, name: `${c.id}-intro.wav` },
    ]),
    { src: "src/gp/races/season.json", name: "season.json" },
    { src: "src/gp/races/index.ts", name: "index.ts" },
  ];
  /** A hash over names and contents of `files` in `dir`. */
  function hashFiles(files, dir = DATA) {
    const h = createHash("sha256");
    for (const f of [...files].sort()) h.update(`${f}\0`).update(readFileSync(`${dir}${f}`)).update("\0");
    return h.digest("hex").slice(0, 16);
  }
  let dataChecked = false;
  /** Is OUT/data what the bake recorded? (Checked once per run.) */
  function dataIntact() {
    if (!state.bake) return false;
    if (dataChecked) return true;
    const files = state.bake.files ?? [];
    if (!files.length || files.some((f) => !existsSync(`${DATA}${f}`))) return false;
    dataChecked = hashFiles(files) === state.bake.dataHash;
    return dataChecked;
  }

  async function bake(redo) {
    const seeds = state.seeds;
    const missing = CIRCUITS.filter((c) => seeds[c.id] === undefined).map((c) => c.id);
    if (missing.length) throw new Error(`no seed for ${missing.join(", ")}: the sweep is incomplete`);
    const reasons = [];
    if (redo) reasons.push("--only bake");
    if (!state.done.bake || !state.bake) reasons.push("not baked yet");
    else if (state.bake.seedsHash !== seedsHash(seeds)) reasons.push("the seeds changed since the bake");
    else if (!dataIntact()) reasons.push(`${DATA.replace(ROOT, "")} is missing or damaged`);
    if (!reasons.length) return log("skip bake (done)");
    // A new bake makes every video of the season wrong: never throw them away silently.
    const lost = doneRenders();
    if (lost.length && !force) {
      throw new PermanentError(`a re-bake is needed (${reasons.join("; ")}) but it would throw away ${lost.length} finished render(s): ${lost.join(", ")}. Pass --force to confirm.`);
    }
    invalidateSeason(reasons.join("; "));
    for (let attempt = 1; ; attempt++) {
      const mismatched = [];
      await step(
        "bake",
        (ctx) =>
          withSharedLock(`factory season ${season}: bake + bundle`, async () => {
            mismatched.push(...(await bakeOnce(ctx)));
            if (mismatched.length) throw new Error("bake differs from the sweep"); // not marked done
          }),
        true,
      ).catch((e) => {
        if (!mismatched.length) throw e;
      });
      if (!mismatched.length) return;
      const ids = mismatched.map((m) => m.id);
      if (attempt === 2) throw new Error(`the bake still differs from the sweep after re-sweeping ${ids.join(", ")}:\n${mismatched.map((m) => m.why).join("\n")}`);
      log(`  the bake differs from the sweep for ${ids.join(", ")}:\n${mismatched.map((m) => `    ${m.why}`).join("\n")}\n  sweeping again`);
      for (const id of ids) delete state.done[`sweep:${id}`];
      save();
      await sweepAll(CIRCUITS.filter((c) => ids.includes(c.id)), true);
    }
  }

  /** Clears everything that depends on the bake: bundle, renders, metadata, thumbnails. */
  function invalidateSeason(why) {
    const stale = Object.keys(state.done).filter((k) => /^(bake|render:|metadata:|thumbs:)/.test(k));
    if (stale.length) log(`  re-bake (${why}): clearing ${stale.join(", ")}`);
    for (const k of stale) delete state.done[k];
    state.bake = null;
    state.bundle = null;
    state.review = {};
    save();
    rmSync(BUNDLE, { recursive: true, force: true });
    for (const c of CIRCUITS) {
      for (const f of ["video.mp4", "short.mp4", "master-4k.mp4", "master-short.mp4", "youtube.json", "youtube.md", "thumb.jpg"]) rmSync(`${OUT}${c.id}/${f}`, { force: true });
    }
  }

  /**
   * Under the shared lock: bake, compare with the sweep, copy the artefacts to
   * OUT/data, bundle. Returns the circuits whose bake differs from their pick.
   */
  async function bakeOnce(ctx) {
    const t0 = Date.now();
    writeAtomic(`${OUT}seeds.json`, JSON.stringify(Object.fromEntries(CIRCUITS.map((c) => [c.id, state.seeds[c.id]]))));
    const { out } = await run("node", ["scripts/season.mjs"], { label: "bake", timeoutMs: TIMEOUT.bake, env: { GP_SEEDS: `${OUT}seeds.json` }, tmp: ctx.tmp });
    writeFileSync(`${OUT}bake.log`, out);
    const mismatched = compareBake(out);
    if (mismatched.length) return mismatched;

    // Copy every artefact (each copy throws on failure), checking it is this bake's.
    const tmpData = `${OUT}data.new/`;
    rmSync(tmpData, { recursive: true, force: true });
    mkdirSync(tmpData, { recursive: true });
    const list = artefacts();
    for (const { src, name } of list) {
      const st = statSync(`${ROOT}${src}`, { throwIfNoEntry: false });
      if (!st) throw new Error(`the bake did not write ${src}`);
      if (st.mtimeMs < t0 - 2000) throw new Error(`${src} is older than this bake: the bake did not rewrite it`);
      copyFileSync(`${ROOT}${src}`, `${tmpData}${name}`);
      if (statSync(`${tmpData}${name}`).size !== st.size) throw new Error(`copy of ${src} is incomplete`);
    }
    const files = list.map((a) => a.name);
    const dataHash = hashFiles(files, tmpData);
    rmSync(DATA, { recursive: true, force: true });
    renameSync(tmpData, DATA);
    state.bake = { seeds: { ...state.seeds }, seedsHash: seedsHash(state.seeds), dataHash, files, at: new Date().toISOString() };
    dataChecked = true;
    save();
    log(`  baked; data ${dataHash} in ${DATA.replace(ROOT, "")}`);
    // Bundle right away, still under the lock: it snapshots exactly this bake.
    await buildBundle(ctx);
    return [];
  }

  /** The bake's summary per circuit must be the sweep's pick (same winner, margin, stuck). */
  function compareBake(out) {
    const rows = Object.fromEntries(out.split("\n").map(parseSummary).filter(Boolean).map((r) => [r.id, r]));
    const bad = [];
    for (const c of CIRCUITS) {
      const got = rows[c.id];
      const want = state.picks[c.id];
      if (!got) throw new Error(`the bake printed no summary for ${c.id}:\n${out.slice(-1500)}`);
      if (!want) {
        log(`  (no sweep pick recorded for ${c.id}: not compared)`);
        continue;
      }
      const same = got.seed === want.seed && got.winner === want.winner && got.dnf === want.dnf && (got.margin === null ? want.margin === null : want.margin !== null && Math.abs(got.margin - want.margin) < 0.005);
      if (!same) bad.push({ id: c.id, why: `${c.id}: sweep seed ${want.seed} ${want.winner} by ${want.margin}s, ${want.dnf} stuck; bake seed ${got.seed} ${got.winner} by ${got.margin}s, ${got.dnf} stuck` });
    }
    return bad;
  }

  async function buildBundle(ctx) {
    rmSync(`${BUNDLE}.tmp`, { recursive: true, force: true });
    await run("npx", ["remotion", "bundle", "src/index.ts", "--out-dir", `${BUNDLE}.tmp`, "--log=error"], { label: "bundle", timeoutMs: TIMEOUT.bundle, tmp: ctx.tmp });
    if (!existsSync(`${BUNDLE}.tmp/index.html`)) throw new Error("remotion bundle wrote no index.html");
    rmSync(BUNDLE, { recursive: true, force: true });
    renameSync(`${BUNDLE}.tmp`, BUNDLE);
    state.bundle = { dataHash: state.bake.dataHash, at: new Date().toISOString() };
    save();
  }

  /** The bundle of this season's bake; rebuilt from OUT/data when missing. */
  async function ensureBundle(ctx) {
    if (!state.bake) throw new Error("no bake: run the factory without --only first");
    if (state.bundle?.dataHash === state.bake.dataHash && existsSync(`${BUNDLE}/index.html`)) return;
    if (state.bake.legacy) throw new PermanentError(`the bundle is missing and this season's legacy data (no wavs, no season.json) can't rebuild it`);
    if (!dataIntact()) throw new PermanentError(`the bundle is missing and ${DATA.replace(ROOT, "")} doesn't match the bake (hash): re-bake with --only bake --force`);
    log("  rebuilding the bundle from the season's data");
    await withSharedLock(`factory season ${season}: rebundle`, async () => {
      // Put this season's data back into the shared folders, then bundle it.
      for (const { src, name } of artefacts()) {
        mkdirSync(`${ROOT}${src.slice(0, src.lastIndexOf("/"))}`, { recursive: true });
        copyFileSync(`${DATA}${name}`, `${ROOT}${src}.factory-tmp`);
        renameSync(`${ROOT}${src}.factory-tmp`, `${ROOT}${src}`);
      }
      await buildBundle(ctx);
    });
  }

  // --- 3. render ---------------------------------------------------------------------------
  const freeGB = () => {
    const s = statfsSync(ROOT);
    return (s.bavail * s.bsize) / 1e9;
  };
  /** Garbled frames in a video; throws unless check-frames ran and said how many. */
  async function garbled(file, ctx) {
    const { code, out } = await run("python3", ["scripts/check-frames.py", file], { label: `check-frames ${file.replace(ROOT, "")}`, timeoutMs: TIMEOUT.check, tmp: ctx.tmp, okCodes: [0, 1] });
    const m = out.match(/: (\d+) garbled frame\(s\)(?: at \[([\d, ]*)\])?/);
    if (!m) throw new Error(`check-frames printed no "N garbled" line (exit ${code}):\n${out.slice(-1000)}`);
    const n = Number(m[1]);
    if ((n > 0) !== (code === 1)) throw new Error(`check-frames: exit ${code} but ${n} garbled frame(s)`);
    return { n, frames: m[2] ? m[2].split(",").map(Number) : [] };
  }
  /** Renders, checks; once more if garbled; still garbled: kept, flagged for review. */
  async function renderChecked(comp, master, props, timeoutMs, ctx) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (freeGB() < 12) throw new Error(`only ${freeGB().toFixed(0)} GB free: stopping before ${comp}`);
      await run("npx", ["remotion", "render", BUNDLE, comp, master, `--props=${JSON.stringify(props)}`, `--browser-executable=${CHROME}`, "--log=error"], { label: `render ${comp}`, timeoutMs, tmp: ctx.tmp });
      const g = await garbled(master, ctx);
      if (g.n === 0) return null;
      log(`  ${comp}: ${g.n} garbled frame(s) at ${g.frames.slice(0, 20).join(", ")}${attempt === 1 ? "; rendering again" : ""}`);
      if (attempt === 2) {
        shout(`${comp}: still ${g.n} garbled frame(s) after two renders: kept, flagged needsReview — check it by hand before uploading`);
        return { garbled: g.n, frames: g.frames.slice(0, 100), at: new Date().toISOString() };
      }
    }
  }
  async function encode(master, out, maxrate, ctx) {
    await run(
      "ffmpeg",
      ["-v", "error", "-y", "-i", master, "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-maxrate", maxrate, "-bufsize", "60000k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", `${out}.part.mp4`],
      { label: `encode ${out.replace(ROOT, "")}`, timeoutMs: TIMEOUT.encode, tmp: ctx.tmp },
    );
    renameSync(`${out}.part.mp4`, out);
  }
  async function renderCircuit(c, redo) {
    const dir = `${OUT}${c.id}/`;
    mkdirSync(dir, { recursive: true });
    const kinds = [
      { kind: "video", comp: `GP-${c.id}-4k`, props: { dpr: 1 }, timeoutMs: TIMEOUT.video, maxrate: "30000k", file: "video.mp4" },
      { kind: "short", comp: `GP-${c.id}-short`, props: { season }, timeoutMs: TIMEOUT.short, maxrate: "12000k", file: "short.mp4" },
    ];
    for (const k of kinds) {
      const name = `render:${c.id}:${k.kind}`;
      await step(
        name,
        async (ctx) => {
          await ensureBundle(ctx);
          const master = `${dir}master-${k.kind === "video" ? "4k" : "short"}.mp4`;
          const review = await renderChecked(k.comp, master, k.props, k.timeoutMs, ctx);
          await encode(master, `${dir}${k.file}`, k.maxrate, ctx);
          if (!keepMasters) rmSync(master, { force: true });
          if (review) state.review[name] = review;
          else delete state.review[name];
          delete state.done[`metadata:${c.id}`]; // youtube.json carries needsReview
        },
        redo,
      );
    }
  }

  // --- 4. metadata -------------------------------------------------------------------------
  /** This season's data only: never src/gp/races (that may be another season by now). */
  function dataOf(id) {
    const p = `${DATA}${id}.json`;
    if (!existsSync(p)) throw new Error(`no ${p.replace(ROOT, "")}: bake the season first`);
    return JSON.parse(readFileSync(p, "utf8"));
  }
  const ts = (sec) => {
    const s = Math.max(0, Math.round(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  /** Case-insensitive dedupe, and within YouTube's 500-character budget for tags. */
  function tagList(tags) {
    const seen = new Set();
    const outTags = [];
    let len = 0;
    for (const t of tags.map((x) => String(x).trim()).filter(Boolean)) {
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      const cost = t.length + (t.includes(" ") ? 2 : 0) + (outTags.length ? 1 : 0); // quoted if it has spaces, comma-separated
      if (len + cost > 500) break;
      seen.add(key);
      outTags.push(t);
      len += cost;
    }
    return outTags;
  }
  /** The longest of these that fits YouTube's 100 characters. */
  function fitTitle(candidates) {
    const t = candidates.find((x) => x.length <= 100); // UTF-16 length: an emoji counts double, erring short
    if (!t) throw new Error(`no title fits 100 characters: ${candidates.at(-1)}`);
    return t;
  }
  async function metadata(c) {
    const d = dataOf(c.id);
    const fps = d.fps;
    const I = d.intro?.total ?? 0;
    const name = (i) => d.marbles[i].name;
    const sc = Object.fromEntries((d.intro?.scenes ?? []).map((s) => [s.id, s.at / fps]));
    const lapStart = (lap) => Math.min(...d.laps.filter((l) => l.lap === lap).map((l) => l.start));
    const winner = d.order[0];
    const wf = d.marbles[winner].finishFrame;
    const champ = `Marble Formula Championship 2027 · Season ${season}`;
    // YouTube wants chapters at least 10 s long: the intro is one chapter, the grid and the lights another.
    const chapters = [
      [0, sc.teams !== undefined ? `${champ}: the teams` : champ],
      [sc.flyover, `The circuit: ${d.info.circuit}`],
      [sc.lineup, "Starting grid and lights out"],
      ...Array.from({ length: (d.info.laps ?? 1) - 1 }, (_, k) => [(I + lapStart(k + 1)) / fps, `Lap ${k + 2}`]),
      [(I + wf) / fps - 6, "The finish"],
      [(I + d.timeline.results.at) / fps, "Results and standings"],
    ]
      .filter(([t]) => Number.isFinite(t))
      .reduce((kept, ch) => (kept.length === 0 || ch[0] - kept[kept.length - 1][0] >= 10 ? [...kept, ch] : kept), []);
    const round = d.round;
    const gp = d.info.title;
    const close = d.marbles[d.order[1]]?.finishFrame ? (d.marbles[d.order[1]].finishFrame - wf) / fps : null;
    const hook = close !== null && close < 0.3 ? "PHOTO FINISH" : (d.events ?? []).some((e) => e.kind === "dq") ? "Down the Drain!" : "Flat Out";
    const title = fitTitle([
      `${gp} — Marble Formula Championship 2027 · Season ${season} · Round ${round} | ${hook} 🏁`,
      `${gp} — MFC 2027 · Season ${season} · Round ${round} | ${hook} 🏁`,
      `${gp} — MFC 2027 · Season ${season} · Round ${round} 🏁`,
    ]);
    const drained = d.marbles.map((m, i) => (m.dqFrame !== null && m.dqFrame !== undefined ? i : -1)).filter((i) => i >= 0);
    const results = d.results.slice(0, 10).map((r) => `${r.pos}. ${name(r.marble)} (${teamOf(d.marbles[r.marble].abbr)?.name ?? ""})${r.time !== null ? ` ${r.time.toFixed(2)}s` : ""} +${r.points}`);
    const standings = (d.standings ?? []).slice(0, 5).map((s) => `${s.pos}. ${name(s.marble)} — ${s.points} pts`);
    const cons = (d.constructors ?? []).slice(0, 5).map((s) => `${s.pos}. ${TEAMS.find((t) => t.id === s.team)?.name} — ${s.points} pts`);
    const nice = (l) => l.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()).replace(/^The /, "the ");
    const obstacles = [...new Set(d.features.map((f) => f.label))].filter((l) => l !== "THE LIFT TOWER" && l !== "THE STAIRWAY").map(nice);
    const description = [
      `Season ${season}, round ${round} of ${d.rounds} of the Marble Formula Championship 2027: the ${gp} at ${d.info.circuit}. Twenty marbles, ten teams, ${d.info.laps} laps, and an endless stair carrying them back up between laps.`,
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
      `Drivers' championship (season ${season})`,
      ...standings,
      ``,
      `Constructors' championship (season ${season})`,
      ...cons,
      ``,
      `#marblerace #marblerun #f1 #satisfying`,
    ].join("\n");
    const short = {
      title: fitTitle([
        `Final lap at ${d.info.location ?? gp}! Who takes it? 🏁 MFC Season ${season} #marblerace #shorts`,
        `Final lap at ${d.info.location ?? gp}! Who takes it? 🏁 #marblerace #shorts`,
      ]),
      description: `The final lap of the ${gp}, Marble Formula Championship 2027 season ${season}, round ${round}. Full race on the channel.\n#marblerace #marblerun #f1 #shorts`,
    };
    const tags = tagList([
      "marble race",
      "marble racing",
      "marble run",
      "marble formula",
      "MFC 2027",
      `MFC season ${season}`,
      `marble formula season ${season}`,
      "marble grand prix",
      gp,
      d.info.circuit,
      `${d.info.gp} Grand Prix`,
      "satisfying",
      "country marbles",
      "formula 1",
      "F1",
    ]);
    const review = Object.fromEntries(["video", "short"].map((k) => [k, state.review?.[`render:${c.id}:${k}`]]).filter(([, v]) => v));
    const needsReview = Object.keys(review).length > 0;
    const meta = { title, description, tags, chapters, short, season, round, seed: d.seed, ...(needsReview ? { needsReview: true, review } : {}) };
    const warn = needsReview
      ? `> ⚠️ NEEDS REVIEW: ${Object.entries(review).map(([k, v]) => `${k} has ${v.garbled} garbled frame(s) at ${v.frames.slice(0, 10).join(", ")}`).join("; ")}. Check before uploading.\n\n`
      : "";
    mkdirSync(`${OUT}${c.id}`, { recursive: true });
    writeAtomic(`${OUT}${c.id}/youtube.json`, JSON.stringify(meta, null, 2));
    writeAtomic(`${OUT}${c.id}/youtube.md`, `# ${title}\n\n${warn}${description}\n\nTags: ${tags.join(", ")}\n\n## Short\n\n${short.title}\n\n${short.description}\n`);
    if (needsReview) shout(`${c.id}: youtube.json flagged needsReview`);
  }

  // --- 5. thumbnails -----------------------------------------------------------------------
  async function thumbnail(c, ctx) {
    await ensureBundle(ctx);
    const d = dataOf(c.id);
    const I = d.intro?.total ?? 0;
    // The pack in the heat of the first lap: the most marbles on one screen.
    const rs = d.timeline.raceStart;
    const shot =
      d.shots.find((s) => ["chase", "side", "lead", "feature"].includes(s.kind) && s.start > rs + 4 * d.fps && s.start < rs + 30 * d.fps) ??
      d.shots.find((s) => s.start > rs + 4 * d.fps) ??
      d.shots[5];
    const frame = I + Math.round((shot.start + shot.end) / 2);
    const raw = `${ctx.tmp}thumb-raw.png`;
    await run("npx", ["remotion", "still", BUNDLE, `GP-${c.id}`, raw, `--frame=${frame}`, `--props=${JSON.stringify({ clean: true })}`, "--timeout=240000", `--browser-executable=${CHROME}`, "--log=error"], {
      label: `still GP-${c.id}`,
      timeoutMs: TIMEOUT.still,
      tmp: ctx.tmp,
    });
    mkdirSync(`${OUT}${c.id}`, { recursive: true });
    await run("python3", ["scripts/thumbnail.py", raw, `${OUT}${c.id}/thumb.jpg`, d.info.gp.toUpperCase(), `SEASON ${season} · ROUND ${d.round}`], {
      label: `thumbnail ${c.id}`,
      timeoutMs: TIMEOUT.thumbnail,
      tmp: ctx.tmp,
    });
  }

  // --- go (last: the helpers above are const arrow functions) ------------------------------
  try {
    await runSeason();
    await finish(EXIT.OK);
  } catch (e) {
    fail(e);
  }
}

/** The factory's command line; throws a UsageError. */
function parseArgs(argv) {
  const known = { "--season": 1, "--seeds": 1, "--circuits": 1, "--only": 1, "--force": 0, "--keep-masters": 0 };
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!(a in known)) throw new UsageError(`unknown option ${a}`);
    if (known[a]) {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new UsageError(`${a} needs a value`);
      o[a] = argv[++i];
    } else o[a] = true;
  }
  const int = (name, dflt, min, max) => {
    if (o[name] === undefined) return dflt;
    const n = Number(o[name]);
    if (!Number.isInteger(n) || n < min || n > max) throw new UsageError(`${name} must be an integer in ${min}..${max}`);
    return n;
  };
  const only = o["--only"] ?? null;
  if (only !== null && !STEPS.includes(only)) throw new UsageError(`--only ${only}: not a step; one of ${STEPS.join(", ")}`);
  return {
    season: int("--season", 1, 1, 9999),
    perCircuit: int("--seeds", 8, 1, 50),
    circuitIds: o["--circuits"]?.split(",").map((s) => s.trim()).filter(Boolean) ?? null,
    only,
    force: !!o["--force"],
    keepMasters: !!o["--keep-masters"],
  };
}
