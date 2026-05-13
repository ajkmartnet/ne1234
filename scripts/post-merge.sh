#!/usr/bin/env bash
# Runs automatically after a task-agent merge in Replit.
# Also safe to run manually after git pull on any environment.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[post-merge] Installing dependencies (race-condition-safe)..."

# flock prevents concurrent pnpm installs when multiple workflows start at once.
# Falls back to plain install on macOS / systems without util-linux flock.
LOCKFILE="/tmp/ajkmart-pnpm-install.lock"
if command -v flock &>/dev/null; then
  flock -x "$LOCKFILE" pnpm install --no-frozen-lockfile
else
  pnpm install --no-frozen-lockfile
fi

echo "[post-merge] Done."
