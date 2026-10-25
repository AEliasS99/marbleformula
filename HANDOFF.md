# Marble Formula (`@MarbleFormula`) — Complete Project & Conversation Handoff

> **Quick Resume on New Mac**:
> When opening this repository in Antigravity on the new Mac, `.agents/rules/marbleformula-context.md` is loaded automatically. Simply say:
> *"Lee `HANDOFF.md` y continuemos desde donde lo dejamos."*

---

## 1. Mandatory Rules & Preferences
1. **Language**: Always respond in Spanish (or English if the user writes in English).
2. **Video Storage Rule (`$HOME/GoogleCloud` ONLY)**:
   - **NEVER save `.mp4` or `.mov` video renders inside the repository (`out/`, `site/assets/`, `~/marmot`, or `/Volumes/128external`).**
   - Save all video renders exclusively to `$HOME/GoogleCloud` (or `$VIDEO_OUT`), which mounts the Google Cloud Storage bucket `gs://elias-marmot-races`.
3. **Never Downgrade or Trim Renders (`ffmpeg -c copy` ONLY)**:
   - NEVER re-encode with lower bitrates/CRF or trim (`-ss` / `-to`) any rendered master.
   - Always concatenate multi-round/multi-heat tournament videos using lossless **`ffmpeg -y -f concat -safe 0 -i list.txt -c copy -movflags +faststart`** on full, uncut files.
4. **Video Format & YouTube Constraints (`@MarbleFormula`)**:
   - Always render **Long-Form 4K UHD (`3840x2160` at `60fps`)** using the `-4k` Remotion compositions (`GP-r1-monaco-4k` .. `GP-r5-monza-4k` with `--props='{"dpr":1}'`).
   - Always include the **3 "Don't Be Last!" Laser Knockout Checkpoints** (`CHECKPOINT 1`, `CHECKPOINT 2`, `CHECKPOINT 3`).
   - Until `@MarbleFormula` completes phone verification in YouTube Studio (*Settings -> Channel -> Feature eligibility -> Intermediate features*), any single upload must be **under 15 minutes (`< 900s`)** or YouTube will reject it at 100% (`Processing abandoned`).
   - Video titles must be `<= 100` characters; channel descriptions must be `<= 1000` bytes.

---

## 2. Live YouTube Broadcasts on `@MarbleFormula` (`https://www.youtube.com/@MarbleFormula`)
All 6 multi-round marble elimination broadcasts are live and processed in HD (`1080p60` `-c copy`):
1. **Season 3 · Part 1 (Tokyo, Swiss Alps, Cairo)** — `https://youtu.be/AG_H16LbVyU` (`13:24` · `HD` · `processed/succeeded`)
2. **Season 3 · Finale (Sydney, New York & Gala)** — `https://youtu.be/Syrkb20yo3A` (`9:28` · `HD` · `processed/succeeded`)
3. **Season 2 World Tour · Part 1 (Las Vegas, Brazil, Miami)** — `https://youtu.be/WD_sAvtTwoc` (`13:53` · `HD` · `processed/succeeded`)
4. **Season 2 World Tour · Finale (Zandvoort, Abu Dhabi & Gala)** — `https://youtu.be/a4j2zaGG014` (`9:29` · `HD` · `processed/succeeded`)
5. **Season 1 Classic GP · Part 1 (Monza, Monaco, Silverstone)** — `https://youtu.be/WbBebzJ6xi4` (`11:55` · `HD` · `processed/succeeded`)
6. **Season 1 Classic GP · Finale (Spa, Suzuka & Gala)** — `https://youtu.be/YFngc6rN7_c` (`8:31` · `HD` · `processed/succeeded`)

---

## 3. Architecture: Dual 3D Physics Engines

