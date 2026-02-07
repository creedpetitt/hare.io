#!/usr/bin/env bash
set -euo pipefail

HARE_INSTALL_METHOD="${HARE_INSTALL_METHOD:-npm}"
HARE_NO_ONBOARD="${HARE_NO_ONBOARD:-0}"
HARE_VERSION="${HARE_VERSION:-latest}"

has_cmd() { command -v "$1" >/dev/null 2>&1; }

if ! has_cmd node; then
  echo "Node.js is required (22+). Please install Node.js first." >&2
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js 22+ is required. Current: $(node -v)" >&2
  exit 1
fi

if ! has_cmd npm; then
  echo "npm is required." >&2
  exit 1
fi

if [ "$HARE_INSTALL_METHOD" != "npm" ]; then
  echo "Only npm install is supported in this script (HARE_INSTALL_METHOD=npm)." >&2
  exit 1
fi

if [ "$HARE_VERSION" = "latest" ]; then
  npm install -g hare.io
else
  npm install -g "hare.io@$HARE_VERSION"
fi

if [ "$HARE_NO_ONBOARD" = "1" ]; then
  exit 0
fi

if has_cmd hare; then
  hare onboard
fi
