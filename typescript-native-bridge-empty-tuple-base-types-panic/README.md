# Native panic in `getBaseTypes` on the literal-derived empty tuple

Asking the bridge's checker for the **base types of the empty tuple type that
comes from an array literal** (`[]`) panics **natively (Go)** and kills the whole
process, where the JS-based TypeScript it is built from returns normally:

```
panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x2 addr=0x100]
	checker.(*Checker).getBaseTypes(...)             internal/checker/checker.go:19230
	checker.(*Checker).GetBaseTypes(...)             internal/checker/exports.go:336
	api.(*Session).handleGetBaseTypes(...)           internal/api/session.go:5721
	api.(*Session).handleArenaRequest(...)           internal/api/arena_dispatch.go:171
	api.(*Session).HandleArenaRequest(...)           internal/api/arena_dispatch.go:98
	main.BridgeCallArena(...)                        bridge/bridge.go:442
```

A native panic can't be caught by JS `try/catch` — it aborts the process with
`SIGABRT`. So a single type-aware ESLint rule that makes this request takes down
the entire lint run.

## Summary

The offending type is the **empty tuple**, and only when it comes from an
*expression*. One line is enough:

```ts
export const empty: [] = [];
```

Asking for the base types of the `[]` **annotation** on that line returns
`never[]` fine. Asking for the base types of the `[]` **expression** panics. The
two empty-tuple types are not the same type instance — the literal-derived one
reports `objectFlags=147468` (it carries `ObjectFlags.ArrayLiteral`), the
annotation-derived one does not — and only the literal-derived one faults.

### What does and does not panic

`checker.getBaseTypes(t)`, where `t` is the type of the marked node:

| Source | `t` | Result |
| --- | --- | --- |
| `const x: [] = []` — the `[]` **literal** | `[]` | **panic** |
| `const x = [] as const` — the `[]` literal | `readonly []` | **panic** |
| `text.match(re) \|\| []` — the `[]` constituent | `[]` | **panic** |
| `const x: [] = []` — the `[]` **annotation** | `[]` | ok — 1 base |
| `declare const x: []` | `[]` | ok — 1 base |
| `const x = []` | `never[]` | ok — 0 bases |
| `const x = [1]` | `number[]` | ok — 0 bases |
| `flag ? [1] : []` | `number[]` | ok — 0 bases |
| `strArrayOrNull \|\| []` | `never[]` | ok — 0 bases |

The empty tuple only survives as its own type when something forces it to: a
tuple annotation, `as const`, or a union with a sibling that keeps it from being
absorbed. That last case is the one that shows up in ordinary code — `x.match(re)
|| []` has type `RegExpMatchArray | []`, with no tuple written anywhere.

## Upstream returns normally — this is not a catchable-vs-fatal difference

Worth stating plainly, because it differs from the sibling reports: stock
`typescript@6.0.3` does **not** throw here. It returns `[never[]]` for every one
of the panicking rows above. The bridge dies where stock answers.

The caller that found this wraps the call in `try/catch` anyway
([`eslint-plugin-unicorn`, `rules/utils/types.js`](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/rules/utils/types.js)):

```js
function getBaseTypes(type, checker) {
	try {
		return checker.getBaseTypes(type) ?? type.getBaseTypes?.() ?? [];
	} catch {
		return [];
	}
}
```

That guard is correct defensive coding — `checker.getBaseTypes` is documented for
`InterfaceType` and stock *does* throw for some inputs (see the note below). On
the bridge the guard is simply inert: the process is gone before `catch` runs.

### A second, opposite divergence in the same API

For a **non-empty** tuple the two builds disagree the other way. Stock throws a
catchable `TypeError` (`Cannot read properties of undefined (reading 'flags')`);
the bridge returns `[]` without complaint:

| `t` | stock `typescript@6.0.3` | bridge |
| --- | --- | --- |
| `[string, number]` (annotation, declaration or literal) | throws `TypeError` | ok — 0 bases |
| `[]` from a literal | ok — 1 base | **panic** |

So neither build is a superset of the other on this entry point, and the one
input where the bridge is *stricter* is the one where it is fatal.

## Successor to `typescript-native-bridge-empty-tuple-this-type-panic`

That report described the **same type** — the literal-derived empty tuple — dying
in the arena response encoder (`newTypeResponse` → `Type.ThisType`,
`proto.go:1130`) on `getTypeAtLocation`, on bridge.15.

On **bridge.16** that panic is gone: `getTypeAtLocation` on the `[]` literal now
returns the type fine, and running the older report's `check.mjs` unmodified
against bridge.16 completes with `DONE (no panic)`. The next unguarded access to
the same type is `getBaseTypes`, and it still nil-dereferences.

This is the third fix-and-resurface on this one type:

| Bridge | Panic site | Entry point |
| --- | --- | --- |
| bridge.1 | `AsTupleType`, `proto.go:945` | `getTypeAtLocation` |
| bridge.15 | `Type.ThisType`, `proto.go:1130` | `getTypeAtLocation` |
| bridge.16 | `getBaseTypes`, `checker.go:19230` | `getBaseTypes` |

Each fix removed one unchecked access and left the type itself unrepaired, so the
next caller to touch it faults instead. Guarding the type — or the NAPI boundary —
would end the sequence; guarding one more accessor will not.

