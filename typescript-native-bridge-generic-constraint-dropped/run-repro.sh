#!/usr/bin/env bash
# Demonstrates: under typescript-native-bridge, a type parameter's constraint is
# not resolved, so `@typescript-eslint/no-base-to-string`,
# `@typescript-eslint/restrict-template-expressions` and
# `unicorn/no-unsafe-property-key` all false-positive on generic code. Stock
# typescript@6.0.3 reports nothing.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge)..."
  pnpm install
  echo
fi

run() { NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/eslint --no-cache src.ts || true; }

echo "================================================================"
echo " 1. Under the bridge (typescript = tsgo fork)  ->  3 FALSE POSITIVES"
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
if run | grep -qE 'no-base-to-string|restrict-template-expressions|no-unsafe-property-key'; then
  echo "(unexpected: stock TypeScript also flagged something)"
else
  echo "no problems — stock TypeScript is correct."
fi
