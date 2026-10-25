---
description: Core architecture, storage constraints, and context for Marble Formula (Dual Engine: Marbles & Motorsport Cars)
---

# Marble Formula Workspace Context

Always read `HANDOFF.md` at the root of the repository when starting a new conversation to understand the full history, dual-engine architecture (`scripts/season.mjs` and `scripts/car-engine.mjs`), 10 3D locations (`src/gp/Themes.tsx`), web control center (`site/index.html` deployed to `marbleformula.com`), and the 4K UHD "Don't Be Last!" tournament render pipeline (`scripts/render-tcr-overnight.sh`).

## Mandatory Rules
1. **NEVER save `.mp4` or `.mov` video files inside the repository (`out/`, `site/`, etc.)**. Always save rendered videos to `$HOME/GoogleCloud` (or `$VIDEO_OUT`).
2. **YouTube Videos (`@marbleformula`)**: Render in **4K UHD (`3840x2160` 60fps)** using `GP-<round>-4k` with `--props='{"dpr":1}'` and `--timeout=180000`, and keep the 3 **"Don't Be Last!"** laser knockout checkpoints enabled.
