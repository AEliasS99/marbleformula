#!/bin/bash
# Nonstop production: season after season until the disk runs low or you stop it.
#   nohup scripts/factory-loop.sh 2 > out/factory/loop.log 2>&1 &
#   (stop: pkill -f factory-loop.sh; the season in progress resumes on the next start)
cd "$(dirname "$0")/.."
season=${1:-2}
while true; do
  free=$(df -g . | tail -1 | awk '{print $4}')
  if [ "$free" -lt 20 ]; then echo "$(date) stopping: ${free} GB free"; exit 0; fi
  echo "$(date) season $season"
  node scripts/factory.mjs --season "$season" || { echo "$(date) season $season failed; retrying in 10 min"; sleep 600; continue; }
  season=$((season + 1))
done
