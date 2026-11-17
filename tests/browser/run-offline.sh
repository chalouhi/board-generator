#!/bin/sh
# Runs the browser tests in the official Playwright container with no network
# at all (docker --network none). Nothing is installed on the host.
# Usage: tests/browser/run-offline.sh <folder holding node_modules/playwright> [screenshots folder]
# Keep the image version equal to the playwright package version.
set -e
REPO=$(cd "$(dirname "$0")/../.." && pwd)
MODS=$1; SHOTS=${2:-}
exec docker run --rm --network none --ipc=host \
  -v "$REPO":/repo:ro -v "$MODS":/pw/node_modules:ro ${SHOTS:+-v "$SHOTS":/shots} \
  -e NODE_PATH=/pw/node_modules ${SHOTS:+-e SHOTS=/shots} -w /repo \
  mcr.microsoft.com/playwright:v1.49.1-noble sh -c 'node --test tests/browser/page.test.js tests/browser/card.test.js'
