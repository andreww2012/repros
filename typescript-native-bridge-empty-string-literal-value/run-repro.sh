#!/usr/bin/env bash
# Demonstrates: on a WATCH/builder program, `typescript-native-bridge` gives the
# empty-string literal type (`''`) a `value` of `undefined`, where the JS-based
# TypeScript it is built from gives `""`. That dropped value crashes
# `@typescript-eslint`'s `unbound-method` rule at `part.value.toString()`.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge, typescript-js = typescript@6.0.3)..."
  pnpm install
  echo
fi

echo "================================================================"
echo " 1. API-level: empty-string literal type .value (bridge vs JS)"
echo "================================================================"
node check.mjs

echo "================================================================"
echo " 2. Real-world: ESLint + @typescript-eslint/unbound-method crashes"
echo "================================================================"
# The bridge is installed as `typescript`, so the parser's watch program uses it.
# ESLint exits non-zero on the internal crash; keep going so the script succeeds.
./node_modules/.bin/eslint src.ts || true
