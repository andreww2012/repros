// Compares the empty-string LITERAL TYPE (`''`) produced by `stable typescript`
// vs `typescript-native-bridge`, on a checker attached to a WATCH/builder
// program (the program kind `@typescript-eslint/typescript-estree` creates for
// `parserOptions.project`).
//
// JS-based TypeScript: the type's `.value` is `""` (the empty string).
// The bridge:          the type's `.value` is `undefined`.
//
// The literal's `.flags` and `.isStringLiteral()` agree in both builds — only
// the `.value` payload is dropped. `@typescript-eslint`'s `unbound-method` rule
// does `part.value.toString()`, which throws on `undefined`.
//
// Both builds share the same TypeScript 6.0.3 JS API — the bridge is built from
// it — so the only difference is the checker (JS vs tsgo). They are installed
// side by side (`typescript` = bridge, `typescript-js` = typescript@6.0.3) so a
// single process can inspect both. A `ts.createProgram` run of the bridge is
// added at the end to show the divergence is specific to the watch/builder
// program.
import {createRequire} from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const NOOP = () => {};
const NOOP_WATCHER = {close: NOOP};

// Finds the `''` argument of `settings['']` and returns its type.
const emptyStringKeyType = (ts, program) => {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(path.resolve('src.ts'));

  let type;
  const visit = (node) => {
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === ''
    ) {
      type = checker.getTypeAtLocation(node.argumentExpression);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return type;
};

// A watch program, set up the way typescript-estree does: real `ts.sys`, an
// abstract builder, and neutralized file/dir watchers + timers so nothing stays
// live and the checker is fully synchronous.
const viaWatchProgram = (moduleName) => {
  const ts = require(moduleName);

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
  const type = emptyStringKeyType(ts, program);
  watch.close?.();

  return {version: ts.version, type};
};

const viaCreateProgram = (moduleName) => {
  const ts = require(moduleName);
  const program = ts.createProgram([path.resolve('src.ts')], {
    strict: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
  });

  return {version: ts.version, type: emptyStringKeyType(ts, program)};
};

// The exact expression from `@typescript-eslint/eslint-plugin`'s unbound-method
// rule (getAccessedPropertyNames): `part.value.toString()`.
const ruleAccess = (type) => {
  try {
    return `ok -> ${JSON.stringify(type.value.toString())}`;
  } catch (error) {
    return `THROWS -> ${error.constructor.name}: ${error.message}`;
  }
};

const report = (label, {version, type}, {withRuleAccess = true} = {}) => {
  console.log(`\n${label} (v${version})`);
  console.log(`  type.flags               : ${type.flags}`);
  console.log(`  type.isStringLiteral()   : ${type.isStringLiteral()}`);
  console.log(`  type.value               : ${JSON.stringify(type.value)} (typeof ${typeof type.value})`);
  if (withRuleAccess) {
    console.log(`  unbound-method: value.toString() : ${ruleAccess(type)}`);
  }
};

console.log('WATCH/builder program (what parserOptions.project uses):');
report('typescript (JS-based)   ', viaWatchProgram('typescript-js'));
report('typescript-native-bridge', viaWatchProgram('typescript'));

console.log('\n----------------------------------------------------------------');
console.log('ts.createProgram (no watch/builder) — for contrast:');
report('typescript-native-bridge', viaCreateProgram('typescript'), {withRuleAccess: false});

console.log();
