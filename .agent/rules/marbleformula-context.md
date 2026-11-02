---
description: Core architecture, storage constraints, and context for Marble Formula (Dual Engine: Marbles & Motorsport Cars)
---

# Marble Formula Workspace Context

## Current storage and publication policy (user update, 2026-10-25)

This overrides the old Mac's disk-space workaround and any older mount/auto-upload instructions below.
- Generate and keep work-in-progress videos on this Mac, outside Git repositories, in $VIDEO_OUT (currently ~/GoogleCloud, a LOCAL directory despite its name).
- Do not mount the cloud bucket over this working directory or enable automatic synchronization of renders.
- Required order: finish the video locally → review and validate it with the user → upload to YouTube and confirm success → archive the finished, validated video in gs://elias-marmot-races.
- Do not archive drafts, failed renders, or unvalidated videos in Google Cloud. Paying for cloud storage is acceptable; early uploads are not desired.
- Do not automatically delete the local master after archiving; deletion requires a separate user instruction.
- The updated overnight script prepares/renders locally only and defaults to --prepare. See marbleformula/RENDER-WORKFLOW.md (RENDER-WORKFLOW.md from the repository root). Upload is a separate step after user validation; older auto-upload descriptions below are historical.


Always read `HANDOFF.md` at the root of the repository when starting a new conversation to understand the full history, dual-engine architecture (`scripts/season.mjs` and `scripts/car-engine.mjs`), 10 3D locations (`src/gp/Themes.tsx`), web control center (`site/index.html` deployed to `marbleformula.com`), and the 4K UHD "Don't Be Last!" tournament render pipeline (`scripts/render-tcr-overnight.sh`).

## Mandatory Rules
1. **NEVER save `.mp4` or `.mov` video files inside the repository (`out/`, `site/`, etc.)**. Always save rendered videos to `$HOME/GoogleCloud` (or `$VIDEO_OUT`).
2. **YouTube Videos (`@marbleformula`)**: Render in **4K UHD (`3840x2160` 60fps)** using `GP-<round>-4k` with `--props='{"dpr":1}'` and `--timeout=180000`, and keep the 3 **"Don't Be Last!"** laser knockout checkpoints enabled.
