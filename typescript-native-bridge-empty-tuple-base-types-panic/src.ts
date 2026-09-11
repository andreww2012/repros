// 1. Minimal trigger: the `[]` EXPRESSION below has the empty tuple type. Asking
// the checker for its base types panics natively (Go) — see README. The `[]` type
// ANNOTATION on the same line answers fine, so the two empty-tuple types are not
// the same type instance and only the literal-derived one faults.
export const empty: [] = [];

// 2. Real-world shape, with no tuple written anywhere. `text.match(re) || []` has
// type `RegExpMatchArray | []`, whose second constituent is that same
// literal-derived empty tuple. `unicorn/no-loop-iterable-mutation` classifies the
// iterable of a `for...of` by walking base types, so it calls
// `checker.getBaseTypes()` on that constituent and the process dies.
export function splitWords(text: string): string[] {
  const tokens = text.match(/\S+/g) || [];
  const words: string[] = [];

  for (const token of tokens) {
    words.push(token);
  }

  return words;
}
