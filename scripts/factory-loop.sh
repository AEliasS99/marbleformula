#!/bin/bash
# Nonstop production: season after season until the disk runs low or you stop it.
#
#   nohup scripts/factory-loop.sh 3 > out/factory/loop.log 2>&1 &
#   npm run factory:stop        # = kill $(cat out/factory/loop.pid)
#
# Stopping the loop (SIGTERM/SIGINT/SIGHUP, or Ctrl-C in a terminal) stops the
# factory and every render it started; the season in progress resumes on the
# next start. One loop at a time (out/factory/loop.pid).
#
# What happens after each season (scripts/factory.mjs exit codes):
#   0    done                 → next season
#   1    failed, will retry   → wait out/factory/s<N>/retry-after seconds (10 min, 20, 40, …)
#   3    gave up (FAILED)     → next season; FAILED seasons are skipped from then on
#                               (fix it, then run it by hand: npm run factory -- --season N)
#   4    season busy          → another factory holds it: check again in 10 min
#   2    usage error          → stop the loop
#   130/143 factory stopped by a signal → stop the loop
#   other (crash, kill -9)    → wait 10 min and retry (the factory counts it on its next start)
set -u
cd "$(dirname "$0")/.."
season=${1:-2}
min_free_gb=20
mkdir -p out/factory
pidfile=out/factory/loop.pid

if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
  echo "$(date) another factory loop is running (pid $(cat "$pidfile")); stop it first: kill $(cat "$pidfile")"
  exit 4
fi
echo $$ > "$pidfile"

# Job control: every background job gets its own process group (pgid = its pid),
# so the factory, its npx/node/Chrome children and our naps can be killed as groups.
set -m
child=0

# Stops the current child (the factory, or a nap): SIGTERM to its group, then
# up to 30 s for the factory to kill its renders and release its locks, then SIGKILL.
stop_child() {
  if [ "$child" -ne 0 ] && kill -0 "$child" 2>/dev/null; then
    kill -TERM -- "-$child" 2>/dev/null
    for _ in $(seq 1 30); do
      kill -0 "$child" 2>/dev/null || break
      sleep 1
    done
    kill -KILL -- "-$child" 2>/dev/null
  fi
  child=0
}
cleanup() {
  trap - EXIT TERM INT HUP
  stop_child
  [ "$(cat "$pidfile" 2>/dev/null)" = "$$" ] && rm -f "$pidfile"
}
on_signal() {
  echo "$(date) $1: stopping the factory loop"
  cleanup
  exit "$2"
}
trap cleanup EXIT
trap 'on_signal SIGTERM 143' TERM
trap 'on_signal SIGINT 130' INT
trap 'on_signal SIGHUP 129' HUP

# A sleep that a signal can interrupt (bash runs traps only between commands).
nap() {
  sleep "$1" &
  child=$!
  wait "$child"
  child=0
}

while true; do
  dir="out/factory/s$season"
  free=$(df -g . | tail -1 | awk '{print $4}')
  if [ "$free" -lt "$min_free_gb" ]; then echo "$(date) stopping: ${free} GB free"; exit 0; fi
  if [ -f "$dir/FAILED" ]; then
    echo "$(date) season $season gave up earlier ($dir/FAILED); skipping it"
    season=$((season + 1))
    continue
  fi
  echo "$(date) season $season"
  node scripts/factory.mjs --season "$season" &
  child=$!
  wait "$child"
  rc=$?
  child=0
  case $rc in
    0) season=$((season + 1)) ;;
    1)
      delay=$(cat "$dir/retry-after" 2>/dev/null || echo 600)
      echo "$(date) season $season failed; retrying in $((delay / 60)) min"
      nap "$delay"
      ;;
    2) echo "$(date) usage error; stopping the loop"; exit 2 ;;
    3)
      echo "$(date) season $season GAVE UP: $(head -1 "$dir/FAILED" 2>/dev/null); moving on"
      season=$((season + 1))
      ;;
    4) echo "$(date) season $season is busy (another factory); checking again in 10 min"; nap 600 ;;
    129 | 130 | 143) echo "$(date) the factory was stopped (exit $rc); stopping the loop"; exit 0 ;;
    *) echo "$(date) the factory died (exit $rc); retrying in 10 min"; nap 600 ;;
  esac
done
