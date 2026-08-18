#!/usr/bin/env bash
set -e

# Set Corepack to use user cache directory instead of modifying system files
export COREPACK_HOME="$HOME/.corepack"

# Activate pnpm using Corepack (reads packageManager from package.json)
corepack use pnpm

# Install deps and build only the api-server package
cd artifacts/api-server
pnpm install --no-frozen-lockfile
node ./build.mjs
