# Marble races

Marble races rendered to MP4 with **Remotion**, **Three.js** (via React Three Fiber) and **Rapier** physics. There are two projects:

1. **Marble Grand Prix:** a 5-round season on real F1 circuits (Monaco, Silverstone, Spa, Suzuka, Monza), with championship points.
2. **The Zigzag Tower:** a single race down a tower of zigzag ramps.

**The key rule for both:** physics never runs during the render. Remotion renders frames in parallel and out of order, so a script bakes each race first (physics, cameras, sound), and the composition only looks frames up by number. That's also why overlays use Remotion's `spring()` / `interpolate()` instead of Motion (framer-motion), which animates on real clock time.

## Marble Grand Prix

An outdoor race circuit at **1080p 60 fps**:

- **Track:** asphalt with white edge lines and red-white kerbs in the corners, between white walls; ten starting lanes.
- **Marbles:** chrome, wearing national flags.
- **Venue:** grass infield, a service road under the track, grandstands with seated crowds, a pit building, floodlight masts, advertising boards and tyre stacks at the bends, under a real sky HDRI with a warm sun.
- **Graphics:** white cards with heavy black type and yellow accents.

Each round goes like this:

- **Intro:** a drone shot of the circuit, a title card (real lap length vs. marble lap, number of obstacles) and the outline drawing itself in.
- **Start:** five red lights, then lights out and the gate lifts.
- **Race:** 10 marbles down a twisting, banked trough full of obstacles. Cameras travel with the pack and wait at the obstacles.
- **Graphics:** a timing tower with gaps to the leader, a minimap with the obstacles marked, position badges over the leaders, overtake alerts, and obstacle captions ("THE DROP", "SLALOM", "PINBALL", …).
- **Finish:** chequered flag and confetti, then a slow-motion photo-finish replay.
- **Cards:** the race results with points, then the championship standings (▲▼ for position changes, and the champion's trophy at the last round).

### Turning a real circuit into a marble track

Circuit outlines come from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT, copy in `data/circuits/`).

`scripts/circuit.mjs` does the conversion:

- **Scale:** it projects the outline to metres and centres it on the origin. Rapier uses 32-bit floats, and raw projected coordinates (around 10⁵ m) made marbles freeze. Every circuit uses the same scale (0.056 units per metre, so a 5.8 km lap becomes about 320 units), except Monaco at 0.09, whose parallel sections are too close together.
- **"Marble-ization":** an elastic-band relaxation pulls every point back toward the real outline. It only straightens corners that are too tight and pushes apart sections closer than the track width. Overlaps are allowed only where the real outline crosses itself, which is Suzuka's bridge. Any hairpin still too tight has its inside edge narrowed in the mesh rather than folding over.

`scripts/season.mjs` then builds the 3D track:

- **Cross-section:** a thin-walled half-pipe, 4.2 wide (six marbles), with a narrow flat bottom (`src/gp/trackMesh.js`). The physics and the renderer use the same mesh.
- **Banking and twists:** corners bank up to 38°, and some straights get an S-shaped twist of ±42°. The trough rotates about the centre of its round sides, so its lowest line barely changes height however hard it twists. That avoids the "bowls" that trapped marbles with a flat floor.
- **Descent:** 5° all the way round, plus sudden drops. The grid sits above the finish straight, and the run-off climbs so marbles stop.
- **Gravity at 20:** at real gravity a 0.7-unit marble behaves like a 70 cm ball (slow and floaty). Stronger gravity makes it quick and snappy, like a real marble.

### Obstacles

Each circuit has a fixed layout, the same for every seed. Obstacles are placed on the straights and cycle through these types:

