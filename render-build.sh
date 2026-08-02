#!/usr/bin/env bash
set -e

# Enable corepack (ships with Node 16+, no install needed)
corepack enable

# Install deps and build only the api-server package
cd artifacts/api-server
pnpm install --no-frozen-lockfile
node ./build.mjs
