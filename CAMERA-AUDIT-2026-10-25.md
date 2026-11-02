# Race cameras: action coverage and finish review

User direction: every shot must add racing value. Prioritize a moving lead pack, the current leader, close battles/overtakes, incidents and decisive crossings. Do not schedule elevator or transport-machine inserts for their own sake.

## Findings

The independent audit of five existing car telemetry files found 10.6–13.3% of active-race frames with no active vehicle center anywhere inside the full 16:9 image; uninterrupted gaps reached 1.37–1.95 seconds. This is projection evidence, not proof of unobstructed body geometry or HUD clearance. Source hashes and detailed measurements are preserved in the workspace `.tools/camera-audit-independent.md`.

Legacy production scheduled lift splits and lift-queue approach shots without requiring a racing event. Sparse framing checks ran before smoothing and the fallback shot was unchecked. Finish coverage could remain fixed at an empty line while distant racers approached. The previous Racecraft preview selected Austria by name, then the eventual winner, kept a disappearing subject, and ended at a hardcoded world-origin overview. Replay had no finish-line landmark. The legacy finish portal used a hardcoded sample spacing; finish timing artificially enforced a minimum gap between results.

## Changes

- `scripts/race-director.mjs`: isolated camera planning from physics so existing telemetry can be audited without rebaking. Legacy car/marble camera planning removes transport inserts, adds event-driven racing coverage, uses actual crossing windows and checks framing after smoothing. `scripts/season.mjs` invokes it for future production bakes. Existing saved camera tracks and finished masters are preserved; regenerate cameras before another legacy render.
- `src/replay/camera.mjs`: deterministic replay planner chooses drone, battle, overtake, checkpoint, incident and live-leader shots from measured telemetry. Ordinary shots hold roughly three seconds; significant events can interrupt. Actual finish windows take priority. Rendering/seek order cannot affect decisions. The planner records why each shot was selected and includes all its subjects in its framing calculation. Incident detection uses rollover/rapid speed-loss evidence, not invented crashes.
- `src/gp/FinishLine.tsx`: shared checkered paint, slim supports beyond the track and a readable two-sided FINISH sign. Uses the true timing-plane frame from track geometry, with nonuniform arc-length interpolation for legacy tracks. It has no physics collider. The replay finish camera approaches from the upstream quarter to avoid the sign hiding approaching cars.
- `src/gp/race.ts`: retain measured finish gaps; do not fabricate separation for close results.
- `scripts/render-racecraft.mjs`: `--take camera-review` renders a new local version from the same saved physics while preserving earlier previews. Records camera plan, source hashes and the correct finish geometry. Library keeps it pending user review.

## Editorial rules and limits

Drone shots must explain the moving field, not tour empty scenery. A stopped or eliminated racer loses routine camera priority. Incidents may briefly justify a shot; a stationary lift does not. Finish coverage starts before arrival, keeps the line and approaching racers visible, and returns to racing during long gaps between finishers. Finishing positions/times are physical results, not camera-direction decisions.

The new 21-second oval review has no crash event; its full render demonstrates lead-pack drone, an overtake, a close battle, a checkpoint and finish coverage. Incident selection has separate synthetic regression coverage. Full venue/occlusion QA is still required for each new circuit: point projection alone cannot prove cars are not hidden by scenery, gantries, other racers or overlays. Existing public videos are not modified. The older `marble` repository was audited as a reference; active changes are in `marbleformula`, which hosts both current engines.

## Validation evidence

The regenerated camera plans were tested against five current car recordings and one preserved marble recording, without changing their physics. All six had zero frames with no active racer center inside the central 90% of the image under the test's active-race window. The director also reported zero unresolved track/venue line-of-sight samples after excluding riders inside transport cabins. These checks cover the recorded geometry used by the test, not every rendered decorative object. The source masters and original camera arrays remain unchanged.

The new replay planner passes deterministic seek-order, translated-circuit, live-order/overtake, incident, removed-subject, finish-window and framing tests. On the chosen oval replay, all 3,106 selected subject/finish-point projections across the 60fps timeline fell inside the central90% bounds. Library/media and render-provenance tests also pass. Visual stills exposed a finish-banner obstruction from the downstream angle; the rendered comparison uses an upstream quarter angle to keep approaching cars clear.

Known editorial limit: if every remaining racer is inside transport, there is no live racing subject. A deliberately scheduled replay would be preferable; this update does not invent one or alter the race clock. The director avoids elevator-focused inserts and chooses other moving racers whenever available.

The legacy live timeline now ends after the last actual finisher (+2 seconds, bounded by recorded frames), rather than choosing a roster position derived from qualification counts. Replays/splits cannot replace a protected live action shot. Five focused legacy tests passed: five car recordings covered 11,959 active evaluated frames with zero empty central90% frames; the preserved marble recording covered 6,734 with zero empty frames. Its leader was offscreen in 610 frames intentionally while the director selected other racing subjects instead of transport. This is camera regeneration against saved frames; no new physics bake or legacy master render was run.

Final visual QA caught two presentation defects in the first camera take: completed racers could swap tower positions when sorted by frozen distance, and holding completed poses for one second caused cars to overlap on the timing plane. `camera-review-final` corrects the order using measured finish times and restores the brief 0.15-second terminal visibility window. The earlier camera take is retained as a documented draft, not a review candidate.

Independent follow-up also exposed a stopped-crash eligibility bug. Incident detection now checks unfinished racers, including speed zero, while routine coverage still prefers moving racers. A regression verifies a12→0m/s rollover receives a bounded incident shot before coverage returns to racing. This post-bundle incident fix was compared with the final preview's bundled director: its shot plan and camera parameters at every60fps race frame remain identical because the preview has no stopped crash. The manifest's renderer hash continues to identify the actual bundled code, not a retroactively changed source hash.