| Type | What it is |
| --- | --- |
| **The drop** | the trough falls away by 1.1 and the marbles fly off the edge (yellow and black stripe on the lip). At least 3 per circuit where there's room |
| **Slalom** | chrome pegs, one per row, alternating sides |
| **Pinball** | bouncy bumpers with a yellow ring |
| **The spinner** | a rotating chrome paddle (kinematic) |
| **Split lanes** | an off-centre fin that splits the field into two lanes |
| **Rumble strip** | bumps that make the marbles hop |
| **The turntable** | a spinning plate set into the floor; marbles crossing it are dragged sideways |
| **The pusher** | a block that slides out from the wall across the track, timed to the leader |
| **Big air** | a kicker with a 10° run-up, then a 2.0 fall: real flight, under clear guard panels |
| **The lift** | a chain lift with cleats that carries the whole field up to a higher level |
| **The vortex** | a clear funnel bowl set into the track (`src/gp/vortex.js`): a deflector fin sends the field in off-axis, it spirals down the cone and drops through the throat onto the lower track, which resumes under the hole. An agitator (three chrome paddles on a shaft through the throat, turning against the swirl) keeps the queue for the hole disorderly; the lip is 2.2 high because the paddles fling marbles. Reorders the whole pack. One per circuit |
| **The rollers** | three knurled cylinders flush in the floor, all driving forward at 7, 4.5 and 10 u/s: marbles get kicked apart without contact |
| **The fan** | a pulsing lateral gust over 5 units of track (a force in the bake), from a caged fan on a post beside the wall |

There are two rules so that no marble ever gets stuck:

1. **Nothing on the centre line.** The trough funnels marbles to the middle, and a head-on hit there leaves them balanced and stopped. Everything is offset, so every hit is a glancing one.
2. **Wide gaps.** Every gap is either wider than about 3 marbles or too narrow to enter. Gaps of 1–2 marbles let marbles lock into an arch and clog (granular clogging).

Physical obstacles go only on straight track. Wherever marbles can fly (jumps, drops, every machine) clear guard panels rise above the walls: at race speed a marble leaving a drop in a bend would otherwise land on the wall top.

The vortex is the one place the track has a gap: samples inside the bowl carry `gap: true`, and `buildTrackMesh`, the renderer's bands and the trackside details skip them (the lower track gets an end plate where it resumes). Clear parts (the bowl, the guard panels) are in a collision group the director's sight-line rays ignore, so cameras can look through them as they do on screen.

**Disqualification zones.** Every other machine has a small red pad at the foot of one wall (`DQ` in `scripts/season.mjs`), with a red panel and lamp on the wall above it. A marble that is pressed against the wall as it rolls over the pad is out: it vanishes, the tower shows it as OUT, a buzzer sounds, a toast and a slow-motion replay follow, and it scores nothing. The pads are a sensor in the bake loop, not a collider, and they are short (0.3 along the track) so only the unlucky few get caught: ~4 % of marbles per race, about one DQ every race or two. Tune with `DQ_LEN`, `DQ_REACH`, `DQ_OFF`, `DQ_EVERY` and the `--round … --seeds` sweep.

**Marbles** are chrome with a national flag wrapped around the equator (`src/gp/flags.ts` draws the twenty flags procedurally); the overlay uses the same flags as swatches. The field is 20: ten start lanes, two rows (`GRID`). Monza runs at scale 0.08 (459 units, a ~60 s race); the cycling obstacles start 30 units after the funnel so the block of twenty can string out first. The asphalt carries white dashed lane lines (three lanes), a painted direction arrow every 10 units, and lane numbers on the grid.

### The director

The director in `scripts/season.mjs` picks one camera per frame:

- **Moving cameras that travel with the marbles:**
  - behind the pack;
  - ahead of the leader looking back;
  - alongside them;
  - overhead;
  - orbiting.
- **Obstacle cameras:** fixed cameras that wait at an obstacle until the pack arrives.
- **Onboards:** on the marble chasing the leader.
- **Finish-line camera:** for the win.

Every candidate shot is checked with Rapier raycasts so the trough's own wall or another part of the track never blocks the view. Inside each shot, the camera is smoothed with a zero-lag Gaussian filter (we can look ahead because it's offline), and race progress is measured continuously along the track. That removes the stutter.

**Image:** 2× supersampling, ambient occlusion, depth of field, bloom, grain, and motion blur (three sub-frames per frame). The set is a real studio HDRI with a reflective floor. Everything that moves updates imperatively between sub-frames (`src/gp/subframe.ts`), because React can't re-render inside one frame.

The soundtrack is heard from the active camera: rolling, clicks (glass between marbles, a duller knock against the track), start-light ticks, crowd at lights out and at the finish, chimes, and a fanfare.

