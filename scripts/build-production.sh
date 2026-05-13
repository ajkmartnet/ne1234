#!/usr/bin/env bash
# Production build script — runs during Replit deployment postBuild phase.
# Builds shared libs first, then API server, then all frontend apps.
set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AJKMart Production Build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "▶  Step 1/4 — Building shared libraries..."
pnpm --filter @workspace/db \
     --filter @workspace/api-zod \
     --filter @workspace/phone-utils \
     --filter @workspace/auth-utils \
     --filter @workspace/integrations-gemini-ai \
     run build

echo ""
echo "▶  Step 2/4 — Building API server..."
pnpm --filter @workspace/api-server run build

echo ""
echo "▶  Step 3/4 — Building frontend apps..."
pnpm --filter @workspace/admin \
     --filter @workspace/vendor-app \
     --filter @workspace/rider-app \
     run build

echo ""
echo "▶  Step 4/4 — Pruning dev dependencies..."
pnpm store prune

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅  Build complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
