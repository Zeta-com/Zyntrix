#!/usr/bin/env bash
set -e

# Use pnpm directly without modifying the read-only filesystem
# Corepack is available via npm/npx on Render, but we use corepack exec instead of enable
corepack exec pnpm --version

# Install deps and build only the api-server package
cd artifacts/api-server
pnpm install --no-frozen-lockfile
node ./build.mjs
