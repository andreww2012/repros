# Native panic encoding the empty tuple type (`Type.ThisType` nil deref)

Asking the bridge's checker for the type of an **empty array literal that is
contextually typed as the empty tuple** panics **natively (Go)** and kills the
whole process, where the JS-based TypeScript it is built from returns normally:

```
panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x2 addr=0xf8]
	checker.(*Type).ThisType(...)                     internal/checker/types.go:754
	api.newTypeResponse(...)                          internal/api/proto.go:1130
	api.(*snapshotData).newTypeResponse(…)            internal/api/session.go:455
	api.(*Session).handleGetTypeAtLocation(…)         internal/api/session.go:2844
```

A native panic can't be caught by JS `try/catch` — it aborts the process
(`Abort trap: 6`). So a single type-aware ESLint rule that makes this request
takes down the entire lint run.

## Successor to `typescript-native-bridge-tuple-type-arguments-panic`

That repro reported an `AsTupleType` interface-conversion panic at
`proto.go:945` on **bridge.1**, for the input `foo(options ? [options] : [])`.

On **bridge.15** that `AsTupleType` panic is gone — and the *exact same input*
now panics at `proto.go:1130` on `ThisType()` instead. The first unchecked
access in `newTypeResponse` was fixed; the next one in the same function still
faults on the same type. Verified by running the older repro's `src.ts` against
bridge.15:

```
argument type: [] | [Record<string, unknown>]
reading .types (what no-unsafe-argument does) ...
panic: runtime error: invalid memory address or nil pointer dereference
	checker.(*Type).ThisType(...)   internal/checker/types.go:754
	api.newTypeResponse(...)        internal/api/proto.go:1130
```

## Summary

The offending type is the **empty tuple** `[]`, and only when it comes from an
*expression*. The minimal trigger needs no union, no `flatMap` and no ESLint
rule — one line and one `getTypeAtLocation` call:

```ts
export const empty: [] = [];
```

Asking for the type of the `[]` **annotation** on that line returns `[]` fine.
Asking for the type of the `[]` **expression** panics. So the two empty-tuple
types are not the same type instance, and only the literal-derived one breaks
the response encoder.

`no-unsafe-return` reaches it one frame deeper: it reads the type of an arrow
body (`[] | [[string, number]]`) and enumerates its constituents, so
`handleGetTypesOfType` → `resolveTypeArrayPropertyOfType` → `newTypeResponse`
encodes the empty-tuple constituent and hits the same nil deref.

### What does and does not panic

| Source | Result |
| --- | --- |
| `export const x: [] = [];` | **panic** |
| `export const x: readonly [] = [];` | **panic** |
| `export const x = [] as const;` | **panic** |
| `export const x = [] as [];` | **panic** (on the `[]` literal, not the assertion) |
| `xs.flatMap((v) => (v ? [[k, v] satisfies [string, number]] : []))` | **panic** |
| `(text.match(re) \|\| []).length` — type `RegExpMatchArray \| []` | **panic** |
| `declare const x: []; export const y = x;` | ok |
| `export const x: [number] = [1];` | ok — non-empty tuples are fine |
| `export const x = [];` (`never[]`) | ok |
| `export const x: number[] = [];` | ok |

Both everyday shapes — `cond ? [x] : []` and `nullableArray || []` — produce the
empty tuple from ordinary code, the first via `flatMap`'s `U | readonly U[]`
callback return type, the second with no ternary or `flatMap` at all.

## Environment

- `typescript-native-bridge`: **6.0.3-bridge.15.tsgo.7.0.2**
- reference: `typescript@6.0.3` — the JS-based build the bridge is built from
  (installed side by side as `typescript-js`)
- `node`: 22.x
- observed downstream via `@typescript-eslint` 8.68.0 + ESLint 10.9.1

## Reproduce

```sh
bash run-repro.sh        # `pnpm install` on first run, then both steps below
```

1. **API level** — `node check.mjs <build>` builds a watch program (the way
   `@typescript-eslint/typescript-estree` does for `parserOptions.project`) and
   asks for the annotation type, the literal type, and the union constituents.
   Run once per build in its own subprocess (a native panic kills the process).
2. **Real-world** — `eslint src.ts` (also `pnpm lint`) with a minimal flat config
   ([`eslint.config.mjs`](./eslint.config.mjs)) enabling only
   `@typescript-eslint/no-unsafe-return`. The parser resolves `typescript` to
   the bridge, so it panics.

Both `parserOptions.project` and `parserOptions.projectService` panic. Plain
`ts.createProgram` does **not** — it never engages the tsgo checker (no
`TNB ACTIVE` banner), so it is not a meaningful control.

## Expected output

Step 1 — API level:

```
typescript-js (v6.0.3)
  getTypeAtLocation(<the `[]` type ANNOTATION>)
    -> []
  getTypeAtLocation(<the `[]` array LITERAL>)
    -> []
  reading .types of [] | [[string, number]]
    -> 2 constituents
  DONE (no panic)

typescript (v6.0.3)
  getTypeAtLocation(<the `[]` type ANNOTATION>)
    -> []
  getTypeAtLocation(<the `[]` array LITERAL>)
panic: runtime error: invalid memory address or nil pointer dereference
  ... Type.ThisType ... newTypeResponse ... handleGetTypeAtLocation ...
Abort trap: 6
```

Step 2 — real ESLint run dies with the same Go panic (no ESLint error message —
the process is aborted before ESLint can report anything).

## Real-world impact

Found by running a type-aware lint over a ~640-file TypeScript project. The lint
aborted with an unattributable Go panic — no file name, no rule name — and after
working around the first occurrence it simply died at the next one. The first two
sites were an ordinary `flatMap(… ? […] : [])` and an ordinary
`(str.match(re) || [])`.

A sweep of that project's empty array literals found **13 distinct panic sites in
the first 22% of candidates**, at one point 7 in 9 consecutive candidates, spread
across ordinary application code rather than confined to any one file. It was
stopped early; the real total is far higher.

Because it's a native panic there is no per-file recovery: one affected file
blocks linting the whole project, and finding the offending line requires
bisecting by hand. Patching sites individually is not a viable mitigation at that
density — and some sit in `const` type-parameter positions, where changing the
literal changes the inferred type rather than just dodging the bug.

## Fix

Two things, independently:

1. `newTypeResponse` should not dereference `ThisType()` unconditionally — the
   literal-derived empty tuple has no interface data. (Note this is the second
   unchecked access in this function to fault on the same type; the first,
   `AsTupleType`, was already fixed. A guard on the whole encoding path would be
   worth more than another one-line fix.)
2. `BridgeCallArena` should `recover()` from Go panics and surface them to JS as
   errors. Any nil deref anywhere in the checker currently escalates to a fatal,
   unattributable process abort for every consumer.

## Related

- `typescript-native-bridge-tuple-type-arguments-panic` — the same encoder on
  bridge.1; same input, earlier panic site.
- `typescript-native-bridge-type-only-import-panic` — a different nil deref,
  inside the checker rather than the response encoder.

## Workarounds

- Give the empty branch a non-tuple contextual type — e.g.
  `([] satisfies string[])` instead of a bare `[]`. Cast-free and minimal.
- Disable the rules that read such types (`no-unsafe-return`,
  `no-unsafe-argument`, …).
- Point `typescript` back at the JS-based build for linting.
