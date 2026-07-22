// API-level reproduction, run once per TypeScript build (module name as argv[2]).
// Builds a watch program the way @typescript-eslint/typescript-estree does for
// `parserOptions.project`, finds the `options ? [options] : []` argument in
// `foo(...)` (type `[Record<string, unknown>] | []`), and asks the checker
// for the type arguments of each union constituent — exactly what
// `no-unsafe-argument` does.
//
// JS-based TypeScript: returns `[Record<string, unknown>]`'s element (len 1) and
//   `[]`'s (len 0), then prints DONE.
// The bridge:          PANICS natively (Go) —
//   `interface conversion: checker.TypeData is *checker.TypeReference,
//    not *checker.TupleType` in AsTupleType — and the process dies before DONE.
//
// A native panic can't be caught in-process, so run-repro.sh invokes this once
// per build in its own subprocess.
import {createRequire} from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require(process.argv[2] || 'typescript');

const NOOP = () => {};
const NOOP_WATCHER = {close: NOOP};

const host = ts.createWatchCompilerHost(
  path.resolve('tsconfig.json'),
  {},
  ts.sys,
  ts.createAbstractBuilder,
  NOOP,
  NOOP,
);
host.watchFile = () => NOOP_WATCHER;
host.watchDirectory = () => NOOP_WATCHER;
host.setTimeout = undefined;
host.clearTimeout = undefined;

let builderProgram;
host.afterProgramCreate = (builder) => {
  builderProgram = builder;
};

const watch = ts.createWatchProgram(host);
const program = (builderProgram ?? watch.getProgram()).getProgram();
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile(path.resolve('src.ts'));

const label = process.argv[2] === 'typescript-js' ? 'typescript (JS-based)' : 'typescript-native-bridge';
console.log(`\n${label} (v${ts.version})`);

let call;
const visit = (node) => {
  if (ts.isCallExpression(node)) {
    call = node;
  }
  ts.forEachChild(node, visit);
};
visit(sourceFile);

const argument = call.arguments[2]; // `options ? [options] : []`
const argumentType = checker.getTypeAtLocation(argument);
const constituents = argumentType.isUnion() ? argumentType.types : [argumentType];

console.log(`  argument: ${argument.getText()}`);
console.log(`  union constituents: ${constituents.length}`);
for (const constituent of constituents) {
  const typeArguments = checker.getTypeArguments(constituent); // <-- bridge panics here
  console.log(`    getTypeArguments() -> length ${typeArguments.length}`);
}

watch.close?.();
console.log('  DONE (no panic)');
