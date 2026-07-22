#!/usr/bin/env bash
# Demonstrates: calling `checker.getImmediateAliasedSymbol` on the synthetic
# `default` alias of a CommonJS module PANICS natively (Go) on the bridge and
# kills the process, where the JS-based TypeScript it is built from does not.
# @typescript-eslint/no-deprecated makes exactly this call, so ESLint dies.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge, typescript-js = typescript@6.0.3)..."
  pnpm install
  echo
fi

echo "================================================================"
echo " 1. API-level: getImmediateAliasedSymbol on a CJS default (each build)"
echo "================================================================"
echo "--- typescript@6.0.3 (JS-based) — completes ---"
node check.mjs typescript-js
echo
echo "--- typescript-native-bridge — NATIVE PANIC (process killed) ---"
# Runs in its own subprocess; the Go panic can't be caught, so allow non-zero.
node check.mjs typescript || true

echo
echo "================================================================"
echo " 2. Real-world: ESLint + @typescript-eslint/no-deprecated"
echo "================================================================"
# The bridge is installed as `typescript`, so the parser's watch program uses it.
./node_modules/.bin/eslint src.ts || true
