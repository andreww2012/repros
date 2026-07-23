#!/usr/bin/env bash
# Demonstrates: on the tsserver ProjectService checker path (the one ESLint's
# `parserOptions.projectService` uses), the bridge's `getImmediateAliasedSymbol`
# returns a re-export alias TO ITSELF instead of its target. Any lint rule that
# walks the alias chain then loops forever. The classic Program path resolves the
# same chain correctly, on both stock TypeScript and the bridge.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge, typescript-js = stock typescript@6.0.3)..."
  pnpm install
  echo
fi

echo "================================================================"
echo " 1. API level: walk the alias chain of the \`Baz\` re-export"
echo "================================================================"
echo "--- Program path / stock typescript@6.0.3 — resolves ---"
node check.mjs program typescript-js
echo
echo "--- Program path / typescript-native-bridge — resolves (no bug here) ---"
node check.mjs program typescript
echo
echo "--- ProjectService path / typescript-native-bridge — SELF-RETURN ---"
node check.mjs service

echo
echo "================================================================"
echo " 2. Real-world: ESLint + @typescript-eslint/consistent-type-exports"
echo "    (parserOptions.projectService — the affected path)"
echo "================================================================"
# The bridge is installed as `typescript`, so the parser's ProjectService uses
# it. The rule recurses along the self-returning alias and overflows the stack.
./node_modules/.bin/eslint src.ts || true
