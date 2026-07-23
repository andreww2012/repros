#!/usr/bin/env bash
# Demonstrates: under typescript-native-bridge, a `false` boolean-literal type's
# `intrinsicName` is `null` instead of `'false'`, defeating a guard in
# `@typescript-eslint/prefer-optional-chain`, which then reports `x && x[k]` where
# `x: false | object`. Stock typescript@6.0.3 reports nothing.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge)..."
  pnpm install
  echo
fi

run() { NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/eslint --no-cache src.ts || true; }

echo "================================================================"
echo " 1. Under the bridge (typescript = tsgo fork)  ->  REPORTS"
echo "================================================================"
run

echo
echo "================================================================"
echo " 2. Under stock typescript@6.0.3  ->  clean"
echo "================================================================"
cp package.json .package.json.bak
restore() { mv .package.json.bak package.json 2>/dev/null && pnpm install >/dev/null 2>&1 || true; }
trap restore EXIT
node -e "const p=require('./package.json');p.dependencies.typescript='6.0.3';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
pnpm install >/dev/null 2>&1
if run | grep -q 'prefer-optional-chain'; then
  echo "(unexpected: stock TypeScript also flagged it)"
else
  echo "no problems under stock TypeScript."
fi
