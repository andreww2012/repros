#!/usr/bin/env bash
# Demonstrates: opened through the TypeScript project service, an EMPTY file gets a
# SourceFile with pos/end of -1 on the bridge, where the JS-based TypeScript it is
# built from reports 0/0. -1 is TypeScript's "synthesized node" marker, so
# `getStart()` fails a Debug assertion and @typescript-eslint cannot convert the
# file: ESLint reports a parsing error and silently lints nothing in it.
set -eu
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "installing (typescript = bridge, typescript-js = typescript@6.0.3)..."
  pnpm install
  echo
fi

echo "================================================================"
echo " 1. API-level: SourceFile position via the project service"
echo "================================================================"
echo "--- typescript@6.0.3 (JS-based) ---"
node check.mjs typescript-js
echo
echo "--- typescript-native-bridge ---"
node check.mjs typescript

echo
echo "================================================================"
echo " 2. Real-world: ESLint with parserOptions.projectService"
echo "================================================================"
# empty.ts and the two script-less SFCs fail to parse; the controls lint fine.
./node_modules/.bin/eslint . || true
