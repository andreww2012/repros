// `ev` is a plain `number`, so `ev >= 9.27` is a normal boolean comparison
// (false when ev < 9.27). But under the bridge, when a type-aware rule set runs,
// the bridge computes this comparison's result type with NUMBER-LITERAL flags
// instead of boolean, so @typescript-eslint/no-unnecessary-condition believes
// the condition is "always truthy" and reports it. Stock TypeScript does not.
declare const ev: number;

export const x = ev >= 9.27 ? 1 : 2;
