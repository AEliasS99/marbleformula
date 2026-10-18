# Quality review: Monza (round 5, v5)

Measured on `out/gp/r5-monza.mp4` (1080p60, 1:35) and `src/gp/races/r5-monza.json`.

## What the numbers say

**Physics**

| Measure | Value | Reading |
| --- | --- | --- |
| Marble speed | median 5.4 u/s, max 10.2 | ≈ 100 mm/s at marble scale: a leisurely roll. Real runs go 1–2 m/s |
| Time airborne | 3.0 % of the race | Jumps barely fly: 1.9 s to cross the jump zone, no visible hang time |
| Marble contacts | ~1.4 pairs touching per sample | They clump; collisions are soft (restitution 0.45) so the pack never splits open |
| First 40 units | 13.3 s (vs 5.5–9.6 s elsewhere) | Slow launch: 5° slope from a standing start |
| Slalom (fins) | 5.2 s per marble for 13 u | Slowest obstacle: marbles slide along the fins and lose speed |
| Lift | 4.5 s for 16 u | A "reset": every marble leaves the lift bunched up again |
| Hammer / spinner | 0.9 s / 0.8 s in the zone | So quick that the machines rarely hit anything |
| Pinball | median 1.4 s, max 5.8 s | One marble got held up between bumpers for 4 s |
| Finish spread | 9.8 s, 9 overtakes | Fine |

**Cameras**

| Measure | Value | Reading |
| --- | --- | --- |
| Shots | 21 in 74 s, avg 3.7 s | Good TV rhythm |
| Shot mix | chase 16.5 s, side 17.9 s, orbit 9.4 s, lead 8.4 s, top 6.4 s, onboard 3.0 s, obstacle cams 3.7 s | Only **one** obstacle shot in the whole race: the obstacles are the spectacle and the cameras miss them |
| Leader height in frame | median 9–15 %; `side` min 2.9 %, `top`/`grid`/`feature` ≈ 9 % | Marbles are small on screen most of the time |
| Leader out of frame | `side` 7 %, `finish` 16 % (after the win) | The finish cam keeps watching the line while the rest are far away |

**Image** (full-res crops)

