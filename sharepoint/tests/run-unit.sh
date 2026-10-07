#!/usr/bin/env bash
# Bundles and runs the data-layer tests (no SharePoint tenant needed). Usage: ./run-unit.sh
set -euo pipefail
cd "$(dirname "$0")"
OUT="$(mktemp -d)"
ESBUILD="${ESBUILD:-../../node_modules/.bin/esbuild}"
"$ESBUILD" core.test.ts --bundle --platform=node --format=esm --outfile="$OUT/core.test.mjs" --log-level=warning --external:./mockSharePoint.mjs
cp mockSharePoint.mjs "$OUT/"; mkdir -p "$OUT/fixtures"; cp fixtures/*.json "$OUT/fixtures/"
node --test "$OUT/core.test.mjs"
