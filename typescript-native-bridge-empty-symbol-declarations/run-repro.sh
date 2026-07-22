#!/usr/bin/env bash
# Demonstrates: on a WATCH/builder program, `typescript-native-bridge` gives a
# transient (mapped-type) property symbol `declarations: []` (empty array),
# where the JS-based TypeScript it is built from gives `declarations: undefined`.
# The empty array crashes `@typescript-eslint`'s `no-deprecated` rule at
# `aliasedSymbol?.declarations?.[0].kind`.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge, typescript-js = typescript@6.0.3)..."
  pnpm install
  echo
fi

echo "================================================================"
echo " 1. API-level: symbol.declarations shape (bridge vs JS-based TS)"
echo "================================================================"
node check.mjs

echo "================================================================"
echo " 2. Real-world: ESLint + @typescript-eslint/no-deprecated crashes"
echo "================================================================"
# The bridge is installed as `typescript`, so the parser's watch program uses it.
# ESLint exits non-zero on the internal crash; keep going so the script succeeds.
./node_modules/.bin/eslint src.ts || true
