# Car and Swiss track enhancement proposal

Review date: 27 October 2026. Scope: evolve the existing full Swiss production and its four car families. These are proposed changes, not implemented improvements. Continue the render queue using the current validated code while these are reviewed.

## What already works

Keep the sculpted cars, national liveries, Formula/GT/buggy/jet families, original Alpine outline/elevation/village/mountains, broadcast graphics, three elimination checkpoints, finish and replay. The native 4K grid shows appealing vehicles with visible team colours and detailed wings, tyres and cockpits. The finish and race stills retain the established production.

Evidence inspected: current `CarModel.tsx`, `Scene.tsx`, `season.mjs`, `car-engine.mjs`, editor `physics.mjs`, Swiss circuit definition, `CarConditions.tsx`, and native seed26 grid/race/finish/incident stills. Seed25 export contact sheet and technical reports were inspected earlier. A complete moving-video editorial review remains necessary; stills and metrics cannot certify excitement.

## Priority 1: make the existing cars feel connected to the road

| Finding | Proposed enhancement | Validation on the existing circuit |
| --- | --- | --- |
| Production plants the saved car pose onto the road and computes damped roll/pitch in `season.mjs`. `Scene.tsx` passes no wheel-physics data into `CarBody`; its wheels and suspension arms share the body transform. The editor already stores independent wheel suspension, using a different simulation. | Introduce a shared baked vehicle presentation contract: steering, wheel travel/rotation, body roll/pitch, longitudinal/lateral load and boost/braking state. First separate body movement from tyre contact in the current production. Reuse the editor's existing wheel-data path where compatible, after validating on the real Alpine track. | Same-seed close shots under braking, wet-corner sliding and kerb contact; tyres stay on the surface, arms follow hubs, body movement does not make tyres float or bury themselves. Independent render order and slow replay must give identical poses. |
| Front/rear tyres have different radii, but production spins every wheel using `-u / 0.135`. Steering is inferred from four frames of future body heading. | Accumulate actual travelled wheel distance with each effective radius; bake steering independently of chassis slip and animate countersteering during a measured slide. Keep the existing Ackermann presentation, with consistent wheel-side conventions. | Straight travel matches wheel circumference; inside/outside wheels and reverse/slide cases behave consistently; no wheel-angle reset at a replay or segment boundary. |
| All four visual shapes use one collision length/width (`1.54 × 0.88 m`). Current production and editor also scale/place the same mesh differently. This is a measurement risk, not yet proof of a visible collision bug. | Measure transformed bounds for each existing class and align contact envelopes, wheelbase and ride height with its mesh. Keep the current collision solver's stall fix. | Overlay physical envelopes over all four cars in real-track stills; check close passes and wall clearance. No visible interpenetration or contact before the bodies/wheels reach each other. |

Avoid transplanting the editor engine wholesale into production. It has genuine wheel suspension, but that does not establish that its handling preserves the accepted Alpine racing, cameras or stability.

## Priority 2: stronger identity and more readable materials

- **Differentiate the existing four families further.** Preserve each hull; refine class-specific wheelbase/ride height, fenders, cockpit, aero and exhaust treatment. Several supporting parts are shared, so class silhouettes can converge at race-camera distance. Review front/side/rear views of the same actual cars before adding detail.
- **Improve national identity at viewing size.** Keep current flags and colours; give each country a stable race number rather than the current grid-index number (`i + 1`), plus a bold top/rear identifier. Use distinct stripe layouts for similar red/white and yellow cars. Test at normal playback and thumbnail size, not only a 4K close-up.
- **Use material hierarchy.** Current body paint emits light through its livery map, with additional bright underfloor, rim and lamp accents. Keep the stylised finish, but compare reduced daylight emission, rubber/carbon roughness and cleaner paint reflections. Let actual lights and braking/boost events carry the brightest accents.
- **Make effects describe actual vehicle state.** Production exhaust currently estimates boost from speed/acceleration, and smoke estimates slip from poses. Bake authoritative braking/boost/slip events for lamps, exhaust, tyre spray and sound. Wet grip loss should read as water spray and countersteer; dry friction can produce a short tyre puff. Avoid continuous decorative smoke or sparks.
- **Give the families recognisable sound.** The current engine base frequency uses `(i % 4)`, so timbre depends on grid position rather than vehicle class. Assign a stable class/country sound profile, load-dependent pitch and short braking/slip/contact sounds. Preserve the established music and camera-relative mix.

## Priority 3: more racing opportunities within the Swiss circuit

The Swiss car mode replaces marble obstacles with attack zones. Its authored randomness currently centres on three inside-line meltwater patches and seeded driver commitment. This is a good foundation for readable risk/reward sections.

| Existing section | Proposed refinement | Purpose |
| --- | --- | --- |
| Meltwater bends at u113–127, u233–248 and u482–497 | Make the exact physical footprint easier to read: feathered wet edges, clear dry outside line, restrained reflection/spray and sector signage. The current rendered mesh and `surfaceGrip()` blend use different edge/taper rules, so derive both from one footprint. | Viewers understand why a shorter inside line can lose grip, and drivers have a visible alternative. |
| Existing longer braking approach | Add braking-distance boards, a clearer apex kerb and a modest local passing-width variation where the existing scenery permits. Test a late-braking outside/inside choice using the current road. | Create a visible braking contest without replacing the route or adding arbitrary spins. |
| Current attack strips | Keep physically crossing the strip as the trigger; show charge/activation clearly. Test a slightly longer approach line that trades time for stored exit speed. | A car can sacrifice position now for a later pass; cause and effect stays understandable. |
| Village sequence | Tune consecutive corner lines so entry, apex and exit favour different decisions. Retain the village, outline and elevation; use small, measured local width/camber changes only after contact/camera checks. | Reduce processional follow-the-same-line racing while keeping this circuit recognisable. |
| Final hairpin and finish | Keep the polished gantry and exact timing line; improve approach markings and runoff. Hold a clear shot with the leader and nearest challenger together through the crossing, then a short finish/reaction hold before replay. | Show the actual contest and margin without blocking the finish with the gantry or cutting early. |

Do not add traffic accidents as timed events or manipulate winners. Interesting errors should follow braking, traffic, surface grip and contact. Retain the three elimination checkpoints and make their closing moments easier to read.

## Evidence and success criteria

Current fixed seeds25/26 both account for every car, have three elimination checkpoints, zero recoveries/stalls and no unresolved camera framing/occlusion frames. Their existing action reports show:

| Metric | Seed25 | Seed26 |
| --- | ---: | ---: |
| Recorded pass events | 7 | 14 |
| Conservative decisive passes | 1 | 2 |
| Confirmed lead passes, with the existing one-second persistence criterion | 0 | 0 |
| Measured wheel-to-wheel time | 22.28 s | 40.90 s |

Rank changes are not automatically clean passes. These numbers support improving sustained battles; they do not prove that either full video is exciting or dull.

Suggested implementation order:

1. Presentation/contact consistency: wheel radii/steering, body-only suspension motion, measured class bounds, stable identity and event-driven effects/audio.
2. One existing wet bend and one braking/attack section: visible driving choices, then physics tuning with unchanged comparison seeds.
3. Full-circuit moving review and finish pacing; only then expand the treatment to the other two wet bends.

Compare fixed seeds24/25/26 before and after; do not search for a preferred winner. Preserve the original masters and telemetry. Require no stalls/recoveries, no discontinuous pose jumps, consistent physical/rendered surfaces, valid checkpoints, clear subjects/finish cameras, deterministic replays and native 4K60/audio/decode/scene checks. Assess excitement with the user in the full unlisted videos, including sound.
