# `false` boolean-literal's `intrinsicName` is `null`, breaking `prefer-optional-chain`

Under the bridge, a `false` boolean-literal type reports its `intrinsicName` as
`null` instead of `'false'`. This defeats a guard in
`@typescript-eslint/prefer-optional-chain`, which then reports `x && x[k]` as
convertible to `x?.[k]` when `x: false | object`:

```ts
declare const raw: boolean | Partial<Record<'a' | 'b', boolean>>;
const foo = raw === true ? false : raw;      // false | Partial<Record<...>>
const key = 'a' as const;
foo && foo[key as keyof typeof foo];  // <- reported on the bridge
```

Stock `typescript@6.0.3` reports nothing.

## Root cause

The rule has a guard, `isValidFalseBooleanCheckType`
([`gatherLogicalOperands.ts`](https://github.com/typescript-eslint/typescript-eslint/blob/v8.65.0/packages/eslint-plugin/src/rules/prefer-optional-chain-utils/gatherLogicalOperands.ts)),
that stops it rewriting `x && x.a` to `x?.a` when an operand can be a non-nullish
falsy value — `false`, `''`, `0`, `0n` — since that rewrite changes the result
(`false && x.a` is `false`, but `false?.a` is `undefined`). For the `false` case the
guard tests `t.intrinsicName === 'false'`:

```ts
// for `&&`, disallowFalseyLiteral === true:
if (disallowFalseyLiteral &&
    (primitiveAndObjectParts.some(t => isBooleanLiteralType(t) && t.intrinsicName === 'false') ||
     /* '' */ || /* 0 */ || /* 0n */)) {
  return false; // operand is NOT a valid nullish check -> skip
}
// otherwise, with checkBoolean:true (a default), the `false` part is "allowed":
return primitiveAndObjectParts.every(t => isTypeFlagSet(t, allowedFlags)); // -> true -> report
```

The guard hinges on **`t.intrinsicName === 'false'`**. Dumping the operand's type at
this location:

| | `false` constituent's `intrinsicName` | guard hit? | result |
| --- | --- | --- | --- |
| stock `typescript@6.0.3` | `"false"` | yes | `isValidFalseBooleanCheckType` → `false` → no report |
| the bridge | **`null`** ✗ | no | falls through; `checkBoolean` default lets `false` pass → reports |

Because `checkBoolean: true` is a default option, the `false` boolean-literal
otherwise satisfies `allowedFlags`, so the `intrinsicName === 'false'` guard is the
only thing that stops the report. The bridge hands back a `false` literal whose
`intrinsicName` is `null`, so the guard misses.

The `false` literal's flags are correct (it is still a `BooleanLiteral`); only its
**payload** (`intrinsicName`) is wrong. This is the same class of defect as
[`typescript-native-bridge-comparison-always-truthy`](../typescript-native-bridge-comparison-always-truthy),
where a `false` literal's `.value` was corrupted — here it is the sibling field
`.intrinsicName` (`'false'` → `null`).

## Not load-dependent

Unlike the `.value` corruption (which needed a full type-aware rule set), this
`intrinsicName` defect reproduces **deterministically** with a single file and a
single rule.

## Environment

- `typescript-native-bridge`: **6.0.3-bridge.4.tsgo.7.0.2** (installed as `typescript`)
- reference: `typescript@6.0.3` — the latest JS-based (non-Go) release, and the API
  the bridge is built from
- `@typescript-eslint` 8.65.0, ESLint 9.39.2, `node` 22.x

## Reproduce

```sh
bash run-repro.sh        # `pnpm install` on first run, then both steps below
```

1. **Under the bridge** — `eslint src.ts` reports `prefer-optional-chain`.
2. **Under stock TypeScript** — the script swaps `typescript` to `6.0.3`, reinstalls,
   and re-lints the same file with the same config: **no problems**. (It restores the
   bridge afterwards.)

## Fix

The bridge must return `intrinsicName === 'false'` for the `false` boolean-literal
type (and `'true'` for `true`). With the correct `intrinsicName`, the guard fires and
`prefer-optional-chain` does not report.
