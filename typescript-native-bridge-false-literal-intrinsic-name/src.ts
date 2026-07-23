// Under `typescript-native-bridge`, a `false` boolean-literal type reports its
// `intrinsicName` as `null` instead of `'false'`. `@typescript-eslint/prefer-optional-chain`
// tests `intrinsicName === 'false'` to skip rewriting `x && x.a` when `x` can be a
// non-nullish falsy `false` (rewriting would change `false` -> `undefined`). The
// corrupted `intrinsicName` defeats that guard, so the rule reports here.
// Stock `typescript@6.0.3` reports nothing.

declare const raw: boolean | Partial<Record<'a' | 'b', boolean>>;

// `foo` narrows to `false | Partial<Record<'a' | 'b', boolean>>`.
const foo = raw === true ? false : raw;
const key = 'a' as const;

// The rule's guard exists because converting `foo && foo[key]`
// to `foo?.[key]` changes behavior when `foo === false`
// (`&&` -> `false`, `?.` -> `undefined`). The bridge's null `intrinsicName`
// defeats that guard, so the rule reports on this line.
foo && foo[key as keyof typeof foo];
