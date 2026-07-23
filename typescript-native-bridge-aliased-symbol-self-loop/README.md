# `getImmediateAliasedSymbol` returns an alias **to itself** on the ProjectService path

On the bridge's **tsserver ProjectService** checker path — the one
`@typescript-eslint`'s `parserOptions.projectService` uses — calling
`checker.getImmediateAliasedSymbol` on the alias created by a `default`
re-export from a **wildcard ambient module** returns **the same alias symbol**
instead of its target (or `undefined`).

`@typescript-eslint` rules walk alias chains by calling `getImmediateAliasedSymbol`
repeatedly until they reach a non-alias symbol or `undefined`. A symbol that
aliases itself makes that walk non-terminating:

- `@typescript-eslint/consistent-type-exports` walks it by **recursion**
  (`isSymbolTypeBased`) → `RangeError: Maximum call stack size exceeded`.
- `@typescript-eslint/no-deprecated` walks it with a **`while` loop**
  (`searchForDeprecationInAliasesChain`) → it never crashes, it **hangs forever**
  while allocating on every bridge round-trip (runaway memory).

The classic **Program** path (`parserOptions.project`) resolves the exact same
alias chain correctly, on both stock TypeScript and the bridge — so this is
specific to the ProjectService checker adapter.

## Summary

`src.ts` re-exports the `default` of a wildcard ambient module (`*.foo`,
declared in `shim.d.ts` — the generic form of the `declare module '*.svg'` /
`'*.css'` / `'*.graphql'` / `'*.vue'` shims that bundler projects ship):

```ts
// shim.d.ts
declare module '*.foo' {
  const bar: { readonly label: string };
  export default bar;
}

// src.ts
export { default as Baz } from './thing.foo';
```

The `Baz` re-export is an alias whose chain is `Baz → default → bar`.
The middle `default` symbol is a synthetic alias for the ambient module's default
export. On the ProjectService path the bridge fails to resolve that `default`
alias to its target and falls back to **returning it unchanged**:

```js
// typescript-native-bridge/lib/typescript.js  — tsgoChecker adapter
getImmediateAliasedSymbol(symbol) {
  ensureProject();
  if (!symbol) return symbol;
  const SF = sync.SymbolFlags;
  if (!(symbol.flags & SF.Alias)) return refineNavSymbol(symbol);
  try {
    const target2 = rpc().getImmediateAliasedSymbol(symbol);
    if (target2) return refineNavSymbol(target2);   // rpc() resolves nothing here
  } catch {}
  const target = symbol.target;
  return refineNavSymbol(target && target !== symbol ? target : symbol); // ← returns `symbol` itself
}
```

When the native RPC returns nothing and `symbol.target` is absent, it returns the
input `symbol`. Stock TypeScript returns `undefined` in this situation, which
terminates every alias-walking loop.

| Checker path | stock `typescript@6.0.3` | `typescript-native-bridge` |
| --- | --- | --- |
| classic Program (`parserOptions.project`) | `Baz → default → bar` → terminates | `Baz → default → bar` → terminates |
| tsserver ProjectService (`parserOptions.projectService`) | terminates (baseline) | `getImmediateAliasedSymbol(default) === default` → **infinite loop** |

## Environment

- `typescript-native-bridge`: **6.0.3-bridge.6.tsgo.7.0.2**
- reference: `typescript@6.0.3` — the JS-based release the bridge is built from,
  installed side by side as `typescript-js`
- `node`: 22.x
- observed downstream via `typescript-eslint` 8.65.0 + ESLint 9.39.2

Both parts are required: the module must be a **wildcard ambient** module
(`declare module '*.…'`) and the re-export must go through its **`default`**. A
named re-export, or a default re-export from a concrete (non-wildcard) module,
resolves normally.

## Reproduce

```sh
bash run-repro.sh        # `pnpm install` on first run, then both steps below
```

1. **API level** — `node check.mjs <mode>` resolves the `Baz` re-export symbol
   and replays the alias walk that `@typescript-eslint` rules perform (capped, so
   it never actually hangs):
   - `node check.mjs program typescript-js` — stock TS, Program path → resolves.
   - `node check.mjs program typescript` — bridge, Program path → resolves.
   - `node check.mjs service` — bridge, ProjectService path → **self-return**.
2. **Real-world** — `eslint src.ts` (also `pnpm lint`) with a minimal flat config
   ([`eslint.config.mjs`](./eslint.config.mjs)) enabling only
   `@typescript-eslint/consistent-type-exports` under
   `parserOptions.projectService`.

## Expected output

Step 1 — API level:

```
[Program path] stock typescript (JS-based) (v6.0.3)
  alias chain              : Baz -> default -> bar
  resolved to a non-alias symbol `bar`
  => terminates cleanly ✅

[Program path] typescript-native-bridge (v6.0.3)
  alias chain              : Baz -> default -> bar
  resolved to a non-alias symbol `bar`
  => terminates cleanly ✅

[ProjectService path] typescript-native-bridge (v6.0.3)
  alias chain              : Baz -> default
  getImmediateAliasedSymbol(`default`) returned the SAME symbol
  => NON-TERMINATING: a rule walking this chain loops forever ❌
```

Step 2 — real ESLint run:

```
RangeError: Maximum call stack size exceeded
Occurred while linting .../src.ts
Rule: "@typescript-eslint/consistent-type-exports"
    at Object.isUnknownSymbol (.../typescript-native-bridge/lib/typescript.js)
    at isSymbolTypeBased (.../@typescript-eslint/eslint-plugin/dist/rules/consistent-type-exports.js:94:19)
    at isSymbolTypeBased (.../consistent-type-exports.js:94:19)
    ... (repeats until the stack overflows)
```

## Real-world impact

This surfaces when linting any project that uses `parserOptions.projectService`
(the modern default) and has barrel files that re-export the `default` of a
bundler-shimmed module — e.g. `export { default as Icon } from './icon.svg'`.
`consistent-type-exports` aborts the whole run with a stack overflow;
`no-deprecated` instead hangs and consumes memory without bound. Because the
crash is thrown from inside the checker, there is no per-file recovery — a single
affected file blocks linting.

## Fix

`getImmediateAliasedSymbol` should return `undefined` for an alias whose
immediate target cannot be resolved, instead of returning the input `symbol`
unchanged — matching the JS-based checker, and guaranteeing that any alias-chain
walk terminates. (The adapter's own `getSymbolFlags` already guards this exact
hazard with a `seen` set and a `target === current` break when it follows the
alias chain; `getImmediateAliasedSymbol` needs the equivalent: never hand back a
symbol that aliases itself.)