## Environment

- `typescript-native-bridge`: **6.0.3-bridge.16.tsgo.7.0.2**
- reference: `typescript@6.0.3` — the JS-based build the bridge is built from
  (installed side by side as `typescript-js`)
- `node`: 22.x
- observed downstream via `eslint-plugin-unicorn` 74.0.0 + ESLint 10.9.1

## Reproduce

```sh
bash run-repro.sh        # `pnpm install` on first run, then both steps below
```

1. **API level** — `node check.mjs <build>` builds a watch program (the way
   `@typescript-eslint/typescript-estree` does for `parserOptions.project`) and
   asks for the base types of the `[]` annotation and then the `[]` literal. Run
   once per build in its own subprocess (a native panic kills the process).
2. **Real-world** — `eslint src.ts` (also `pnpm lint`) with a minimal flat config
   ([`eslint.config.mjs`](./eslint.config.mjs)) enabling only
   `unicorn/no-loop-iterable-mutation`. The parser resolves `typescript` to the
   bridge, so it panics.

## Expected output

Step 1 — API level:

```
typescript-js (v6.0.3)
  checker.getBaseTypes(<the `[]` type ANNOTATION>)   // [], objectFlags=524300
    -> 1 base(s): never[]
  checker.getBaseTypes(<the `[]` array LITERAL>)   // [], objectFlags=147468
    -> 1 base(s): never[]
  DONE (no panic)

typescript (v6.0.3)
  checker.getBaseTypes(<the `[]` type ANNOTATION>)   // [], objectFlags=12
    -> 1 base(s): never[]
  checker.getBaseTypes(<the `[]` array LITERAL>)   // [], objectFlags=147468
panic: runtime error: invalid memory address or nil pointer dereference
  ... getBaseTypes ... GetBaseTypes ... handleGetBaseTypes ... BridgeCallArena ...
```

Step 2 — the real ESLint run dies with the same Go panic. There is no ESLint
error message and no file name: the process is aborted before ESLint can report
anything.

## How a lint rule gets here

`unicorn/no-loop-iterable-mutation` classifies the iterable of a `for...of` by
asking whether it is an array, a `Set` or a `Map`. The `Set`/`Map` checkers run
with `checkClassHeritage: true`, so `getTypeScriptType` walks base types:

```
for (const token of tokens)        // tokens: RegExpMatchArray | []
  -> isSet(tokens) / isMap(tokens)
     -> getTypeScriptType(RegExpMatchArray | [])
        -> union, so map over constituents
           -> getTypeScriptType([])          // the literal-derived empty tuple
              -> checker.getBaseTypes([])    // panic
```

Nothing about the rule is exotic, and nothing about the source is: the trigger is
`x.match(re) || []` followed by a loop over the result.

## Real-world impact

Found by running a type-aware lint over a mid-size TypeScript project. The lint
aborted with an unattributable Go panic — no file name, no rule name — after
several minutes of work, and the run had to be bisected by hand to find it.

Two things about the reach of this one:

- `unicorn/no-loop-iterable-mutation` is **`error` in
  `eslint-plugin-unicorn`'s `recommended` preset**, so it is on by default rather
  than opt-in.
- The call is unguarded. Other callers in the type-aware lint ecosystem
  (`@typescript-eslint`'s `baseTypeUtils` and `builtinSymbolLikes`,
  `eslint-plugin-sonarjs`'s `S6759`) gate on `ObjectFlags.Class | Interface` or on
  `SymbolFlags.Class | Interface` first, and the literal-derived empty tuple has
  neither bit (`Reference | Tuple`, plus two literal bits), so those are safe
  today. That safety is incidental: it depends on every caller choosing to gate,
  on an API that stock answers for this input.

Because it's a native panic there is no per-file recovery: one affected file
blocks linting the whole project, and `--cache` does not help, since a crashed run
writes no cache.

## Fix

Two things, independently:

1. `getBaseTypes` should not dereference `AsInterfaceType()` unconditionally. The
   literal-derived empty tuple has no interface data, and the exposed
   `GetBaseTypes` RPC lets any type reach it — tsgo's own callers only pass types
   they already know to be class or interface. Returning `nil` (stock returns the
   type's one base, `never[]`) would match every other row in the table above.
2. `BridgeCallArena` should `recover()` from Go panics and surface them to JS as
   errors. Any nil deref anywhere in the checker currently escalates to a fatal,
   unattributable process abort for every consumer — and, as the table above
   shows, callers already write `try/catch` around exactly these calls.

## Related

- `typescript-native-bridge-empty-tuple-this-type-panic` — the same type, one
  bridge release earlier, dying in the response encoder. Fixed in bridge.16.
- `typescript-native-bridge-tuple-type-arguments-panic` — the same type on
  bridge.1, earlier panic site again.
- `typescript-native-bridge-empty-file-no-real-position` — a catchable throw
  rather than a panic, found in the same lint run.

## Workarounds

- Stop the empty tuple from surviving as its own type: `(text.match(re) ?? [])`
  still produces it, but giving the empty branch a non-tuple contextual type does
  not — e.g. `text.match(re) || ([] as string[])`.
- Disable the rules that read such types (`unicorn/no-loop-iterable-mutation`, and
  any other rule that walks base types).
- Point `typescript` back at the JS-based build for linting.
