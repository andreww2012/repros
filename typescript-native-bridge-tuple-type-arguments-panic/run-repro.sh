#!/usr/bin/env bash
# Demonstrates: asking the bridge's checker for the type arguments of a tuple
# (`checker.getTypeArguments` on a `[T]` constituent of a `[T] | []` union)
# PANICS natively (Go) and kills the process — where the JS-based TypeScript it
# is built from returns normally. @typescript-eslint/no-unsafe-argument makes
# exactly this request, so ESLint dies on ordinary code.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge, typescript-js = typescript@6.0.3)..."
  pnpm install
  echo
fi

echo "================================================================"
echo " 1. API-level: checker.getTypeArguments on a tuple (each build)"
echo "================================================================"
echo "--- typescript@6.0.3 (JS-based) — completes ---"
node check.mjs typescript-js
echo
echo "--- typescript-native-bridge — NATIVE PANIC (process killed) ---"
# Runs in its own subprocess; the Go panic can't be caught, so allow non-zero.
node check.mjs typescript || true

echo
echo "================================================================"
echo " 2. Real-world: ESLint + @typescript-eslint/no-unsafe-argument"
echo "================================================================"
# The bridge is installed as `typescript`, so the parser's watch program uses it.
./node_modules/.bin/eslint src.ts || true
