# `false` boolean-literal's `.value` corrupts to `true` under load (false "always truthy")

Under the bridge, `@typescript-eslint/no-unnecessary-condition` reports an
ordinary numeric comparison as **"always truthy"**:

```ts
declare const ev: number;
export const x = ev >= 9.27 ? 1 : 2;   // <- flagged "Unnecessary conditional, value is always truthy"
```

`ev >= 9.27` is `false` whenever `ev < 9.27`, so the condition is **not** always
truthy. Stock `typescript@6.0.3` reports nothing here; the bridge reports a false
positive.

## Root cause

The condition type is a normal `boolean` — a union of the two boolean-literal
types `false | true`, each carrying a `.value` (`false` / `true`). That part is
correct on the bridge (`typeToString` = `boolean`, flags = `Boolean | Union`,
two constituents).

The bug is the **`.value` of the `false` literal**. `no-unnecessary-condition`
calls `isPossiblyFalsy`, which drops "always-truthy" literals before checking for
a falsy constituent, using `getValueOfLiteralType(type)` — i.e. `type.value`
([`truthinessUtils.ts`](https://github.com/typescript-eslint/typescript-eslint/blob/v8.65.0/packages/eslint-plugin/src/util/truthinessUtils.ts)):

```ts
const isTruthyLiteral = (type) =>
  isTrueLiteralType(type) || (type.isLiteral() && !!getValueOfLiteralType(type));
// isPossiblyFalsy: unionConstituents(type).filter(t => !isTruthyLiteral(t)).some(PossiblyFalsy)
```

Logging `type.value` of each boolean constituent that the rule sees:

| | `false` constituent | `true` constituent | `isPossiblyFalsy` |
| --- | --- | --- | --- |
| stock TypeScript | `value: false` | `value: true` | `true` → no report |
| the bridge (under load) | **`value: true`** ✗ | `value: true` | `false` → **reports** |

So the bridge hands back the **`false` literal type carrying `true`'s value**.
`isTruthyLiteral(false)` then wrongly returns `true`, that constituent is filtered
out as "truthy", nothing falsy remains, and `isPossiblyFalsy` returns `false` — a
false "always truthy". It is a data-corruption of the literal type's payload, not
a flag/kind problem (the flags are correct).

## It takes a type-aware rule *set*, and it's threshold-like

A single rule (`no-unnecessary-condition` alone) does **not** trigger it — the
`false` literal's `.value` is correct (`false`) then. The corruption only appears
once enough type-aware rules query types in the same pass:

- with the whole `strictTypeChecked` preset it reproduces reliably (this repro);
- removing rules eventually drops it below a threshold where it stops;
- right at the boundary it flips run-to-run.

This is the "non-determinism" originally observed at whole-run scale (a full
config is far past the threshold and reliable; a bare run is below it): the
`false` literal's `.value` is corrupted only after a certain amount of concurrent
type resolution has happened in the process. It looks like a caching / type-
interning race in the bridge that lets the `false` literal's payload get
overwritten with the `true` literal's.

## Environment

- `typescript-native-bridge`: **6.0.3-bridge.1.tsgo.7.0.2** (installed as `typescript`)
- reference: `typescript@6.0.3` — the latest JS-based (non-Go) release, and the
  API the bridge is built from
- `@typescript-eslint` 8.65.0 + ESLint 9.39.2, `node` 22.x

## Reproduce

```sh
bash run-repro.sh        # `pnpm install` on first run, then both steps below
```

1. **Under the bridge** — `eslint src.ts` reports
   `Unnecessary conditional, value is always truthy` (a false positive).
2. **Under stock TypeScript** — the script swaps `typescript` to `6.0.3`,
   reinstalls, and re-lints the same file with the same config: **no problems**.
   (It restores the bridge afterwards.)

## Fix

The bridge must not let a boolean-literal type's `.value` be overwritten — the
`false` literal must always report `value: false`. (More broadly: a literal
type's payload must be stable and not clobbered by concurrent type resolution.)
With `false.value === false`, `isPossiblyFalsy` keeps the falsy constituent and
`no-unnecessary-condition` does not report.
