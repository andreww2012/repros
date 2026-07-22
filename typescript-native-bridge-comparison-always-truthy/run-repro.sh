#!/usr/bin/env bash
# Demonstrates: under the bridge, @typescript-eslint/no-unnecessary-condition
# reports `ev >= 9.27` (ev: number) as "always truthy" — a false positive — when
# a type-aware rule set runs. Stock typescript@6.0.3 reports nothing.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge)..."
  pnpm install
  echo
fi

run() { NODE_OPTIONS='--max-old-space-size=6144' ./node_modules/.bin/eslint --no-cache src.ts || true; }

echo "================================================================"
echo " 1. Under the bridge (typescript = tsgo fork)  ->  FALSE POSITIVE"
echo "================================================================"
run

echo
echo "================================================================"
echo " 2. Under stock typescript@6.0.3  ->  clean"
echo "================================================================"
# Swap `typescript` to the stock JS build and reinstall; restore on exit.
cp package.json .package.json.bak
restore() { mv .package.json.bak package.json 2>/dev/null && pnpm install >/dev/null 2>&1 || true; }
trap restore EXIT
node -e "const p=require('./package.json');p.dependencies.typescript='6.0.3';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
pnpm install >/dev/null 2>&1
if run | grep -q 'always truthy'; then
  echo "(unexpected: stock TypeScript also flagged it)"
else
  echo "no problems — stock TypeScript is correct."
fi
