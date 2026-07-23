// Under `typescript-native-bridge`, a type parameter's *constraint* is not
// resolved. So a bare `<T extends string>` looks unconstrained, and any type
// *derived* from the type parameter (an indexed access / conditional type) never
// reduces to its underlying string type. Three type-aware rules then false-positive.
// Stock `typescript@6.0.3` reports nothing here.

// (1) `@typescript-eslint/no-base-to-string`, run with `{ checkUnknown: true }`.
// `name`'s type is the type parameter `T`, whose constraint is `string`. The bridge
// returns `undefined` for `T.getConstraint()`, so the rule treats `T` as an
// unconstrained (`unknown`) generic and reports "may use Object's default
// stringification format".
export const withDirectTypeParam = <T extends string>(name: T) => `prefix/${name}`;

// (2) `@typescript-eslint/restrict-template-expressions` and
// `unicorn/no-unsafe-property-key`. `lang[1]` has type `(typeof OBJ)[P][number]`.
// Because `P`'s constraint is not resolved, this indexed-access type is never
// reduced to `"x" | "y" | "z"`; it stays a symbolic, non-string, object-like type
// (52 apparent `String` members), so it is rejected as a template expression AND
// flagged as an "unsafe" key.
const OBJ = {a: ['x'], b: ['y', 'z']} as const;
type Key = keyof typeof OBJ;

export const withDerivedType = <P extends Key>(lang: [P, (typeof OBJ)[P][number]]) => {
  const table: Record<string, Record<string, string>> = {};
  const usedAsKey = table[lang[0]]?.[lang[1]]; // -> unicorn/no-unsafe-property-key on `lang[1]`
  const usedInTemplate = `x/${lang[1]}`; // -> @typescript-eslint/restrict-template-expressions on `lang[1]`
  return [usedAsKey, usedInTemplate];
};

// Control: the SAME indexed access with a *concrete* key (no type parameter)
// reduces correctly on the bridge and is NOT flagged — proving the trigger is the
// unresolved type-parameter constraint, not indexed access per se.
declare const concreteLang: [Key, (typeof OBJ)[Key][number]];
export const control = `x/${concreteLang[1]}`;
