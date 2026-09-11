// Asks the checker for the BASE TYPES of the empty tuple, once via the `[]` type
// annotation and once via the `[]` array literal. Run once per build in its own
// subprocess — on the bridge the literal case is a native panic that kills the
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

let annotation;
let literal;
const collect = (node) => {
  if (ts.isTupleTypeNode(node)) {
    annotation ??= node;
  }
  if (ts.isArrayLiteralExpression(node)) {
    literal ??= node;
  }
  ts.forEachChild(node, collect);
};
ts.forEachChild(sourceFile, collect);

const ask = (label, node) => {
  const type = checker.getTypeAtLocation(node);
  console.log(`  checker.getBaseTypes(<${label}>)   // ${checker.typeToString(type)}, objectFlags=${type.objectFlags ?? 0}`);
  try {
    const bases = checker.getBaseTypes(type);
    console.log(`    -> ${bases.length} base(s): ${bases.map((base) => checker.typeToString(base)).join(', ')}`);
  } catch (error) {
    console.log(`    -> threw, and it was CATCHABLE: ${error}`);
  }
};

console.log(`${build} (v${ts.version})`);
ask('the `[]` type ANNOTATION', annotation);
ask('the `[]` array LITERAL', literal);
console.log('  DONE (no panic)');

watch.close();