### Engine 1: Marble Engine (`GP_CARS=0`, default)
- **Main file**: [`scripts/season.mjs`](./scripts/season.mjs)
- **Runners**: 20 national-flag & swirled art-glass marbles (`R = 0.35m`) across 10 constructor teams (`10x2` starting grid).
- **Format**: 2 laps with **The Stairway** dual-bay escalator at the end of Lap 1 + intermediate **Chain Lifts**.
- **Obstacles (24–31 per track)**: The Vortex (hyperbolic funnel), The Hammer (pendulum axe), The Whirlwind (3-blade rotor), The Turntable, The Rollers, The Pusher, Peg Forests, Splitters, Big Air Jumps, and Red DQ Zones.
- **"Don't Be Last!" Checkpoints**: 3 laser gates per race (`19 -> 18 -> 17` survive).
- **Audio**: Spatial ASMR glass-on-glass impact & rolling sound synthesis.

### Engine 2: Motorsport Car Engine (`GP_CARS=1`)
- **Main files**: [`scripts/car-engine.mjs`](./scripts/car-engine.mjs), [`scripts/season.mjs`](./scripts/season.mjs), [`src/gp/Scene.tsx`](./src/gp/Scene.tsx)
- **Runners**: 20 country touring/open-wheel cars across 4 3D chassis silhouettes (`F1` Open-Wheel, `JET` Le Mans Hypercar, `GT` GT3 Touring Car, `BGY` Titan Raid Buggy).
- **10-Point Constructor Power Budget**: Every car has `VEL` (Straight Top Speed 1–5) + `EST` (Cornering Grip/Stability 1–5) + `INT` (Racing Line & Overtake IQ 1–5) = `10` points.
- **Realistic Motorsport Physics (`buildCarTelemetryProfile` in `scripts/car-engine.mjs`)**:
  - Precomputes tire-grip cornering speed ($v_{\text{apex}} = \sqrt{a_{\text{lat,max}} / |\kappa|} \approx 10\text{–}12\text{ m/s}$), backward carbon-ceramic braking zones ($a_{\text{brake}} = 11.5\text{ m/s}^2$), and forward corner-exit acceleration ($16\text{–}22\text{ m/s}$ on straights with aerodynamic slipstream + DRS Attack Zones).
  - **Macro Optimal Racing Line (`racingLat`)**: 32-pass Gaussian-smoothed spline following **Outside Entry $\to$ Inside Apex Kerb $\to$ Outside Exit**, plus inside-apex divebomb overtaking when a car ahead blocks the line.
  - **3D Surface Chord Velocity Solver (`scripts/season.mjs`)**: Advances cars along the exact 3D banked surface chord (`pointOnTrack(..., R + 0.045)`) so spheres never snag internal triangle diagonals on banked turns (`0.0%` vertical bouncing, `0.0%` time stuck `< 6 m/s`).
  - **OBB 3D Car-to-Car Collisions (`solveCarChassisCollisions`)**: Oriented Bounding Box (`1.54m × 0.88m`) 4-pass relaxation solver so cars battle wheel-to-wheel without mesh clipping.
  - **3D Visual Vehicle Dynamics (`src/gp/Scene.tsx`)**:
    - Front-wheel **Ackermann steering yaw (`steerYaw`)** on front wheels (`wIdx === 0, 1`).
    - Dynamic rear **FIA LED brake lights (`brakeRefs`)** that flare brightly (`emissiveIntensity = 11.5`) in braking zones.
    - Suspension body roll (`carRoll`) and braking nose-dive / throttle squat pitch (`carPitch`).
- **Tournament Format ("Don't Be Last!" 4 Heats + Grand Final)**:
  - **Heats 1–4 (6 cars each)**: Checkpoint 1 (`5` survive) $\to$ Checkpoint 2 (`4` survive) $\to$ Checkpoint 3 (`3` survive) $\to$ Finish Line (**Top 2 Qualify directly** + fastest **P3 Wildcard**).
  - **Grand Final (10 cars)**: Checkpoint 1 (`8` survive) $\to$ Checkpoint 2 (`6` survive) $\to$ Checkpoint 3 (`4` survive) $\to$ 4-car sprint for the Championship Podium.