- Polygons: not visible. Spheres (96×64), fillets (18 steps), 2× supersampling, 4096 shadow map are enough. Stop investing here.
- What still says "CG": flat, even light; a dark grey void behind the white track; black patches reflected in the chrome (the studio's black flags); no motion blur on marbles moving ¼ of their diameter per frame; lane paint edges soft in close-ups.

## Proposals, by realism gained per hour of work

### A. Lighting and image — DONE (v8)

Done: A1 (motion blur: each frame rendered 3 times inside a 180° shutter and averaged in a float buffer; everything that moves — marbles, machines, lift, confetti, the camera itself — has an imperative sub-frame updater in `src/gp/subframe.ts`), A2 (a real photo-studio HDRI from `@pmndrs/assets` replaces the procedural studio; the render is held until it has loaded), A3 (polished floor with a blurred planar reflection, drei's `MeshReflectorMaterial`), A4 (lighter grey set, exposure 0.85), A5 (AO radius 0.45, intensity 4). Bloom's threshold had to rise to 2.6: with a bright studio the white track sat above the old threshold and veiled the whole frame.

Render time: ~15 min → ~40 min per race (3 sub-frames + the reflection pass).

Original proposals:

1. **Motion blur by accumulation.** Render 3 sub-frames per frame (t − ⅓, t, t + ⅓) and average. The sim is continuous (`marblePose(t)`), so this is exact. Marbles, gears and cleats smear naturally. Cost: ≈3× render time (15 → 45 min).
2. **Real studio environment.** Replace the procedural studio with the `studio.exr` HDRI that ships in `@pmndrs/assets`; keep one soft key light. Removes the black patches in the chrome and gives the plastic real gradients.
3. **Floor that reflects.** A polished studio floor with a planar reflection of the track (`MeshReflectorMaterial`-style render-to-texture). A white track floating over a matte void is the strongest CG tell right now.
4. **Lighter, graded cyclorama** (light grey → white at the top) and a visible light pool on the floor under the key light.
5. **Contact shadows**: darken AO near contact (`intensity` 2.4 → 4 with a smaller radius 0.4) so marbles sit on the track.
6. **Lane texture** 64×1024 → 256×4096 so onboard close-ups show crisp paint edges; add 2 % edge wear.

### B. Physics of marbles and obstacles — DONE (v6)

Done: B1 (marble–marble 0.75, obstacles use the Min combine rule so a head-on hit never sends a marble back up the slope), B2 (8° launch), B3 (kicker with a 10° run-up, 2.0 drop, clear guard panels over every jump: marbles were flying over the wall in bends), B4 (24° bouncy fins), B5 (two-pass bake phases the hammer and spinner to the leader's arrival; the hammer's pivot was 1.3 too low after the flat-track change), B6 (bumpers staggered). Result on Monza seed 1: 12/12 seeds finish, airtime 6.7 % (was 3.0), marble contacts halved, the hammer knocks 6 of 10, first 40 u in 11.5 s (was 13.3), finish spread 8.5 s, 10 overtakes.

Found on the way: a marble that stops right behind an obstacle (after a head-on hit) oscillates against it for a few seconds; rare, accepted for now.

Original proposals:

1. **Livelier collisions**: marble–marble restitution 0.45 → 0.75 (glass on glass), combine rule *Max*. The pack splits open on every hit and overtakes stop being quiet.
2. **Punchier start**: 8° for the first 25 units (lanes + funnel), then 5°. Cuts the 13 s opening to ~8 s.
3. **Real jumps**: kicker lip 0.5 → 0.8 and a landing ramp 1.8 lower; add a **gap jump** (two track pieces with a visible gap, the drop underneath as the safety net). Target 8–10 % airtime.
4. **Fins**: 35° → 24° and bouncy (restitution 0.6): marbles ricochet through instead of sliding.
5. **Machines that actually hit**: phase the hammer and spinner to the leader's arrival (the sim knows when the pack reaches u), widen the hammer head to 1.0.
6. **Pinball stall**: move the second bumper 0.3 off the first one's wake; check with `GP_WATCH` that no marble sits > 2 s.
7. **Lift as a feature, not a reset**: two parallel belts at different speeds (left fast, right slow) so lane choice matters; or keep it as the "regroup" but shorten to 10 u.

### C. Cameras that follow the action — DONE (v7)

Done: C1 (one locked camera per obstacle, picked from 12 candidates by how often it actually sees the leader over the frames the pack spends there: every obstacle on Monza now gets its shot, 1.5–4.7 s each), C2 (adaptive field of view on all fixed cameras: leader ≥ 14 % of the frame height unless the pack's spread needs more; side cam closer and lower; overhead lower), C3 (up to three slow-motion instant replays of the hardest obstacle hits, cut in right after they happen, with their own close camera, re-timed hit sounds and a label), C5 (after the win: finish camera only when a marble is within 7 units of the line, otherwise a framed shot on the rest). Leader out of frame during the race: 0–1 %.

Original proposals:

1. **One guaranteed shot per obstacle**: pre-place a locked cam above the wall at 35° looking down the obstacle; frame checked against the pack's *predicted* arrival, not only the current focus.
2. **Adaptive FOV**: pick the FOV so the leader is ≥ 14 % of the frame height and the pack still fits; `side` cam 1.6 off the wall instead of 2.2.
3. **Slow-motion highlights**: the sim records impacts; after a hit stronger than X at a machine or a jump landing, replay 1.5 s at 0.4× with a REPLAY tag (same mechanism as the finish replay).
4. **Rail cam**: a camera gliding on a rail beside the track at the pack's speed (smoother than chase, reads as a real dolly).
5. **After the win**: follow the remaining pack with chase/side and cut to the finish cam only when a marble is within 4 u of the line (fixes the 16 %).
6. **Lift picture-in-picture**: the lift takes 4.5 s; show the standings tower or a close-up inset instead of a static wide.

### Later rounds (v8)

- Marbles carry national flags (ESP, ITA, FRA, DEU, GBR, USA, BRA, JPN, ARG, MEX).
- Faster track: 6.5° slope, less damping, gravity 22: median speed 5.4 → 7.2 u/s, race 55 → 44 s.
- New machines: the turntable (disrupts 10 of 10) and the pusher (6 of 10); the hammer swings 40° with a motor box (9 of 10). Rotor arms shortened so a marble at the wall slips past instead of being pinned.
- Clear guards over drops and every machine.

### Sharpness pass (v9)

Inspected v8 at 1:1: the biggest loss was the preview encode (2 Mbps); previews are now 9 Mbps (CRF 19). In the render itself: marble textures 1024×512 → 4096×2048 (flags and codes read in close-ups), lane paint 1024 → 4096 px across with masked-paint edge lines, turntable top as brushed steel with rubber spokes, crisper key-light shadows (radius 5 → 3), gentler depth of field (focus range 3.5 → 6, bokeh 1.8 → 1.1) and a shorter shutter (0.5 → 0.35) so the action stays crisp. The track's frames are smoothed over ±3 samples (no per-sample wobble in stripes or physics), and the guard panels lost screen-space refraction, which was shifting the stripes seen through them.

### Race venue (v10)

The rainbow studio became an outdoor circuit: asphalt floor with aggregate grain, white edge lines and a worn racing line, red-white kerbs on the inside of corners, grass with mowing stripes, a sky HDRI as backdrop and environment, a hard warm sun. Around the track (`src/gp/Trackside.tsx`): service road, two grandstands with ~1500 instanced seats in colour blocks, pit building, six floodlight masts, advertising boards, tyre stacks at the bends. Machines got amber beacons, chrome rails on the lift, hazard-striped fins.

### Paint, venue fixes, twenty marbles, DQ zones (v11)

- Asphalt gets white dashed lane lines (geometry, not texture, so the grid lanes stay clean), a direction arrow every 10 u and lane numbers 1–10 on the grid. This exposed a long-standing bug: every floor band (`bandGeometry`) was wound clockwise and back-face culled, so the start line, grid boxes and kerbs had never rendered.
- The director now knows the venue (`src/gp/venue.js`): no camera inside a stand or the pits, and no shot looking through one (the slalom cam sat inside the grandstand roof). The buildings also had their long side across the track and the pit under the finish straight; fixed with `yawAlong` and a footprint check.
- Twenty marbles (ten new flags), two rows of ten on the grid; marble textures 2048×1024 each; tower rows tighter, results and standings in two columns.
- Disqualification pads at every other machine (see README). Monza seed 3: Netherlands by 0.30 s, Brazil out at the hammer.
- More obstacle detail: chrome top rails on guard panels, pinball score caps (100/250/500) on the bumpers, LED caps on the pegs, rubber tips on the spinner, bearings and a counterweight on the hammer.

### D. Rendering speed

- Current: 15 min per race, 1 tab (parallel tabs produced garbled frames).
- Motion blur ×3 → ~45 min. Mitigation: render the AO/DOF at half resolution (`halfRes`), which costs nothing visible at 2×.

## Suggested order

1. B1 + B2 + B4 + B5 (one bake, ~1 h): the race itself gets more exciting.
2. C1 + C2 + C5 (director, ~2 h): the viewer sees the obstacles.
3. A2 + A3 + A4 + A5 (lighting, ~2 h): the image stops looking like CG.
4. A1 motion blur (~1 h, slower renders).
5. C3 highlights, B3 gap jump, B7 twin lift (~3 h).
