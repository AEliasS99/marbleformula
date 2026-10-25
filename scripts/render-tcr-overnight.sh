#!/usr/bin/env zsh
set -euo pipefail

cd "${0:A:h}/.."
VIDEO_OUT="${VIDEO_OUT:-$HOME/GoogleCloud}"
mkdir -p out out/gp "$VIDEO_OUT"

echo "=========================================================="
echo "Starting 4K UHD 'Don't Be Last!' TCR Tournament Batch at $(date)"
echo "Resolution: 3840x2160 (4K UHD 60fps)"
echo "Saving all videos exclusively to $VIDEO_OUT"
echo "=========================================================="

# 1. Render Swiss Alps Matterhorn "Don't Be Last!" 4K UHD Tournament (Heats 1-4 + 10-Car Grand Final)
for H in 1 2 3 4 final; do
  OUT_FILE="$VIDEO_OUT/tcr-alps-heat${H}-4k.mp4"
  if [[ "$H" == "final" ]]; then
    OUT_FILE="$VIDEO_OUT/tcr-alps-grand-final-4k.mp4"
  fi
  if [[ -s "$OUT_FILE" ]]; then
    echo ">>> [ALPS 4K TCR - HEAT: $H] Already rendered ($OUT_FILE), skipping to next..."
    continue
  fi
  echo ""
  echo ">>> [ALPS 4K TCR - HEAT: $H] Baking & Bundling at $(date)..."
  GP_CARS=1 GP_LAPS=1 GP_HEAT=$H GP_ONLY=r1-monaco node scripts/season.mjs
  cp src/gp/races/r1-monaco.json "src/gp/races/r1-monaco-tcr-$H.json"
  cp public/gp/r1-monaco.wav "public/gp/r1-monaco-tcr-$H.wav"

  rm -rf out/bundle-cars
  npx remotion bundle src/index.ts --out-dir out/bundle-cars

  echo ">>> [ALPS 4K TCR - HEAT: $H] Rendering 4K UHD $OUT_FILE at $(date)..."
  npx remotion render out/bundle-cars GP-r1-monaco-4k "$OUT_FILE" --props='{"dpr":1}' --concurrency=4 --timeout=180000
  echo ">>> [ALPS 4K TCR - HEAT: $H] Finished $OUT_FILE at $(date)!"
done

cat > out/tcr-alps-4k-concat.txt <<EOF
file '$VIDEO_OUT/tcr-alps-heat1-4k.mp4'
file '$VIDEO_OUT/tcr-alps-heat2-4k.mp4'
file '$VIDEO_OUT/tcr-alps-heat3-4k.mp4'
file '$VIDEO_OUT/tcr-alps-heat4-4k.mp4'
file '$VIDEO_OUT/tcr-alps-grand-final-4k.mp4'
EOF

ffmpeg -y -f concat -safe 0 -i out/tcr-alps-4k-concat.txt -c copy "$VIDEO_OUT/tcr-alps-tournament-4k.mp4"
echo ">>> Created 4K UHD Full Tournament: $VIDEO_OUT/tcr-alps-tournament-4k.mp4 at $(date)!"

# Generate YouTube Metadata & Upload Swiss Alps 4K UHD Tournament
sips -s format jpeg -s formatOptions 90 out/alps-swiss-scenery-2.png --out out/gp/tcr-alps-tournament-4k-thumb.jpg || true
cat > out/gp/tcr-alps-tournament-4k-youtube.json <<EOF
{
  "title": "DON'T BE LAST! 🔥 4K60 Swiss Alps Car Elimination Tournament (Heats 1–4 + Final)",
  "description": "DON'T BE LAST! 🏁 Watch the full 4K UHD 60fps Swiss Alps Mountain Pass Touring Car Elimination Tournament (Qualifying Heats 1–4 + 10-Car Grand Final) at the Matterhorn Glacier Circuit!\n\n24 country touring cars battle through 4 Qualifying Heats with 3 Laser Knockout Checkpoints per race — if you're last at a Checkpoint Gate, you're ELIMINATED! Only the Top 2 from each heat plus the 2 fastest P3 Wildcards advance to the 10-Car Grand Final!\n\n⏱️ TOURNAMENT FORMAT:\n• Qualifying Heats 1–4 (6 Cars): Checkpoint 1 (5 survive) → Checkpoint 2 (4 survive) → Checkpoint 3 (3 survive) → Finish Line (Top 2 Qualify + Fastest P3 Wildcard)\n• 10-Car Grand Final: Checkpoint 1 (8 survive) → Checkpoint 2 (6 survive) → Checkpoint 3 (4 survive) → 4-Car Sprint for the Championship Podium!\n\n100% real 3D physics & motorsport vehicle dynamics simulation in 4K 60fps (optimal racing line, carbon braking zones, FIA brake lights, Ackermann front steering, aerodynamic slipstream & DRS Attack Zones).\n\nWhich country are you cheering for? Drop your pick in the comments! 🌍👇\n🌐 Official Website: https://marbleformula.com\n\n#dontbelast #eliminationrace #carrace #f1 #motorsport #swissalps #3d #4k60fps #satisfying",
  "tags": [
    "dont be last",
    "elimination race",
    "car race",
    "3d car race",
    "touring car championship",
    "TCR",
    "formula 1",
    "Swiss Alps",
    "Matterhorn",
    "4k 60fps",
    "motorsport simulation",
    "marble formula",
    "satisfying",
    "country race"
  ]
}
EOF

