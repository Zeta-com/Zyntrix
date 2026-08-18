#!/usr/bin/env bash
set -e

# Install pnpm using Corepack without modifying the read-only filesystem
# Corepack resolves the packageManager field from package.json to activate pnpm
npm install -g corepack
corepack use pnpm@latest

# Install deps and build only the api-server package
cd artifacts/api-server
pnpm install --no-frozen-lockfile
node ./build.mjs
