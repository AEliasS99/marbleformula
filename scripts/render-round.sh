#!/bin/bash
# Renders one round (the master), checks it for garbled frames and makes the
# HQ preview: scripts/render-round.sh r1-monaco [suffix]
# 4K (GP-<id>-4k at dpr 1: the pixel cost of 1080p at dpr 2).
# The bundle is built under the factory's shared lock (src/gp/races and
# public/gp can't change under it), then rendered from that snapshot.
# Exit status: 0 clean, 1 garbled frames found (the preview is still made),
# anything else: a step failed.
set -euo pipefail
cd "$(dirname "$0")/.."
id="$1"; tag="${2:-}"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
out="out/gp/$id$tag.mp4"
bundle="out/bundle-$id$tag"
mkdir -p out/gp out/preview out/logs
trap 'rm -rf "$bundle"' EXIT
node scripts/factory.mjs --shared-lock -- npx remotion bundle src/index.ts --out-dir "$bundle" --log=error
npx remotion render "$bundle" "GP-$id-4k" "$out" --props='{"dpr":1}' --browser-executable="$CH" --log=error > "out/logs/$id$tag-render.log" 2>&1 || { echo "render failed (out/logs/$id$tag-render.log)"; exit 2; }
check=0
python3 scripts/check-frames.py "$out" > "out/logs/$id$tag-check.log" 2>&1 || check=$?
cat "out/logs/$id$tag-check.log"
if [ "$check" -gt 1 ]; then echo "check-frames failed (exit $check)"; exit "$check"; fi
ffmpeg -v error -y -i "$out" -c:v libx264 -preset slow -crf 20 -maxrate 30000k -bufsize 60000k -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "out/preview/$id$tag-hq.mp4"
exit "$check"