echo ">>> Uploading $VIDEO_OUT/tcr-alps-tournament-4k.mp4 to YouTube (@marbleformula)..."
node scripts/upload-youtube.mjs --file "$VIDEO_OUT/tcr-alps-tournament-4k.mp4" --round tcr-alps-tournament-4k --force

# 2. Render Tokyo Shibuya Neon "Don't Be Last!" 4K UHD Tournament (Heats 1-4 + 10-Car Grand Final)
rm -f src/gp/races/tcr-qualifiers.json
for H in 1 2 3 4 final; do
  echo ""
  echo ">>> [TOKYO 4K TCR - HEAT: $H] Baking & Bundling at $(date)..."
  GP_CARS=1 GP_LAPS=1 GP_HEAT=$H GP_ONLY=r5-monza node scripts/season.mjs
  cp src/gp/races/r5-monza.json "src/gp/races/r5-monza-tcr-$H.json"
  cp public/gp/r5-monza.wav "public/gp/r5-monza-tcr-$H.wav"

  rm -rf out/bundle-cars
  npx remotion bundle src/index.ts --out-dir out/bundle-cars

  OUT_FILE="$VIDEO_OUT/tcr-tokyo-heat${H}-4k.mp4"
  if [[ "$H" == "final" ]]; then
    OUT_FILE="$VIDEO_OUT/tcr-tokyo-grand-final-4k.mp4"
  fi

  echo ">>> [TOKYO 4K TCR - HEAT: $H] Rendering 4K UHD $OUT_FILE at $(date)..."
  npx remotion render out/bundle-cars GP-r5-monza-4k "$OUT_FILE" --props='{"dpr":1}' --concurrency=4 --timeout=180000
  echo ">>> [TOKYO 4K TCR - HEAT: $H] Finished $OUT_FILE at $(date)!"
done

cat > out/tcr-tokyo-4k-concat.txt <<EOF
file '$VIDEO_OUT/tcr-tokyo-heat1-4k.mp4'
file '$VIDEO_OUT/tcr-tokyo-heat2-4k.mp4'
file '$VIDEO_OUT/tcr-tokyo-heat3-4k.mp4'
file '$VIDEO_OUT/tcr-tokyo-heat4-4k.mp4'
file '$VIDEO_OUT/tcr-tokyo-grand-final-4k.mp4'
EOF

ffmpeg -y -f concat -safe 0 -i out/tcr-tokyo-4k-concat.txt -c copy "$VIDEO_OUT/tcr-tokyo-tournament-4k.mp4"
echo ">>> Created 4K UHD Full Tournament: $VIDEO_OUT/tcr-tokyo-tournament-4k.mp4 at $(date)!"

cat > out/gp/tcr-tokyo-tournament-4k-youtube.json <<EOF
{
  "title": "DON'T BE LAST! 🔥 4K60 Tokyo Shibuya Car Elimination Tournament (Heats 1–4 + Final)",
  "description": "DON'T BE LAST! 🏁 Watch the full 4K UHD 60fps Tokyo Shibuya Neon Expressway Touring Car Elimination Tournament (Qualifying Heats 1–4 + 10-Car Grand Final)!\n\n24 country touring cars battle through 4 Qualifying Heats with 3 Laser Knockout Checkpoints per race — if you're last at a Checkpoint Gate, you're ELIMINATED! Only the Top 2 from each heat plus the 2 fastest P3 Wildcards advance to the 10-Car Grand Final!\n\n#dontbelast #eliminationrace #carrace #f1 #motorsport #tokyo #3d #4k60fps #satisfying",
  "tags": [
    "dont be last",
    "elimination race",
    "car race",
    "3d car race",
    "touring car championship",
    "TCR",
    "Tokyo",
    "4k 60fps",
    "motorsport simulation",
    "marble formula",
    "satisfying"
  ]
}
EOF

echo ">>> Uploading $VIDEO_OUT/tcr-tokyo-tournament-4k.mp4 to YouTube (@marbleformula)..."
node scripts/upload-youtube.mjs --file "$VIDEO_OUT/tcr-tokyo-tournament-4k.mp4" --round tcr-tokyo-tournament-4k --force

echo "=========================================================="
echo "ALL 4K UHD 'DON'T BE LAST!' TCR TOURNAMENT VIDEOS COMPLETED & UPLOADED AT $(date)!"
echo "=========================================================="
