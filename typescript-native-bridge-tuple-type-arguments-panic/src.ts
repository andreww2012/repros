// Passing `cond ? [x] : []` as an argument whose parameter type is a
// tuple-or-empty union (`[T] | []`) makes @typescript-eslint/no-unsafe-argument
// ask the checker for the type arguments of each tuple in that union. On the
// bridge's checker that request panics NATIVELY (Go) and kills the whole
// process — see README.
declare function foo(options: [Record<string, unknown>] | []): void;

declare const options: Record<string, unknown> | undefined;

foo(options ? [options] : []);
