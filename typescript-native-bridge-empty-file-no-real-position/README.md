# Empty files get `pos = -1` from the project service (`Node must have a real position`)

Opened through the TypeScript **project service**, an **empty file** comes back
with a `SourceFile` whose `pos`/`end` are `-1` on the bridge, where the JS-based
TypeScript it is built from reports `0`/`0`:

| | `sourceFile.pos` | `sourceFile.end` | `sourceFile.getStart()` |
| --- | --- | --- | --- |
| `typescript@6.0.3` (JS-based) | `0` | `0` | `0` |
| the bridge | `-1` | `-1` | **throws** |

`-1` is TypeScript's marker for a synthesized node with no real position, so
`getStart()` fails its own assertion:

```
Debug Failure. False expression: Node must have a real position for this operation
	SourceFileObject.assertHasRealPosition       lib/typescript.js
	SourceFileObject.getStart                    lib/typescript.js
	Converter.convertNode                        typescript-estree/dist/convert.js:486
	Converter.convertProgram                     typescript-estree/dist/convert.js:2275
	astConverter                                 typescript-estree/dist/ast-converter.js:26
	parseAndGenerateServices                     typescript-estree/dist/parser.js:166
```

`@typescript-eslint/typescript-estree` asks the `SourceFile` for its start while
converting the root `Program` node, so **the file cannot be parsed at all**.
ESLint reports `0:0 Parsing error` and the file contributes no lint results.

Unlike the sibling panic reports this one is a plain JS throw, so it is contained:
the lint run survives. What it costs is coverage — every empty file drops out of
linting, and nothing but the parse error says so.

## Summary

Any file whose text is **zero characters** reproduces it. One newline is enough to
avoid it:

| File contents | Result |
| --- | --- |
| `""` (zero bytes) | **parse error** |
| `"\n"` | ok |
| `"// comment\n"` | ok |
| `"export const a = 1\n"` | ok |

## Why this shows up constantly in Vue projects

A `.vue` single-file component with no script — an ordinary presentational
component — hands `@typescript-eslint` a zero-length virtual TypeScript file:

| SFC | Result |
| --- | --- |
| no `<script>` block at all | **parse error** |
| `<script setup lang="ts"></script>` (empty) | **parse error** |
| `<script setup></script>` (empty, no `lang`) | **parse error** |
| `<script lang="ts"></script>` (empty, not `setup`) | **parse error** |
| `<script setup lang="ts">\n</script>` (a newline) | ok |
| `<script setup lang="ts">// nothing</script>` | ok |
| `<script setup lang="ts">const a = 1</script>` | ok |

The empty-`<script setup>` row is worth calling out: a component that starts life
with an empty script block, or keeps one so a tool can find it, looks nothing like
an empty file to its author.

## Only the project service is affected

Every other way of getting a `SourceFile` for the same empty file agrees with
stock on both builds:

| How the SourceFile was obtained | bridge | stock |
| --- | --- | --- |
| `parserOptions.projectService` | `pos = -1` | `pos = 0` |
| `parserOptions.project` (`createWatchProgram`) | `pos = 0` | `pos = 0` |
| `ts.createSourceFile('', ...)` | `pos = 0` | `pos = 0` |
| `ts.createProgram([...])` | `pos = 0` | `pos = 0` |
| `ts.createLanguageService(...)` | `pos = 0` | `pos = 0` |

So the defect is in what the project-service path returns for an empty file, not
in the parser or in `SourceFile` generally. `parserOptions.projectService` is the
recommended setting in current `typescript-eslint`, and is what `project: true`
resolves to, so most type-aware configs take the affected path.

## Environment

- `typescript-native-bridge`: **6.0.3-bridge.16.tsgo.7.0.2**
- reference: `typescript@6.0.3` — the JS-based build the bridge is built from
  (installed side by side as `typescript-js`)
- `node`: 22.x
- observed downstream via `@typescript-eslint` 8.69.0 + `vue-eslint-parser` 10.4.1
  + ESLint 10.9.1

## Reproduce

```sh
bash run-repro.sh        # `pnpm install` on first run, then both steps below
```

1. **API level** — `node check.mjs <build>` opens `empty.ts` and `newline.ts`
   through `@typescript-eslint/project-service` (the same entry point the parser
   uses) and prints the `pos`/`end` of each returned `SourceFile`, then calls
   `getStart()`. Both builds run in one process: the script points the
   `typescript` module id at the requested build before the project service
   resolves it.
2. **Real-world** — `eslint .` (also `pnpm lint`) with a minimal flat config
   ([`eslint.config.mjs`](./eslint.config.mjs)) using
   `parserOptions.projectService`. `empty.ts`, `NoScript.vue` and
   `EmptyScript.vue` fail to parse; `newline.ts` and `WithScript.vue` lint fine.

## Expected output

Step 1 — API level:

```
typescript-js (v6.0.3)
  empty.ts           pos= 0 end= 0   sourceFile.getStart() -> 0
  newline.ts         pos= 0 end= 1   sourceFile.getStart() -> 1

typescript (v6.0.3)
  empty.ts           pos=-1 end=-1   sourceFile.getStart() -> threw: Debug Failure. False expression: Node must have a real position for this operation
  newline.ts         pos= 0 end= 1   sourceFile.getStart() -> 1
```

Step 2 — ESLint:

```
EmptyScript.vue
  0:0  error  Parsing error: Debug Failure. False expression: Node must have a real position for this operation

NoScript.vue
  0:0  error  Parsing error: Debug Failure. False expression: Node must have a real position for this operation

empty.ts
  0:0  error  Parsing error: Debug Failure. False expression: Node must have a real position for this operation

✖ 3 problems (3 errors, 0 warnings)
```

## Real-world impact

Found while running a type-aware lint over a mid-size Vue project: **18 components
failed to parse**, every one of them a script-less or empty-script SFC, and
together they were every such component in the project. None of them were linted.

The failure is loud enough to see in isolation and easy to miss in aggregate: it
renders as one more error line in a run that already reports many, and it names a
TypeScript internal assertion rather than anything about the file. A reader
scanning lint output has no reason to connect it to "this component has no
script", and no reason to suspect the file was skipped entirely.

## Fix

The project-service path should give an empty file a real position (`pos = 0`,
`end = 0`) as every other path already does, rather than the `-1` sentinel that
means "synthesized". Callers are entitled to take positions from a `SourceFile`
they got from a program without guarding for synthesized nodes — stock's own
assertion is what fires here.

## Related

- `typescript-native-bridge-empty-tuple-base-types-panic` — a fatal Go panic
  rather than a catchable throw, in the same lint run.