### Commands

```bash
npm run season                                         # bake the whole season (~20 s)
node scripts/season.mjs --round r3-spa --seeds 1-12    # try seeds for one round
npm run studio                                         # preview: GrandPrix/<round> folders
npx remotion render GP-r5-monza out/gp/r5-monza.mp4
npx remotion render GP-r5-monza-vertical out/gp/r5-monza-vertical.mp4
npm run render:gp                                      # all five rounds, 16:9
```

To change the calendar, the marbles or the seeds, edit `ROUNDS` and `MARBLES` at the top of `scripts/season.mjs`, and `FEATURES` for the obstacles. Any circuit in the f1-circuits repo works: drop its GeoJSON into `data/circuits/`.

Debug switches for `--round` runs:

- `GP_FEATURES=1`: the obstacle layout.
- `GP_DEBUG=1`: where each marble ended up.
- `GP_PACE=1`: time per stretch, to spot slow sections.
- `GP_WATCH=RUB`: one marble's trace.
- `GP_GEOM=20,40`: the geometry over a stretch of track.
- `GP_PROBE=27.5,-1`: drops a single marble at a point.
- `GP_FALL=1`: reports any marble that goes through the floor, with its last second.

### Pitfalls found the hard way

| Symptom | Cause | Fix |
| --- | --- | --- |
| A marble "stopped" while its velocity kept growing | Uncentred coordinates plus 32-bit floats | Centre the outline on the origin |
| Marbles never left the grid | Rapier put them to sleep while they waited | `setCanSleep(false)` |
| The whole field stuck in a chicane | Banking that flips too fast on a flat floor made a bowl | Half-pipe that banks about the centre of its curve |
| The camera stuttered | Progress measured in 0.5 steps, and the camera jumped with it | Continuous progress, plus Gaussian smoothing within each shot |
| Marbles stopped against pegs or bumpers | Obstacles on the centre line, and 1–2 marble gaps that clog | Offset obstacles and a single-file slalom |
| Slow, floaty marbles | Real gravity for a giant marble | Gravity at 20 |
| Side cameras only saw wall | The trough's lip (2.3 tall) was in the way | Side cameras raised to look into the trough |
| A feature camera framed solid white | It stood inside a grandstand roof: the director only knew the track collider | `src/gp/venue.js` places the buildings for both the renderer and the director, which rejects cameras inside or looking through them |
| Floor paint (arrows, grid boxes, kerbs) never showed | `bandGeometry` wound its triangles clockwise, so they were back-face culled; and a band shorter than the sample spacing had one row | Counter-clockwise indices, and rows interpolated at the band's exact ends |
| Grandstands and the pit stood across the track | Their yaw put local x across the track, and nothing checked the footprint | `yawAlong` puts x along the track; buildings go only where no other part of the circuit passes |
| Marbles parked between the rollers | A backward-spinning roller, and proud rollers whose upstream face pushes a slow marble back | All rollers drive forward, nearly flush (0.03 proud) |
| Marbles flew out of the vortex's lower track | They leave the throat at swirl speed and ricochet off the floor over a 1.0 wall | Guard panels over the resume stretch, 2.0 high everywhere, a shorter fall |
| Twenty marbles jammed at the pinball bumpers | A 2-marble gap beside a bumper arches when the whole block arrives together | Smaller bumpers, and the cycling obstacles start later |
| No locked camera at the rollers | Guard panels (now 2.0 high) blocked the director's sight-line rays | Guards and the bowl are in a "clear" collision group the rays skip |

## The Zigzag Tower

Eight marbles race down four zigzag ramps with pegs and spinning paddles. You get a countdown, a leaderboard, a slow-motion replay and a podium.

- **Simulation:** `scripts/tower.mjs` bakes `src/tower/sim.json` and `public/race.wav`.
- **Compositions:** `MarbleRace` (16:9) and `MarbleRaceVertical` (9:16).

```bash
npm run tower -- 3       # bake with seed 3
npm run tower:sweep      # seeds 1–20: winner, margin, stuck marbles (DNF)
npm run render:tower
```

If Remotion can't download its headless Chrome, add `--browser-executable="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` to any render.
