# Native panic getting type arguments of a tuple type (`AsTupleType`)

Asking the bridge's checker for the **type arguments of a tuple type** panics
**natively (Go)** and kills the whole process, where the JS-based TypeScript it
is built from returns normally:

```
panic: interface conversion: checker.TypeData is *checker.TypeReference, not *checker.TupleType
	checker.(*Type).AsTupleType(...)                 internal/checker/types.go:693
	api.newTypeResponse(...)                          internal/api/proto.go:945
	api.(*Session).resolveTypeArrayPropertyOfType(…)  internal/api/session.go:2784
	api.(*Session).handleGetTypesOfType(…)            internal/api/session.go:2672
```

A native panic can't be caught by JS `try/catch` — it aborts the process
(`Abort trap: 6`). So a single type-aware ESLint rule that makes this request
takes down the entire lint run.

## Summary

`@typescript-eslint/no-unsafe-argument` checks each call argument against its
parameter. When an argument is `cond ? [x] : []` and the parameter type is a
tuple-or-empty union (`[T] | []`), the rule asks the checker for the type
arguments of each tuple constituent (`checker.getTypeArguments(part)`). On the
bridge that request routes to `handleGetTypesOfType` →
`resolveTypeArrayPropertyOfType`, which does `AsTupleType()` on a value whose
`TypeData` is a plain `*TypeReference`, not a `*TupleType`, and panics.

`src.ts` is the minimal trigger (it mirrors real config code such as
`.foo(options ? [options] : [])`):

```ts
declare function foo(options: [Record<string, unknown>] | []): void;
declare const options: Record<string, unknown> | undefined;
foo(options ? [options] : []);
```

The union-typed argument (`[Record<string, unknown>] | []`) is what matters — a
directly-typed tuple variable does **not** trigger it; the `cond ? [x] : []`
shape (which produces the union) does.

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

1. **API level** — `node check.mjs <build>` builds a watch program (the way
   `@typescript-eslint/typescript-estree` does for `parserOptions.project`) and
   calls `checker.getTypeArguments()` on the tuple constituents of the argument.
   Run once per build in its own subprocess (a native panic kills the process).
2. **Real-world** — `eslint src.ts` (also `pnpm lint`) with a minimal flat config
   ([`eslint.config.mjs`](./eslint.config.mjs)) enabling only
   `@typescript-eslint/no-unsafe-argument`. The parser resolves `typescript` to
   the bridge, so it panics.

## Expected output

Step 1 — API level:

```
typescript (JS-based) (v6.0.3)
  argument: options ? [options] : []
  union constituents: 2
    getTypeArguments() -> length 1
    getTypeArguments() -> length 0
  DONE (no panic)

typescript-native-bridge (v6.0.3)
panic: interface conversion: checker.TypeData is *checker.TypeReference, not *checker.TupleType
  ... AsTupleType ... handleGetTypesOfType ...
Abort trap: 6
```

Step 2 — real ESLint run dies with the same Go panic (no ESLint error message —
the process is aborted before ESLint can report anything).

## Real-world impact

This is the single most disruptive bridge bug we hit: sweeping a ~370-file
TypeScript project, **49 files** aborted the lint this way. It is not specific to
`no-unsafe-argument` — every type-aware rule that resolves tuple/type-argument
information triggers the same panic. Rules observed to hit it:

- `no-unsafe-argument`, `no-unsafe-assignment`, `no-unsafe-return`
- `no-misused-promises`, `no-misused-spread`
- `no-unnecessary-type-assertion`, `non-nullable-type-assertion-style`

Because it's a native panic, there is no per-file recovery — the whole ESLint
process dies, so a single affected file blocks linting the entire project.

## Fix

`resolveTypeArrayPropertyOfType` / `AsTupleType` should handle a `TypeReference`
that is not a tuple (return its regular type arguments, or an empty result)
instead of doing an unchecked interface conversion that panics.
