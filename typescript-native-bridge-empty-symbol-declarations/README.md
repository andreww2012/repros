# Watch-program transient symbols have `declarations: []` instead of `undefined`

On a **watch/builder program**, `typescript-native-bridge` gives a transient
(mapped-type) property symbol a `declarations` value of **`[]` (an empty
array)**, where the JS-based TypeScript it is built from uses **`undefined`**.
Consumers that treat "no declarations" as nullish — e.g. `symbol.declarations?.[0]`
— break on the empty array, because `[]?.[0]` is `undefined` and the following
member access throws.

The comparison below pins `typescript@6.0.3` as the reference: it is the exact
JS API the bridge is built from (`6.0.3-bridge.1.tsgo.7.0.2`), so the **only**
difference between the two is the checker — JS vs tsgo.

This crashes `@typescript-eslint`'s `no-deprecated` rule (and therefore ESLint)
with `TypeError: Cannot read properties of undefined (reading 'kind')` on
completely ordinary code — any call to a method whose symbol is synthesized by a
mapped type (very common in libraries like [Effect](https://effect.website),
whose service tags expose methods this way).

## Summary

For the callee of a call expression, `@typescript-eslint/eslint-plugin`'s
`no-deprecated` rule reads
([`no-deprecated.ts`, `getCallLikeDeprecation`](https://github.com/typescript-eslint/typescript-eslint/blob/v8.65.0/packages/eslint-plugin/src/rules/no-deprecated.ts)):

```ts
const symbolDeclarationKind = aliasedSymbol?.declarations?.[0].kind;
```

The `?.` guards `declarations` being **nullish**, but not it being an **empty
array**:

| `aliasedSymbol.declarations` | `declarations?.[0].kind` |
| --- | --- |
| `undefined` (JS-based TS) | `undefined` — optional chain short-circuits, safe |
| `[]` (the bridge) | **throws** — `[]?.[0]` is `undefined`, then `.kind` throws |

`src.ts` triggers it with a mapped-type method:

```ts
declare const service: {[K in 'log' | 'info']: (message: string) => void};
service.log('hello');
```

`service.log` is a transient property symbol (`flags = 33554436` =
`Transient | Property`) with no backing declaration node.

## Environment

- `typescript-native-bridge`: **6.0.3-bridge.1.tsgo.7.0.2** (latest at time of writing)
- reference: `typescript@6.0.3` — the latest JS-based (non-Go) release, and the
  API the bridge is built from (installed side by side as `typescript-js`)
- `node`: 22.x
- observed downstream via `@typescript-eslint` 8.65.0 + ESLint 9.39.2

## Reproduce

```sh
bash run-repro.sh        # `pnpm install` on first run, then both steps below
```

It runs two things:

1. **API level** — `node check.mjs` builds a watch program with each TypeScript
   build (set up the way `@typescript-eslint/typescript-estree` does for
   `parserOptions.project`: `createWatchCompilerHost` + `createAbstractBuilder`,
   watchers/timers neutralized), resolves the `service.log` symbol, and prints
   its `declarations` plus the result of the exact `no-deprecated` access.
2. **Real-world** — `eslint src.ts` (also `pnpm lint`) runs ESLint with a
   minimal flat config ([`eslint.config.mjs`](./eslint.config.mjs)) enabling only
   `@typescript-eslint/no-deprecated`. The parser resolves `typescript` to the
   bridge, so it crashes.

## Expected output

Step 1 — API level:

```
typescript (JS-based) (v6.0.3)
  aliasedSymbol.declarations         : undefined
  no-deprecated: declarations?.[0].kind : ok (kind = undefined)

typescript-native-bridge (v6.0.3)
  aliasedSymbol.declarations         : [] (Array, length 0)
  no-deprecated: declarations?.[0].kind : THROWS -> TypeError: Cannot read properties of undefined (reading 'kind')
```

Step 2 — real ESLint crash:

```
Oops! Something went wrong! :(

ESLint: 9.39.2

TypeError: Cannot read properties of undefined (reading 'kind')
Occurred while linting .../src.ts:6
Rule: "@typescript-eslint/no-deprecated"
    at getCallLikeDeprecation (.../@typescript-eslint/eslint-plugin/dist/rules/no-deprecated.js:228:75)
    at getDeprecationReason (.../rules/no-deprecated.js:278:24)
    at checkIdentifier (.../rules/no-deprecated.js:302:28)
```

## It is specific to the watch/builder program

The divergence only appears on a program built via `createWatchProgram` /
`createAbstractBuilder` (what typescript-estree uses). A plain
`ts.createProgram({ rootNames, options })` returns `declarations: undefined` for
the **same symbol on both builds** — so the bug is not in symbol construction in
general, but in how the watch/builder-program checker represents a declaration-less
transient symbol. (Swap `createWatchCompilerHost` for `createProgram` in
`check.mjs` to see both builds agree on `undefined`.)

## Real-world impact

Step 2 above is not contrived: with `@typescript-eslint`'s type-aware
`no-deprecated` rule enabled, linting **any** file that calls a mapped-type
method aborts the whole run. This is common in real code — e.g.
[Effect](https://effect.website) service tags expose their methods via mapped
types, so `logger.log(...)` / `service.method(...)` all trigger it.

Switching the parser from `project` to `projectService` does **not** help — the
crash is in the checker's symbol data, not the program-creation path.

## Fix

Have the watch/builder-program checker return `undefined` (not `[]`) for
`symbol.declarations` when a transient symbol has no declarations, matching the
JS-based checker.

(There is arguably also a latent bug in typescript-eslint — the access should be
`declarations?.[0]?.kind` — but the JS-based checker never produces the empty
array that exposes it, so the divergence is on the bridge side.)
