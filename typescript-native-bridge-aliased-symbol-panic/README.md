# Native panic in `getImmediateAliasedSymbol` on a CommonJS `default` alias

Calling `checker.getImmediateAliasedSymbol` on the **synthetic `default` export
of a CommonJS module** panics **natively (Go)** on the bridge and kills the whole
process, where the JS-based TypeScript it is built from returns normally:

```
panic: Unexpected nil in getImmediateAliasedSymbol
	checker.(*Checker).getImmediateAliasedSymbol(...)    internal/checker/checker.go:2148
	checker.(*Checker).GetImmediateAliasedSymbol(...)    internal/checker/exports.go:98
	api.(*Session).handleGetImmediateAliasedSymbol(...)  internal/api/session.go:5623
```

A native panic can't be caught by JS `try/catch` — it aborts the process
(`Abort trap: 6` / exit 134). `@typescript-eslint/no-deprecated` makes exactly
this call while walking alias chains, so ESLint dies on ordinary code.

## Summary

`src.ts` imports a CommonJS module (`dep.cts`, `export = {}`) and reads its
esModuleInterop-synthesized `default`:

```ts
import * as m from './dep.cjs';
m.default;
```

`no-deprecated` walks the alias chain of `m.default`
([`no-deprecated.ts`, `searchForDeprecationInAliasesChain`](https://github.com/typescript-eslint/typescript-eslint/blob/v8.65.0/packages/eslint-plugin/src/rules/no-deprecated.ts)):

```ts
const immediateAliasedSymbol =
  symbol.getDeclarations() && checker.getImmediateAliasedSymbol(symbol);
```

Two things combine, both bridge-specific:

1. The `default` alias symbol has **`getDeclarations()` → `[]`** (an empty
   array) instead of `undefined` — the same empty-`declarations` divergence seen
   in the sibling repro. An empty array is **truthy**, so the guard passes and
   the second operand runs (on the JS-based checker it is `undefined`, so `&&`
   short-circuits and nothing else happens).
2. `checker.getImmediateAliasedSymbol` on this targetless alias then **panics
   natively** instead of returning `undefined`.

| | `getDeclarations()` | `getImmediateAliasedSymbol` |
| --- | --- | --- |
| typescript (JS-based) | resolves no alias symbol here — nothing to call | not called → **safe** |
| the bridge | `[]` (truthy) → guard passes | **native panic**, process dies |

## Environment

- `typescript-native-bridge`: **6.0.3-bridge.1.tsgo.7.0.2** (latest at time of writing)
- reference: `typescript@6.0.3` — the latest JS-based (non-Go) release, and the
  API the bridge is built from (installed side by side as `typescript-js`)
- `node`: 22.x
- observed downstream via `@typescript-eslint` 8.65.0 + ESLint 9.39.2

Both the CommonJS module (`export =`, resolved via a `.cjs`/`.cts` file) and the
`m.default` read are required: a plain ESM `export default`, or not touching
`.default`, does not trigger it.

## Reproduce

```sh
bash run-repro.sh        # `pnpm install` on first run, then both steps below
```

1. **API level** — `node check.mjs <build>` builds a watch program (the way
   `@typescript-eslint/typescript-estree` does for `parserOptions.project`),
   resolves the `default` symbol, and replays no-deprecated's
   `getDeclarations() && getImmediateAliasedSymbol(...)`. Run once per build in
   its own subprocess (a native panic kills the process).
2. **Real-world** — `eslint src.ts` (also `pnpm lint`) with a minimal flat config
   ([`eslint.config.mjs`](./eslint.config.mjs)) enabling only
   `@typescript-eslint/no-deprecated`. The parser resolves `typescript` to the
   bridge, so it panics.

## Expected output

Step 1 — API level:

```
typescript (JS-based) (v6.0.3)
  symbol at `m.default`   : undefined (no alias resolved -> no panic)
  DONE (no panic)

typescript-native-bridge (v6.0.3)
  symbol name              : default
  is alias                 : true
  getDeclarations()        : [] (Array, length 0)
  guard `getDeclarations() && …` passes : true
panic: Unexpected nil in getImmediateAliasedSymbol
  ... handleGetImmediateAliasedSymbol ...
Abort trap: 6
```

Step 2 — real ESLint run dies with the same Go panic (no ESLint error message —
the process is aborted before ESLint can report anything).

## Real-world impact

This surfaced while linting a real project: any file that reads `.default` off a
dynamically- or namespace-imported CommonJS module — e.g.
`(await import('some-cjs-eslint-plugin')).default` — aborts the whole lint run
under `no-deprecated`. Because it's a native panic there is no per-file recovery;
one affected file blocks linting the entire project.

## Fix

`getImmediateAliasedSymbol` should return `nil`/`undefined` for an alias whose
immediate target cannot be resolved, instead of dereferencing the nil and
panicking — matching the JS-based checker. (Returning `undefined` rather than an
empty array from `getDeclarations()` for such synthetic symbols would also stop
tooling from reaching this call in the first place.)
