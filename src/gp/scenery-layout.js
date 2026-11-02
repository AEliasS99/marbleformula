// Authored scenery placement shared by renderer and camera director.
// Keep this deterministic; moving it out of Themes.tsx does not move any asset.
const hash = n => {const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);};
export function sceneryLayout(samples) {
    const ys = samples.map((s) => s.p[1]);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const midY = (minY + maxY) * 0.5;
    const groundY = minY - 1.4;
    const xs = samples.map((s) => s.p[0]);
    const zs = samples.map((s) => s.p[2]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const rx = Math.max(68, (maxX - minX) / 2 + 52);
    const rz = Math.max(68, (maxZ - minZ) / 2 + 52);

    // Helper to check if a world (x, z) point is safely away from all track samples (including local track half-width)
    const isClearOfTrack = (x, z, minDist = 18.0) => {
      for (let i = 0; i < samples.length; i++) {
        const dx = samples[i].p[0] - x;
        const dz = samples[i].p[2] - z;
        const req = minDist + (samples[i].w ?? 2.5);
        if (dx * dx + dz * dz < req * req) return false;
      }
      return true;
    };

    // 3D height-aware track clearance for self-contained alpine knolls/props on serpentine circuits
    const isClearOfTrack3D = (x, y, z, minDist = 5.0, yTol = 11.5) => {
      for (let i = 0; i < samples.length; i++) {
        if (Math.abs(samples[i].p[1] - y) > yTol) continue;
        const dx = samples[i].p[0] - x;
        const dz = samples[i].p[2] - z;
        const req = minDist + (samples[i].w ?? 2.2);
        if (dx * dx + dz * dz < req * req) return false;
      }
      return true;
    };

    // Find the nearest sample's elevation so perimeter landmarks sit at camera eye-level
    const nearestTrackY = (x, z) => {
      let bestD = Infinity;
      let bestY = midY;
      for (let i = 0; i < samples.length; i += 4) {
        const dx = samples[i].p[0] - x;
        const dz = samples[i].p[2] - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          bestY = samples[i].p[1];
        }
      }
      return bestY;
    };

    // Trackside props & landmarks placed 26m-50m from the track at the local track elevation (`s.p[1] - 1.2`)
    // so cameras and the track are NEVER clipped by mountain layers or buildings!
    const props = [];
    for (let i = 0; i < 130; i++) {
      const s = samples[Math.floor((i / 130) * samples.length)];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = 26.0 + hash(i * 7.3) * 24;
      const rxDir = s.r[0];
      const rzDir = s.r[2];
      const len = Math.hypot(rxDir, rzDir) || 1;
      const x = s.p[0] + (rxDir / len) * side * dist + (hash(i * 3.1) - 0.5) * 4;
      const z = s.p[2] + (rzDir / len) * side * dist + (hash(i * 5.7) - 0.5) * 4;
      if (!isClearOfTrack(x, z, 22.0)) continue;
      props.push({
        x,
        y: s.p[1] - 1.2,
        groundY,
        z,
        scale: 0.92 + hash(i * 11.3) * 0.65,
        rotY: Math.atan2(s.p[0] - x, s.p[2] - z),
        variant: i % 5,
      });
    }

    // Dense Trackside Swiss Vignettes (Swiss Flags, Grazing Cows with Cowbells, Roadside Chalets & Snow Pines)
    // planted on BOTH sides of the sleek 0.58m barrier every ~7m so every camera angle is packed with Swiss life!
    const alpsTrackFlags = [];
    for (let i = 10; i < samples.length - 14; i += 14) {
      const s = samples[i];
      const rxDir = s.r[0];
      const rzDir = s.r[2];
      const len = Math.hypot(rxDir, rzDir) || 1;
      for (const side of [-1, 1]) {
        if ((Math.floor(i / 14) + (side > 0 ? 0 : 1)) % 3 === 2) continue; // natural staggered rhythm on both sides
        const variant = (Math.floor(i / 14) + (side > 0 ? 0 : 2)) % 3;
        const offset = variant === 1 ? 2.55 : variant === 0 ? 1.95 : 1.35;
        const wTrack = (s.w ?? 2.2) + offset;
        let fx = s.p[0] + (rxDir / len) * side * wTrack;
        let fz = s.p[2] + (rzDir / len) * side * wTrack;
        const reqClear = variant === 1 ? 1.65 : variant === 0 ? 1.15 : 0.55;
        if (isClearOfTrack3D(fx, s.p[1], fz, reqClear, 9.5)) {
          // Keep every accepted vignette, but give its entire meadow terrace
          // room outside the barrier, including the inside of tight bends.
          const terraceRadius = variant === 1 ? 2.18 : variant === 0 ? 1.68 : 1.18;
          let clearanceShift = 0;
          const originalX = fx, originalZ = fz;
          while (clearanceShift < 12 && !isClearOfTrack3D(fx, s.p[1], fz, terraceRadius + .35, 9.5)) {
            clearanceShift = Math.round((clearanceShift + .2) * 10) / 10;
            fx = originalX + (rxDir / len) * side * clearanceShift;
            fz = originalZ + (rzDir / len) * side * clearanceShift;
          }
          alpsTrackFlags.push({
            x: fx,
            y: s.p[1] - 0.05,
            z: fz,
            rotY: Math.atan2(s.p[0] - fx, s.p[2] - fz),
            variant,
            clearanceShift,
            trackClearanceVerified: isClearOfTrack3D(fx, s.p[1], fz, terraceRadius + .35, 9.5),
          });
        }
      }
    }

    // Overhead 3D Swiss Alpine Teleférico / Gondola Cable Car Spans across the track
    /** @type {{pos:[number,number,number],rotY:number,spanW:number,cabOffset:number}[]} */
    const alpsGondolas = [];
    for (let i = 28; i < samples.length - 30; i += 58) {
      const s = samples[i];
      const rxDir = s.r[0];
      const rzDir = s.r[2];
      const len = Math.hypot(rxDir, rzDir) || 1;
      const spanW = (s.w ?? 2.2) + 3.2;
      const lx = s.p[0] - (rxDir / len) * spanW;
      const lz = s.p[2] - (rzDir / len) * spanW;
      const rxP = s.p[0] + (rxDir / len) * spanW;
      const rzP = s.p[2] + (rzDir / len) * spanW;
      if (isClearOfTrack3D(lx, s.p[1], lz, 1.2, 9.0) && isClearOfTrack3D(rxP, s.p[1], rzP, 1.2, 9.0)) {
        alpsGondolas.push({
          pos: [s.p[0], s.p[1], s.p[2]],
          rotY: Math.atan2(s.t[0], s.t[2]),
          spanW,
          cabOffset: ((Math.floor(i / 58) % 3) - 1) * 1.15,
        });
      }
    }

    // Close-Mid Swiss Alpine Pastures & Chalet Villages (8.0m-14.5m from the track, at s.p[1] + 0.35m so they sit
    // right at eye-level outside the 0.58m barrier in every follow-cam shot, using self-contained alpine knolls!)
    const alpsPastures = [];
    for (let i = 0; i < 180; i++) {
      const s = samples[Math.floor((i / 180) * samples.length)];
      const side = i % 2 === 0 ? 1 : -1;
      const dist = 8.2 + hash(i * 6.1) * 6.0;
      const rxDir = s.r[0];
      const rzDir = s.r[2];
      const len = Math.hypot(rxDir, rzDir) || 1;
      const x = s.p[0] + (rxDir / len) * side * dist;
      const z = s.p[2] + (rzDir / len) * side * dist;
      if (!isClearOfTrack3D(x, s.p[1], z, 5.2, 11.5)) continue;
      if (alpsPastures.some((ap) => Math.hypot(ap.x - x, ap.z - z) < 8.2 && Math.abs(ap.y - s.p[1]) < 10.0)) continue;
      alpsPastures.push({
        x,
        y: s.p[1] + 0.35,
        groundY,
        z,
        scale: 1.05 + hash(i * 8.3) * 0.32,
        rotY: Math.atan2(s.p[0] - x, s.p[2] - z),
        variant: i % 3,
      });
    }

    // Adjust after selection so moving a pasture cannot suppress a later one.
    // The authored scales vary; a fixed 5.2m clearance misses the larger caps.
    for (const ap of alpsPastures) {
      const originalX = ap.x, originalZ = ap.z, radius = 5.4 * .98 * ap.scale;
      let clearanceShift = 0;
      while (clearanceShift < 12 && !isClearOfTrack3D(ap.x, ap.y - .35, ap.z, radius + .35, 11.5)) {
        clearanceShift = Math.round((clearanceShift + .2) * 10) / 10;
        ap.x = originalX - Math.sin(ap.rotY) * clearanceShift;
        ap.z = originalZ - Math.cos(ap.rotY) * clearanceShift;
      }
      ap.clearanceShift = clearanceShift;
      ap.trackClearanceVerified = isClearOfTrack3D(ap.x, ap.y - .35, ap.z, radius + .35, 11.5);
    }

    // Outer perimeter ring (360 degrees around the entire circuit, strictly >= 44m clear of any track segment)
    const ring = [];
    const ringCount = 56;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2;
      const radMul = 0.96 + (i % 3) * 0.14 + hash(i * 9.1) * 0.12;
      const x = cx + Math.cos(a) * rx * radMul;
      const z = cz + Math.sin(a) * rz * radMul;
      if (!isClearOfTrack(x, z, 42.0)) continue;
      const ty = nearestTrackY(x, z);
      ring.push({
        x,
        y: ty - 2.5,
        groundY,
        z,
        scale: 1.05 + hash(i * 4.7) * 0.55,
        rotY: Math.atan2(cx - x, cz - z),
        variant: i % 5,
      });
    }

    /** @type {{pos:[number,number,number],basis:import('three').Matrix4,w:number,color:string}[]} */
    const portals = [];

    return { groundY, cx, cz, rx, rz, props, ring, portals, alpsTrackFlags, alpsPastures, alpsGondolas };
}
