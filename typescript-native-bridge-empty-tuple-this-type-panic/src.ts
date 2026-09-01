// 1. Minimal trigger: the `[]` EXPRESSION below is contextually typed as the
// empty tuple. Asking the checker for its type panics natively (Go) — see README.
// The `[]` type ANNOTATION on the same line resolves fine, so the two empty-tuple
// types are not the same type instance.
export const empty: [] = [];

// 2. Real-world shape. @typescript-eslint/no-unsafe-return reads the type of the
// arrow body (`[] | [[string, number]]`) and enumerates its constituents, which
// encodes the empty-tuple constituent and hits the same panic one frame deeper.
declare const entries: [string, number | null][];

export const result = entries.flatMap(([key, value]) =>
  value ? [[key, value] satisfies [string, number]] : [],
);
