// How many turns each marble makes in each vortex: node scripts/vortex-revs.mjs r5-monza [seed]
const root = new URL("../", import.meta.url).href;
const m = await import(root + "scripts/season.mjs");
const R = (await import("@dimforge/rapier3d-compat")).default;
await R.init();
const { CIRCUITS } = await import(root + "src/gp/circuits/index.js");
const c = CIRCUITS.find((x) => x.id === process.argv[2]);
const r = await m.runRound(c, Number(process.argv[3] ?? c.seed), { quiet: false });
const d = r.data;
console.log(r.summary);
for (const v of d.vortices) {
  const revs = [];
  for (let i = 0; i < 20; i++) {
    let ang = null, tot = 0, inside = false;
    for (let f = 0; f < d.frames.length; f++) {
      const p = d.frames[f][i];
      const dx = p[0] - v.center[0], dz = p[2] - v.center[2];
      const inB = Math.hypot(dx, dz) < v.radius && p[1] < v.center[1] + 0.5 && p[1] > v.center[1] - v.depth - 1;
      if (inB) { const a = Math.atan2(dz, dx); if (ang !== null) { let da = a - ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; tot += da; } ang = a; inside = true; }
      else if (inside) break;
    }
    revs.push((Math.abs(tot) / (2 * Math.PI)).toFixed(1));
  }
  console.log("revs", revs.join(" "));
}
