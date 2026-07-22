// API-level reproduction, run once per TypeScript build (module name as argv[2]).
// Builds a watch program the way @typescript-eslint/typescript-estree does for
// `parserOptions.project`, resolves the `default` symbol of `m.default` (the
// synthetic default of the CommonJS `dep.cts`), and replays exactly what
// @typescript-eslint's no-deprecated rule does to walk an alias chain:
//
//   const target = symbol.getDeclarations() && checker.getImmediateAliasedSymbol(symbol);
//
// JS-based TypeScript: `getDeclarations()` is `undefined`, so the `&&` short-
//   circuits and getImmediateAliasedSymbol is never called — safe.
// The bridge:          `getDeclarations()` is `[]` (an empty array — a separate
//   bridge bug), which is truthy, so getImmediateAliasedSymbol IS called on this
//   targetless alias and PANICS natively (Go):
//   `Unexpected nil in getImmediateAliasedSymbol` — the process dies.
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

// Find the `default` in `m.default`.
let nameNode;
const visit = (node) => {
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'default') {
    nameNode = node.name;
  }
  ts.forEachChild(node, visit);
};
visit(sourceFile);

const symbol = checker.getSymbolAtLocation(nameNode) ?? checker.getSymbolAtLocation(nameNode.parent);
if (!symbol) {
  console.log('  symbol at `m.default`   : undefined (no alias resolved -> no panic)');
  watch.close?.();
  console.log('  DONE (no panic)');
  process.exit(0);
}
const isAlias = Boolean(symbol.flags & ts.SymbolFlags.Alias);
const declarations = symbol.getDeclarations();

const describe = (value) =>
  value === undefined ? 'undefined' : Array.isArray(value) ? `[] (Array, length ${value.length})` : String(value);

console.log(`  symbol name              : ${symbol.getName()}`);
console.log(`  is alias                 : ${isAlias}`);
console.log(`  getDeclarations()        : ${describe(declarations)}`);
console.log(`  guard \`getDeclarations() && …\` passes : ${Boolean(declarations)}`);

// Exactly what no-deprecated does next:
const target = declarations && checker.getImmediateAliasedSymbol(symbol); // <-- bridge panics here
console.log(`  getImmediateAliasedSymbol: ${target ? target.getName() : String(target)}`);

watch.close?.();
console.log('  DONE (no panic)');
