#!/usr/bin/env bash
# Demonstrates: asking the bridge's checker for the type of an EMPTY ARRAY LITERAL
# that is contextually typed as the empty tuple (`const x: [] = []`) panics
# natively (Go) and kills the process — where the JS-based TypeScript it is built
# from returns normally. Every type-aware rule that reads such a type dies with it.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge, typescript-js = typescript@6.0.3)..."
  pnpm install
  echo
fi

echo "================================================================"
echo " 1. API-level: checker.getTypeAtLocation on `[]` (each build)"
echo "================================================================"
echo "--- typescript@6.0.3 (JS-based) — completes ---"
node check.mjs typescript-js
echo
echo "--- typescript-native-bridge — NATIVE PANIC (process killed) ---"
# Runs in its own subprocess; the Go panic can't be caught, so allow non-zero.
node check.mjs typescript || true

echo
echo "================================================================"
echo " 2. Real-world: ESLint + @typescript-eslint/no-unsafe-return"
echo "================================================================"
# The bridge is installed as `typescript`, so the parser's watch program uses it.
./node_modules/.bin/eslint src.ts || true
