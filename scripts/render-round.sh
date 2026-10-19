#!/bin/bash
# Renders one round (the master), checks it for garbled frames and makes the
# HQ preview: scripts/render-round.sh r1-monaco [suffix]
# 4K (GP-<id>-4k at dpr 1: the pixel cost of 1080p at dpr 2).
set -u
cd "$(dirname "$0")/.."
id="$1"; tag="${2:-}"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
out="out/gp/$id$tag.mp4"
mkdir -p out/gp out/preview out/logs
npx remotion render "GP-$id-4k" "$out" --props='{"dpr":1}' --browser-executable="$CH" --log=error > "out/logs/$id$tag-render.log" 2>&1 || { echo "render failed"; exit 1; }
python3 scripts/check-frames.py "$out" > "out/logs/$id$tag-check.log" 2>&1
ffmpeg -v error -y -i "$out" -c:v libx264 -preset slow -crf 20 -maxrate 30000k -bufsize 60000k -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "out/preview/$id$tag-hq.mp4"
cat "out/logs/$id$tag-check.log"
