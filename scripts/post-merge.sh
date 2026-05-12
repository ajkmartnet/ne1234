#!/bin/bash
set -e

echo "[post-merge] Installing dependencies..."
pnpm install --no-frozen-lockfile

echo "[post-merge] Done."
