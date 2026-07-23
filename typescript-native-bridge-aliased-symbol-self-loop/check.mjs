// API-level reproduction of the self-returning alias.
//
// `@typescript-eslint`'s `consistent-type-exports` / `no-deprecated` walk a
// symbol's alias chain by repeatedly calling `checker.getImmediateAliasedSymbol`
// until it reaches a non-alias symbol (or `undefined`). This script resolves the
// `Baz` re-export symbol and replays exactly that walk (capped, so it never
// actually hangs), reporting where the chain ends.
//
// Two program-construction paths are compared, because the bug only shows up on
// one of them:
//
//   node check.mjs program <typescript-module>
//       Classic Program API (what `parserOptions.project` builds). The alias
//       chain resolves to the concrete value and TERMINATES — on stock
//       TypeScript AND on the bridge.
//
//   node check.mjs service
//       tsserver ProjectService API (what `parserOptions.projectService`
//       builds, via @typescript-eslint/parser). On the bridge,
//       `getImmediateAliasedSymbol` returns the alias symbol TO ITSELF, so the
//       walk can never terminate — a real rule loops until it crashes or hangs.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SRC = path.resolve('src.ts');
const CAP = 50;

// Replays the rule's alias walk. Returns how it ended.
const walkAliasChain = (checker, ts, startSymbol) => {
  let symbol = startSymbol;
  let previous;
  const chain = [];
  for (let depth = 0; depth < CAP; depth++) {
    const isAlias = Boolean(symbol.flags & ts.SymbolFlags.Alias);
    chain.push(symbol.getName());
    if (!isAlias) {
      return { end: 'value', chain, note: `resolved to a non-alias symbol \`${symbol.getName()}\`` };
    }
    const next = checker.getImmediateAliasedSymbol(symbol);
    if (!next) {
      return { end: 'undefined', chain, note: 'getImmediateAliasedSymbol returned undefined' };
    }
    if (next === symbol || next === previous) {
      return { end: 'self', chain, note: `getImmediateAliasedSymbol(\`${symbol.getName()}\`) returned the SAME symbol` };
    }
    previous = symbol;
    symbol = next;
  }
  return { end: 'cap', chain, note: `still an alias after ${CAP} hops` };
};

const findExportSpecifierSymbolFromProgram = (program, checker, ts) => {
  const sourceFile = program.getSourceFile(SRC);
  let specifier;
  const visit = (node) => {
    if (ts.isExportSpecifier(node)) {
      specifier = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return checker.getSymbolAtLocation(specifier.name);
};

const report = ({ end, chain, note }) => {
  console.log(`  alias chain              : ${chain.join(' -> ')}`);
  console.log(`  ${note}`);
  if (end === 'self' || end === 'cap') {
    console.log('  => NON-TERMINATING: a rule walking this chain loops forever ❌');
  } else {
    console.log('  => terminates cleanly ✅');
  }
};

const mode = process.argv[2];

if (mode === 'program') {
  // Classic Program path — resolvable module name lets us point at either the
  // bridge (`typescript`) or stock (`typescript-js`).
  const moduleName = process.argv[3] || 'typescript';
  const ts = require(moduleName);
  const label = moduleName === 'typescript-js' ? 'stock typescript (JS-based)' : 'typescript-native-bridge';
  console.log(`\n[Program path] ${label} (v${ts.version})`);

  const noop = () => {};
  const host = ts.createWatchCompilerHost(
    path.resolve('tsconfig.json'),
    {},
    ts.sys,
    ts.createAbstractBuilder,
    noop,
    noop,
  );
  host.watchFile = () => ({ close: noop });
  host.watchDirectory = () => ({ close: noop });
  host.setTimeout = undefined;
  host.clearTimeout = undefined;
  let builder;
  host.afterProgramCreate = (b) => {
    builder = b;
  };
  const watch = ts.createWatchProgram(host);
  const program = (builder ?? watch.getProgram()).getProgram();
  const checker = program.getTypeChecker();
  const symbol = findExportSpecifierSymbolFromProgram(program, checker, ts);
  report(walkAliasChain(checker, ts, symbol));
  watch.close?.();
} else if (mode === 'service') {
  // ProjectService path — this is what ESLint uses. The parser requires
  // `typescript`, which the install resolves to the bridge.
  const parser = (await import('typescript-eslint')).default.parser;
  const ts = require('typescript');
  console.log(`\n[ProjectService path] typescript-native-bridge (v${ts.version})`);

  const code = fs.readFileSync(SRC, 'utf8');
  const { ast, services } = parser.parseForESLint(code, {
    filePath: SRC,
    projectService: true,
    tsconfigRootDir: process.cwd(),
    loc: true,
    range: true,
    comment: true,
  });
  const checker = services.program.getTypeChecker();
  let exported;
  const walk = (node) => {
    if (!node || typeof node.type !== 'string') {
      return;
    }
    if (node.type === 'ExportSpecifier') {
      exported = node.exported;
    }
    for (const key in node) {
      if (key === 'parent') {
        continue;
      }
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value.type === 'string') {
        walk(value);
      }
    }
  };
  walk(ast);
  const symbol = services.getSymbolAtLocation(exported);
  report(walkAliasChain(checker, ts, symbol));
} else {
  console.error('usage: node check.mjs program <typescript-module> | node check.mjs service');
  process.exit(1);
}
