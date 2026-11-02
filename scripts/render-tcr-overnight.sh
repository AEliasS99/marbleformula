#!/usr/bin/env zsh
# Render/preparation only. YouTube publication is a separate, manual step.
set -euo pipefail
cd "${0:A:h}/.."
node scripts/factory.mjs --shared-lock -- node scripts/tcr-pipeline.mjs "$@"