---

## 4. All 10 Locations & 3D World Themes
Defined in [`src/gp/circuits/`](./src/gp/circuits/) and [`src/gp/Themes.tsx`](./src/gp/Themes.tsx):
1. **`r1-monaco` — Swiss Alpine GP (Matterhorn Glacier Switchbacks, Zermatt 🇨🇭)**:
   - Dense 3D Swiss Alps scenery: Matterhorn peaks, overhead 3D **Swiss Teleférico cable cars (`SwissCableCarSpan`)**, spotted Swiss cows with golden cowbells (`SwissCow`), wooden Swiss chalets, snow-dusted pines (`SwissPine`), Swiss flags lining both sides of the track, and sleek `0.58m` F1-style barriers.
2. **`r5-monza` — Tokyo GP (Shibuya Neon Expressway, Japan 🇯🇵)**:
   - Illuminated cyberpunk skyscrapers, giant red Shinto Torii arches spanning the track, pagodas, and Sakura cherry blossoms.
3. **`r2-silverstone` — Egyptian GP (Giza Pyramid Dunes, Cairo 🇪🇬)**:
   - Great Pyramids of Giza, 3D Great Sphinx, golden hieroglyphic obelisks, fire-lit temple portals, and palm oases.
4. **`r3-spa` — Australian GP (Sydney Harbour Bridge Circuit, Sydney 🇦🇺)**:
   - 3D Sydney Opera House sails, Sydney Harbour Bridge steel arch, Circular Quay skyline, lighthouses, and sailboats.
5. **`r4-suzuka` — New York GP (Times Square Finale, USA 🇺🇸)**:
   - 3D Statue of Liberty on Liberty Island, Empire State Building spire, Broadway neon billboards, and suspension bridges.
6. **Classic Season 1 F1 Circuits**: Monza, Monaco, Silverstone, Spa-Francorchamps, and Suzuka (published on YouTube).

---

## 5. Web Control Center (`https://marbleformula.com`)
- **Source**: [`site/index.html`](./site/index.html) + `site/assets/*.jpg`
- **Deploy command**:
  ```zsh
  CI=1 NODE_OPTIONS="--dns-result-order=ipv4first" npx wrangler pages deploy site --project-name=marble-formula --branch=main --commit-dirty=true
  ```

---

## 6. First-Time Setup & Next Steps on the New Mac
1. **Clone & Run 1-Click Installer**:
   ```zsh
   git clone https://github.com/AEliasS99/marbleformula.git ~/marmot/races
   cd ~/marmot/races
   zsh scripts/setup-new-mac.sh
   ```
   - **YouTube OAuth Tokens**: Already backed up in `$HOME/GoogleCloud/.youtube-auth/` (`.youtube-client.json` & `.youtube-token.json`). Both `scripts/setup-new-mac.sh` and `scripts/upload-youtube.mjs` automatically copy them into the repo root when `$HOME/GoogleCloud` is mounted!
2. **Run the 4K UHD "Don't Be Last!" Tournament Batch & Auto-Upload**:
   ```zsh
   caffeinate -dimsu zsh scripts/render-tcr-overnight.sh
   ```
   - Note: `tcr-alps-heat1-4k.mp4` (`830.1 MB`) was already rendered to `/Users/eli/GoogleCloud/tcr-alps-heat1-4k.mp4`. When `/Users/eli/GoogleCloud` is mounted on the new Mac, the script automatically skips Heat 1 and continues from **Heat 2, Heat 3, Heat 4, and the 10-Car Grand Final**, concatenates them into `tcr-alps-tournament-4k.mp4`, uploads to YouTube (`@marbleformula`), and then renders & uploads the **Tokyo 4K UHD Tournament** (`tcr-tokyo-tournament-4k.mp4`).
