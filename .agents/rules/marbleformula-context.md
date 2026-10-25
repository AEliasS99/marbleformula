---
description: Complete project context, YouTube channel rules, video storage policy, and handoff state for Marble Formula (@MarbleFormula). Always active.
---

# Marble Formula (@MarbleFormula) — Project & Conversation Handoff Rule

## 1. Non-Negotiable Video Storage & Quality Rules
1. **Video Storage (`$HOME/GoogleCloud` ONLY)**:
   - Save ALL `.mp4`, `.mov`, and video renders exclusively in `$HOME/GoogleCloud` (`gs://elias-marmot-races`).
   - NEVER save `.mp4` or `.mov` files inside `./out`, anywhere else in `~/marmot`, or on external drives.
   - Code, JSON telemetry (`src/gp/races/*.json`), images, and `.wav` audio stay in the project repo.
2. **Never Downgrade or Trim Renders**:
   - NEVER re-encode with lower bitrates/CRF or trim (`-ss` / `-to`) any rendered master.
   - Always concatenate multi-round/multi-heat tournament videos using lossless **`ffmpeg -y -f concat -safe 0 -i list.txt -c copy -movflags +faststart`** on full, uncut files.
3. **YouTube Upload Constraints (`@MarbleFormula`)**:
   - Until `@MarbleFormula` completes phone verification in YouTube Studio (*Settings -> Channel -> Feature eligibility -> Intermediate features*), any single upload must be **under 15 minutes (`< 900s`)** or YouTube will reject it at 100% (`Processing abandoned`).
   - Video titles in `videos.insert` must be `<= 100` characters.
   - Channel descriptions in `channels.update` must be `<= 1000` bytes.

## 2. Live YouTube Broadcasts on `@MarbleFormula` (`https://www.youtube.com/@MarbleFormula`)
All 6 multi-round marble elimination broadcasts are live and processed in HD (`1080p60` `-c copy`):
- **Season 3 · Part 1 (Tokyo, Swiss Alps, Cairo)**: `https://youtu.be/AG_H16LbVyU` (`13:24` HD)
- **Season 3 · Finale (Sydney, New York & Gala)**: `https://youtu.be/Syrkb20yo3A` (`9:28` HD)
- **Season 2 World Tour · Part 1 (Las Vegas, Brazil, Miami)**: `https://youtu.be/WD_sAvtTwoc` (`13:53` HD)
- **Season 2 World Tour · Finale (Zandvoort, Abu Dhabi & Gala)**: `https://youtu.be/a4j2zaGG014` (`9:29` HD)
- **Season 1 Classic GP · Part 1 (Monza, Monaco, Silverstone)**: `https://youtu.be/WbBebzJ6xi4` (`11:55` HD)
- **Season 1 Classic GP · Finale (Spa, Suzuka & Gala)**: `https://youtu.be/YFngc6rN7_c` (`8:31` HD)

## 3. Active 4K UHD TCR Car Elimination Tournament Pipeline
- **Script**: `zsh scripts/render-tcr-overnight.sh`
- Renders 4K UHD (`3840x2160` 60fps) **TCR · Total Control Racing ("Don't Be Last!")** tournaments (`Heats 1–4` of 6 cars + `10-Car Grand Final`) to `$HOME/GoogleCloud/`:
  1. **Swiss Alps Matterhorn 4K UHD Tournament**: `$HOME/GoogleCloud/tcr-alps-tournament-4k.mp4` (`GP-r1-monaco-4k`) + automatic upload to `@MarbleFormula`.
  2. **Tokyo Shibuya Neon 4K UHD Tournament**: `$HOME/GoogleCloud/tcr-tokyo-tournament-4k.mp4` (`GP-r5-monza-4k`) + automatic upload to `@MarbleFormula`.
- **Website Deployment (`https://marbleformula.com`)**:
  - `CI=1 NODE_OPTIONS="--dns-result-order=ipv4first" npx wrangler pages deploy site --project-name=marble-formula --branch=main --commit-dirty=true`
