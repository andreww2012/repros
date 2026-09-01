# Native panic on a type-only import clause (`tryGetDeclaredTypeOfSymbol` nil deref)

`checker.getTypeAtLocation()` on a **type-only import clause**
(`import type {Thing} from './other'`) reaches a nil symbol in
`tryGetDeclaredTypeOfSymbol`. On the bridge that is a Go nil-pointer dereference
that **kills the process**:

```
panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x2 addr=0x0]
	checker.(*Checker).tryGetDeclaredTypeOfSymbol(…)  internal/checker/checker.go:23754
	checker.(*Checker).getDeclaredTypeOfSymbol(…)     internal/checker/checker.go:23745
	checker.(*Checker).getTypeOfNode(…)               internal/checker/checker.go:31902
	checker.(*Checker).GetTypeAtLocation(…)           internal/checker/checker.go:32086
	api.(*Session).handleGetTypeAtLocation(…)         internal/api/session.go:2839
```

## The nil symbol is upstream — the fatality is not

This one is worth reading carefully before acting on it, because the underlying
condition is **not** a fork regression:

```
typescript-js (v6.0.3)
  getTypeAtLocation(<the `type {Thing}` import clause>)
    -> threw, and it was CATCHABLE: TypeError: Cannot read properties of undefined (reading 'flags')
  DONE (recoverable)
```

The JS-based TypeScript reaches the *same* undefined symbol in the *same*
function. Stock `typescript@5.9.3` does too. The difference is entirely in the
consequence: upstream it is a `TypeError` that a caller can catch and move past,
on the bridge it is an unrecoverable process abort.

So the actionable defect here is **panic containment**, not the nil symbol.

## Summary

`src.ts` is the whole trigger:

```ts
import type {Thing} from './other';

export const describe = (thing: Thing) => thing.name;
```

Only the clause-level `import type` form faults. The inline `{type X}` modifier
resolves to `any` normally:

| Source | Result |
| --- | --- |
| `import type {Thing} from './other';` (type-only **clause**) | **panic** |
| `import type {Alias} from './other';` (type alias, same form) | **panic** |
| `import {type Thing} from './other';` (inline type modifier) | ok — `any` |
| `import {thing} from './other';` (value import) | ok — `any` |
| `import * as ns from './other';` (namespace import) | ok — `any` |

## Environment

- `typescript-native-bridge`: **6.0.3-bridge.15.tsgo.7.0.2**
- reference: `typescript@6.0.3` — the JS-based build the bridge is built from
  (installed side by side as `typescript-js`)
- `node`: 22.x

## Reproduce

```sh
bash run-repro.sh        # `pnpm install` on first run
```

`node check.mjs <build>` builds a watch program (the way
`@typescript-eslint/typescript-estree` does for `parserOptions.project`) and
calls `getTypeAtLocation` on the import clause node, inside a `try/catch`. Run
once per build in its own subprocess — the `try/catch` only ever helps the
JS-based build.

## Expected output

```
typescript-js (v6.0.3)
  getTypeAtLocation(<the `type {Thing}` import clause>)
    -> threw, and it was CATCHABLE: TypeError: Cannot read properties of undefined (reading 'flags')
  DONE (recoverable)

typescript (v6.0.3)
  getTypeAtLocation(<the `type {Thing}` import clause>)
panic: runtime error: invalid memory address or nil pointer dereference
  ... tryGetDeclaredTypeOfSymbol ... getTypeOfNode ... handleGetTypeAtLocation ...
Abort trap: 6
```

## Real-world impact

Lower than it looks, and this should be said plainly: **no `@typescript-eslint`
rule currently queries import clause nodes**, so this does not break lint runs
today. It was found by walking every node of a source file with
`getTypeAtLocation` while hunting
`typescript-native-bridge-empty-tuple-this-type-panic`.

Its value is as evidence for the general problem: any nil deref anywhere in the
Go checker — including ones that are benign, catchable errors upstream — is a
fatal, unattributable abort for every consumer of the bridge.

## Fix

1. `BridgeCallArena` should `recover()` from Go panics and surface them to JS as
   errors, so that upstream-catchable conditions stay catchable. This is the
   part that matters.
2. Optionally, `getTypeOfNode` could avoid calling `getDeclaredTypeOfSymbol`
   with a nil symbol for a type-only import clause and return `any`, matching
   what the inline-modifier form already does — though that would be a
   divergence from upstream behaviour rather than a bug fix.

## Related

- `typescript-native-bridge-empty-tuple-this-type-panic` — a different nil
  deref, in the arena response encoder rather than the checker, which *does*
  break real lint runs.
