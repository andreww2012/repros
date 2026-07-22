// Compares how `stable typescript` vs `typescript-native-bridge` populate
// `symbol.declarations` for a transient (mapped-type) property symbol, when the
// symbol is obtained from a checker attached to a WATCH/builder program (the
// program kind `@typescript-eslint/typescript-estree` creates for
// `parserOptions.project`).
//
// JS-based TypeScript: `declarations` is `undefined`.
// The bridge:          `declarations` is `[]` (an empty array).
//
// Both builds share the same TypeScript 6.0.3 JS API — the bridge is built
// from it — so the only difference is the checker (JS vs tsgo). They are
// installed side by side (`typescript` = bridge, `typescript-js` =
// typescript@6.0.3) so a single process can inspect both.
import {createRequire} from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const NOOP = () => {};
const NOOP_WATCHER = {close: NOOP};

const getTransientPropertySymbol = (moduleName) => {
  const ts = require(moduleName);

  // A watch program, set up the way typescript-estree does: real `ts.sys`, an
  // abstract builder, and neutralized file/dir watchers + timers so nothing
  // stays live and the checker is fully synchronous.
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
  const afterProgramCreate = host.afterProgramCreate?.bind(host);
  host.afterProgramCreate = (builder) => {
    builderProgram = builder;
    afterProgramCreate?.(builder);
  };

  const watch = ts.createWatchProgram(host);
  const program = (builderProgram ?? watch.getProgram()).getProgram();
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(path.resolve('src.ts'));

  // Locate the `log` in `service.log(...)` — the callee `no-deprecated` inspects.
  let nameNode;
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'log') {
      nameNode = node.name;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const symbol = checker.getSymbolAtLocation(nameNode);
  const aliasedSymbol =
    symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

  watch.close?.();

  return {version: ts.version, aliasedSymbol};
};

const describe = (declarations) => {
  if (declarations === undefined) {
    return 'undefined';
  }
  if (Array.isArray(declarations)) {
    return `[] (Array, length ${declarations.length})`;
  }
  return String(declarations);
};

for (const moduleName of ['typescript-js', 'typescript']) {
  const {version, aliasedSymbol} = getTransientPropertySymbol(moduleName);
  const {declarations} = aliasedSymbol;

  // This is the exact expression from `@typescript-eslint/eslint-plugin`'s
  // `no-deprecated` rule (getCallLikeDeprecation):
  //   const symbolDeclarationKind = aliasedSymbol?.declarations?.[0].kind;
  // `?.` guards a nullish `declarations`, but NOT an empty array: `[]?.[0]` is
  // `undefined`, and reading `.kind` off it throws.
  let ruleAccess;
  try {
    ruleAccess = `ok (kind = ${aliasedSymbol?.declarations?.[0].kind})`;
  } catch (error) {
    ruleAccess = `THROWS -> ${error.constructor.name}: ${error.message}`;
  }

  const label =
    moduleName === 'typescript' ? 'typescript-native-bridge' : 'typescript (JS-based)';
  console.log(`\n${label} (v${version})`);
  console.log(`  aliasedSymbol.declarations         : ${describe(declarations)}`);
  console.log(`  no-deprecated: declarations?.[0].kind : ${ruleAccess}`);
}

console.log();
