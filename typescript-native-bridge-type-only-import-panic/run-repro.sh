#!/usr/bin/env bash
# Demonstrates: asking the bridge's checker for the type of a TYPE-ONLY IMPORT
# CLAUSE (`import type {X} from '...'`) panics natively (Go) and kills the
# process. The JS-based TypeScript it is built from hits the same nil symbol but
# throws a catchable TypeError, so a `try/catch` is enough there and useless here.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge, typescript-js = typescript@6.0.3)..."
  pnpm install
  echo
fi

echo "================================================================"
echo " checker.getTypeAtLocation on a type-only import clause"
echo "================================================================"
echo "--- typescript@6.0.3 (JS-based) — throws, catchable ---"
node check.mjs typescript-js
echo
echo "--- typescript-native-bridge — NATIVE PANIC (process killed) ---"
# Runs in its own subprocess; the Go panic can't be caught, so allow non-zero.
node check.mjs typescript || true
