# Empty-string literal type has `value: undefined` instead of `""`

On the checker `@typescript-eslint` uses, `typescript-native-bridge` gives the
**empty-string literal type** (`''`) a `value` of **`undefined`**, where the
JS-based TypeScript it is built from gives **`""`**. Every other string literal
type (`'nonEmpty'`, …) keeps its value in both builds — only the empty string
loses it. The type's `flags` and `isStringLiteral()` are identical in both
builds; just the `.value` payload is dropped.

The comparison below pins `typescript@6.0.3` as the reference: it is the exact
JS API the bridge is built from (`6.0.3-bridge.1.tsgo.7.0.2`), so the **only**
difference between the two is the checker — JS vs tsgo.

This crashes `@typescript-eslint`'s `unbound-method` rule (and therefore ESLint)
with `TypeError: Cannot read properties of undefined (reading 'toString')` on
completely ordinary code — any computed property read with an empty-string key,
e.g. `foo['']`.

## Summary

For a computed member expression, `@typescript-eslint/eslint-plugin`'s
`unbound-method` rule reads
([`unbound-method.ts`, `getAccessedPropertyNames`](https://github.com/typescript-eslint/typescript-eslint/blob/v8.65.0/packages/eslint-plugin/src/rules/unbound-method.ts)):

```ts
return tsutils
  .unionConstituents(services.getTypeAtLocation(node.property))
  .flatMap(part =>
    part.isStringLiteral() || part.isNumberLiteral()
      ? [part.value.toString()]
      : [],
  );
```

A string literal type is assumed to have a string `value`. That holds for every
literal except, on the bridge, the empty string:

| key expression | `type.value` (JS-based TS) | `type.value` (the bridge) |
| --- | --- | --- |
| `foo['nonEmpty']` | `"nonEmpty"` | `"nonEmpty"` |
| `foo['']` | `""` | **`undefined`** → `.value.toString()` throws |

`src.ts` triggers it with an empty-string key:

```ts
declare const foo: Record<string, () => void>;
const handler = foo[''];
```

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
   watchers/timers neutralized), gets the type of the `''` key in `foo['']`,
   and prints its `.flags` / `.isStringLiteral()` / `.value` plus the result of
   the exact `unbound-method` access `part.value.toString()`.
2. **Real-world** — `eslint src.ts` (also `pnpm lint`) runs ESLint with a
   minimal flat config ([`eslint.config.mjs`](./eslint.config.mjs)) enabling only
   `@typescript-eslint/unbound-method`. The parser resolves `typescript` to the
   bridge, so it crashes.

## Expected output

Step 1 — API level:

```
WATCH/builder program (what parserOptions.project uses):

typescript (JS-based)    (v6.0.3)
  type.flags               : 1024
  type.isStringLiteral()   : true
  type.value               : "" (typeof string)
  unbound-method: value.toString() : ok -> ""

typescript-native-bridge (v6.0.3)
  type.flags               : 1024
  type.isStringLiteral()   : true
  type.value               : undefined (typeof undefined)
  unbound-method: value.toString() : THROWS -> TypeError: Cannot read properties of undefined (reading 'toString')
```

Step 2 — real ESLint crash:

```
Oops! Something went wrong! :(

ESLint: 9.39.2

TypeError: Cannot read properties of undefined (reading 'toString')
Occurred while linting .../src.ts:10
Rule: "@typescript-eslint/unbound-method"
    at .../@typescript-eslint/eslint-plugin/dist/rules/unbound-method.js:177:35
    at Array.flatMap (<anonymous>)
    at getAccessedPropertyNames (.../rules/unbound-method.js:175:18)
    at MemberExpression (.../rules/unbound-method.js:209:39)
```

## Which program kinds are affected

The divergence appears on the two program kinds `@typescript-eslint` actually
builds:

- `parserOptions.project` → watch/builder program (`createWatchProgram` /
  `createAbstractBuilder`) — **wrong** (`value: undefined`).
- `parserOptions.projectService: true` → project-service program — **also
  wrong** (verified: same crash).

A plain `ts.createProgram({ rootNames, options })` on the bridge returns the
correct `value: ""` for the **same** `foo['']` — `check.mjs` prints this as
a contrast at the end. So switching `project` ↔ `projectService` does **not**
help; the value is dropped only on the incremental/service checker paths, which
are the ones tooling uses.

## Real-world impact

Step 2 above is not contrived: with `@typescript-eslint`'s type-aware
`unbound-method` rule enabled, linting **any** file that reads a property with an
empty-string key aborts the whole run. `obj['']` shows up in real code — e.g.
using `''` as a "default"/catch-all key in a lookup table (which is exactly how
this surfaced downstream).

## Fix

Have the incremental/service checker return the literal `""` (not `undefined`)
for the `value` of the empty-string literal type, matching both the JS-based
checker and the bridge's own `ts.createProgram` path.
