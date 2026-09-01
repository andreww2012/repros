// Asks the checker for the type of a type-only import clause. Run once per build
// in its own subprocess — on the bridge this is a native panic that kills the
// process, so the `try/catch` below only ever helps the JS-based build.
import path from 'node:path';
import {createRequire} from 'node:module';

const build = process.argv[2] ?? 'typescript';
const ts = createRequire(import.meta.url)(build);

const here = import.meta.dirname;
const srcFile = path.join(here, 'src.ts');

const host = ts.createWatchCompilerHost(
  path.join(here, 'tsconfig.json'),
  {},
  ts.sys,
  ts.createAbstractBuilder,
  () => {},
  () => {},
);
const watch = ts.createWatchProgram(host);
const program = watch.getProgram().getProgram();
const checker = program.getTypeChecker();
const sourceFile = program.getSourceFile(srcFile);

let importClause;
const collect = (node) => {
  if (ts.isImportClause(node)) {
    importClause ??= node;
  }
  ts.forEachChild(node, collect);
};
ts.forEachChild(sourceFile, collect);

console.log(`${build} (v${ts.version})`);
console.log(`  getTypeAtLocation(<the \`${importClause.getText(sourceFile)}\` import clause>)`);
try {
  console.log(`    -> ${checker.typeToString(checker.getTypeAtLocation(importClause))}`);
  console.log('  DONE (no panic)');
} catch (error) {
  console.log(`    -> threw, and it was CATCHABLE: ${error}`);
  console.log('  DONE (recoverable)');
}
watch.close();
