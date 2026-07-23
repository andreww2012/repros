# Type-parameter constraints are dropped, breaking type-aware rules on generics

Under the bridge, a type parameter's **constraint** is not resolved. `T.getConstraint()`
returns `undefined`, and `checker.getBaseConstraintOfType(T)` fails to reduce any type
that is *derived* from a type parameter. Three type-aware `@typescript-eslint` /
`eslint-plugin-unicorn` rules then false-positive on ordinary generic code:

```ts
export const withDirectTypeParam = <T extends string>(name: T) => `prefix/${name}`;
//                                                                          ^^^^ @typescript-eslint/no-base-to-string

const OBJ = {a: ['x'], b: ['y', 'z']} as const;
type Key = keyof typeof OBJ;
export const withDerivedType = <P extends Key>(lang: [P, (typeof OBJ)[P][number]]) => {
  const table: Record<string, Record<string, string>> = {};
  const usedAsKey = table[lang[0]]?.[lang[1]];  // unicorn/no-unsafe-property-key on `lang[1]`
  const usedInTemplate = `x/${lang[1]}`;         // @typescript-eslint/restrict-template-expressions on `lang[1]`
  return [usedAsKey, usedInTemplate];
};
```

Stock `typescript@6.0.3` reports nothing here — all three types are strings.

## Root cause

The single underlying defect is **type-parameter constraint resolution returns
nothing** on the bridge. It surfaces through three rules:

### 1. `@typescript-eslint/no-base-to-string` — `T.getConstraint()` returns `undefined`

The rule
([`no-base-to-string.ts`](https://github.com/typescript-eslint/typescript-eslint/blob/v8.65.0/packages/eslint-plugin/src/rules/no-base-to-string.ts))
resolves a type parameter to its constraint:

```ts
if (tsutils.isTypeParameter(type)) {
  const constraint = type.getConstraint();
  if (constraint) {
    return collectToStringCertainty(constraint, visited); // stock: string -> "Always" (no report)
  }
  return option.checkUnknown ? Usefulness.Sometimes : Usefulness.Always; // bridge takes this branch
}
```

Instrumenting the rule, it sees `name`'s type as
`type="T"(TypeParameter) TP-constraint=null` — i.e. `getConstraint()` returned
`undefined`. With `{ checkUnknown: true }`, an "unconstrained" (`unknown`) generic
yields certainty `Sometimes` → the rule reports `'name' may use Object's default
stringification format`. Stock TypeScript returns `string` for the constraint, so
certainty is `Always` and nothing is reported.

(Note: without `checkUnknown: true` this specific rule stays silent even on the
bridge — the constraint is still dropped, but an unconstrained generic maps to
`Always`. `checkUnknown: true` is what exposes it.)

### 2 & 3. `restrict-template-expressions` / `no-unsafe-property-key` — derived indexed-access types never reduce

`lang[1]` has type `(typeof OBJ)[P][number]`. Reducing it to `"x" | "y" | "z"`
requires `P`'s constraint (`"a" | "b"`). Because the constraint is unavailable, the
bridge leaves the type as a **symbolic, unreduced `IndexedAccess`**:
`{ readonly a: readonly ["x"]; readonly b: readonly ["y", "z"]; }[P][number]`.

- `restrict-template-expressions` calls `getConstrainedTypeAtLocation`, gets this
  unreduced type, finds it is not `StringLike`, and reports `Invalid type "…[P][number]"`.
- `no-unsafe-property-key` calls `checker.getBaseConstraintOfType(type)`, which
  returns `null` (not the string union), so it can't reduce the key. It then falls to
  its last-resort heuristic — `!type.intrinsicName && type.getProperties().length > 0`.
  The unreduced type has no `intrinsicName` and reports **52 apparent properties**
  (the `String` interface members), so it is flagged as an "unsafe" key.

The `control` line proves the trigger is the type parameter: the *same* indexed
access with a **concrete** key, `(typeof OBJ)[Key][number]`, reduces correctly on the
bridge and is not flagged.

## Not load-dependent

Unlike some bridge issues, this reproduces **deterministically** with a single file
and a single generic function — no large rule set or multi-file program is needed.

## Environment

- `typescript-native-bridge`: **6.0.3-bridge.4.tsgo.7.0.2** (installed as `typescript`)
- reference: `typescript@6.0.3` — the latest JS-based (non-Go) release, and the API
  the bridge is built from
- `@typescript-eslint` 8.65.0, `eslint-plugin-unicorn` 72.0.0, ESLint 9.39.2, `node` 22.x

## Reproduce

```sh
bash run-repro.sh        # `pnpm install` on first run, then both steps below
```

1. **Under the bridge** — `eslint src.ts` reports 3 errors (`no-base-to-string`,
   `no-unsafe-property-key`, `restrict-template-expressions`).
2. **Under stock TypeScript** — the script swaps `typescript` to `6.0.3`, reinstalls,
   and re-lints the same file with the same config: **no problems**. (It restores the
   bridge afterwards.)

## Fix

The bridge must resolve type-parameter constraints: `T.getConstraint()` must return
the declared constraint (`string`), and `checker.getBaseConstraintOfType()` must
reduce constraint-dependent indexed-access / conditional types to their underlying
type. With the constraint present, all three rules see a string type and report
nothing.
