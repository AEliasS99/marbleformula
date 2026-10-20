import pegs from "./pegs.js";
import bumpers from "./bumpers.js";
import splitter from "./splitter.js";
import spinner from "./spinner.js";
import hammer from "./hammer.js";
import turntable from "./turntable.js";
import pusher from "./pusher.js";
import rollers from "./rollers.js";
import fan from "./fan.js";
import vortex from "./vortex.js";
import regroup from "./regroup.js";
import booster from "./booster.js";
import switchGate from "./switch.js";

// The obstacle library. Every obstacle is a module (this folder) with:
//   type, label           what the overlay and the director call it
//   place                 { before, after, maxCurv, once?, always?, perLap? }: the clear straight it needs
//   guard                 [from, to, height?]: clear guard panels over that stretch
//   dq                    may a disqualification pad sit beside it
//   card                  { difficulty, chaos, seconds, summary }: for designing tracks and the catalog
//   collection            the key its records are exported under in the round's JSON
//   build(f, ctx)         records (and static colliders) for one placement
//   physics(world, list, ctx) → { kinematics(t)?, frame(f, ctx)?, inside(p)?, export()? }
//   course                hooks that reshape the track's height around it
// Shape features (drops, jumps, rumble strips, the chain lift) are part of the
// course itself; they are listed here with their placement rules only.

const shape = (type, label, place, extra = {}) => ({ type, label, place, shape: true, ...extra });

/** In the planner's order (it shuffles this list with the round's seed, so the order is part of every layout). */
export const OBSTACLES = [
  shape("drop", "THE DROP", { before: 2, after: 6, maxCurv: 0.09 }, { guard: [-1, 7], card: { difficulty: 1, chaos: 2, seconds: 1, summary: "The floor falls away 1.1: the pack flies off the edge." } }),
  pegs,
  bumpers,
  spinner,
  splitter,
  shape("bumps", "RUMBLE STRIP", { before: 1, after: 7, maxCurv: 0.09 }, { card: { difficulty: 1, chaos: 1, seconds: 1, summary: "Bumps that make the marbles hop." } }),
  // Gentle bends are fine for a jump: the guard panels catch any drift.
  shape("jump", "BIG AIR", { before: 7, after: 9, maxCurv: 0.05 }, { guard: [-3, 12, 2.0], card: { difficulty: 2, chaos: 3, seconds: 1.5, summary: "A kicker and a 2.0 fall: real flight." } }),
  hammer,
  turntable,
  pusher,
  rollers,
  fan,
  vortex,
  regroup,
  switchGate,
  booster, // placed by the bake on the straights after the bends
  // Placed by the bake itself at the apex of the sharp bends (never in a layout): a short hump that
  // throws fast marbles into the air in the curve. Banked, guarded.
  shape("crest", "THE CREST", { before: 4, after: 5, maxCurv: 1 }, { card: { difficulty: 2, chaos: 3, seconds: 0.5, summary: "A hump at the apex of a bend: fast marbles take off sideways." } }),
];
export const BY_TYPE = Object.fromEntries(OBSTACLES.map((o) => [o.type, o]));
/** The machines every circuit gets, placed first and spread over the lap, in this order. */
export const ALWAYS = ["vortex", "spinner", "turntable", "rollers", "pusher"];
/** Physics creation order (it decides the solver's order, so it is part of every bake's result). */
export const PHYSICS_ORDER = { beforeLifts: ["vortex", "regroup"], beforeStatics: ["rollers"], afterStatics: ["spinner", "hammer", "turntable", "pusher", "switch"] };
