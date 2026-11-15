#!/usr/bin/env bash
# ==============================================================================
# CareOS — Hostinger Production Build & Packaging Script
# ==============================================================================
set -euo pipefail

echo "==> [1/4] Cleaning previous build artifacts..."
rm -rf apps/web/dist apps/api/dist deployment/hostinger/dist-bundle

echo "==> [2/4] Building React SPA frontend (apps/web)..."
cd apps/web
./node_modules/.bin/vite build
cd ../..

echo "==> [3/4] Transpiling Fastify backend API (apps/api)..."
./apps/api/node_modules/.bin/tsc --project apps/api/tsconfig.json

echo "==> [4/4] Verifying build output..."
if [ ! -f "apps/web/dist/index.html" ]; then
  echo "ERROR: apps/web/dist/index.html was not generated!"
  exit 1
fi

if [ ! -f "apps/api/dist/server.js" ]; then
  echo "ERROR: apps/api/dist/server.js was not generated!"
  exit 1
fi

echo "==> Build successful!"
echo "    Frontend SPA: apps/web/dist/"
echo "    Backend API:  apps/api/dist/server.js"
echo ""
echo "Next step: Follow deployment/hostinger/README.md to upload and activate on Hostinger hPanel."
