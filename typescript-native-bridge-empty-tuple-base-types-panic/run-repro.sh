#!/usr/bin/env bash
# Demonstrates: asking the bridge's checker for the BASE TYPES of the empty tuple
# type that comes from an array LITERAL (`[]`) panics natively (Go) and kills the
# process, where the JS-based TypeScript it is built from returns normally. The
# same query on the empty tuple written as a type ANNOTATION answers fine on both.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge, typescript-js = typescript@6.0.3)..."
  pnpm install
  echo
fi

echo "================================================================"
echo " 1. API-level: checker.getBaseTypes on the empty tuple"
echo "================================================================"
echo "--- typescript@6.0.3 (JS-based) - completes ---"
node check.mjs typescript-js
echo
echo "--- typescript-native-bridge - NATIVE PANIC (process killed) ---"
# Runs in its own subprocess; the Go panic can't be caught, so allow non-zero.
node check.mjs typescript || true

echo
echo "================================================================"
echo " 2. Real-world: ESLint + unicorn/no-loop-iterable-mutation"
echo "================================================================"
# The bridge is installed as `typescript`, so the parser's program uses it.
./node_modules/.bin/eslint src.ts || true
