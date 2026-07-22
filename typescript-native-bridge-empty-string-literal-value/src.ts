// Reading a property with an EMPTY-STRING key (`foo['']`) makes
// @typescript-eslint/unbound-method ask the checker for the type of the key
// expression `''` — the empty-string literal type. The rule then reads that
// type's `.value` (expecting the string `""`) and calls `.toString()` on it.
//
// On the bridge's watch/builder-program checker, this literal type has
// `value: undefined` instead of `""`, so `.value.toString()` throws.
declare const foo: Record<string, () => void>;

const handler = foo[''];
