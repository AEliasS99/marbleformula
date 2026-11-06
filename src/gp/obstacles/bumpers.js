// Pinball: three small bouncy bumpers of different sizes, staggered near the
// middle. Wide openings (> 2 marbles) on both sides, never touching a wall (no
// pocket to get pinned in), offset so a marble can't ping-pong between two.
// Small: with twenty marbles arriving together, a gap under ~2.3 marbles beside a bumper clogs.
export default {
  type: "bumpers",
  label: "PINBALL",
  place: { before: 1, after: 5, maxCurv: 0.035 },
  dq: true,
  card: { difficulty: 2, chaos: 3, seconds: 1.5, summary: "Three springy posts that bat marbles sideways." },
  build(f, { cylinder, physicsProfile }) {
    if (process.env.GP_CARS === "1") {
      // Zero pinball bumpers in Car Mode!
      return;
    }
    if(physicsProfile==='contact-flow-v3'){
      // Both bypasses exceed 2.3 marble diameters: two racers cannot form an
      // arch between a post and the rail. The offset small caps still deflect
      // the centre of the pack. Keep the exposed shoulder (.28-.12=.16)
      // below half the marble radius: the old .28-high shoulder still caused
      // head-on recoil loops in recorded ARG/BRA arrivals despite wide lanes.
      for(const [du,lat,r]of [[0,.25,.14],[2.4,-.25,.14],[4.8,.25,.12]])
        // A .4 rebound on this low shoulder launched fast arrivals above the
        // actual side guard. Keep a damped .2 rebound, verified through landing.
        cylinder('bumper',f.u+du,lat,r,.28,.20,{friction:.02});
      return;
    }
    const contact=physicsProfile==='contact-flow-v2'?{friction:.03}:{};
    cylinder("bumper", f.u, 0.3, 0.2, 0.75, 0.8,contact);
    cylinder("bumper", f.u + 2.3, -0.4, 0.24, 0.75, 0.8,contact);
    cylinder("bumper", f.u + 4.5, 0.35, 0.22, 0.75, 0.8,contact);
  },
};
