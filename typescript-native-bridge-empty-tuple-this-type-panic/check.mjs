// Asks the checker for the type of an empty array literal that is contextually
// typed as the empty tuple. Run once per build in its own subprocess — a native
// panic kills the process, so it cannot be caught or continued past.
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

let annotation;
let literal;
let conditional;
const collect = (node) => {
  if (ts.isTupleTypeNode(node)) {
    annotation ??= node;
  }
  if (ts.isArrayLiteralExpression(node)) {
    literal ??= node;
  }
  if (ts.isConditionalExpression(node)) {
    conditional ??= node;
  }
  ts.forEachChild(node, collect);
};
ts.forEachChild(sourceFile, collect);

console.log(`${build} (v${ts.version})`);

console.log('  getTypeAtLocation(<the `[]` type ANNOTATION>)');
console.log(`    -> ${checker.typeToString(checker.getTypeAtLocation(annotation))}`);

console.log('  getTypeAtLocation(<the `[]` array LITERAL>)');
console.log(`    -> ${checker.typeToString(checker.getTypeAtLocation(literal))}`);

// What no-unsafe-return does: enumerate the constituents of the arrow body type.
const bodyType = checker.getTypeAtLocation(conditional);
console.log(`  reading .types of ${checker.typeToString(bodyType)}`);
console.log(`    -> ${bodyType.types.length} constituents`);

console.log('  DONE (no panic)');
watch.close();
