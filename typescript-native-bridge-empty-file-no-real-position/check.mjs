// Opens an empty file through the TypeScript **project service** — the same way
// `@typescript-eslint` does for `parserOptions.projectService` — and reports the
// position the returned SourceFile carries. On the bridge it is -1 (TypeScript's
// "synthesized, no real position" marker), so `getStart()` fails the Debug
// assertion that `@typescript-eslint/typescript-estree` trips while converting.
import path from 'node:path';
import {createRequire} from 'node:module';

const build = process.argv[2] ?? 'typescript';
const require = createRequire(import.meta.url);

// Point the `typescript` module id at the requested build BEFORE
// @typescript-eslint/project-service resolves it, so one script can test both.
if (build !== 'typescript') {
  const Module = require('node:module');
  const realPath = require.resolve('typescript');
  const stub = new Module(realPath, undefined);
  stub.filename = realPath;
  stub.loaded = true;
  stub.exports = require(build);
  require.cache[realPath] = stub;
}

const ts = require('typescript');
const {createProjectService} = require('@typescript-eslint/project-service');

const here = import.meta.dirname;

const inspect = (label, fileName, contents) => {
  const filePath = path.join(here, fileName);
  const {service} = createProjectService({
    options: {},
    jsDocParsingMode: ts.JSDocParsingMode.ParseAll,
  });
  service.setHostConfiguration({preferences: {includePackageJsonAutoImports: 'off'}});
  service.openClientFile(filePath, contents, undefined, here);

  const scriptInfo = service.getScriptInfo(filePath);
  const program = service
    .getDefaultProjectForFile(scriptInfo.fileName, true)
    .getLanguageService(true)
    .getProgram();
  const sourceFile = program.getSourceFile(filePath);

  let start;
  try {
    start = String(sourceFile.getStart());
  } catch (error) {
    start = `threw: ${error.message}`;
  }
  console.log(`  ${label.padEnd(18)} pos=${String(sourceFile.pos).padStart(2)} end=${String(sourceFile.end).padStart(2)}   sourceFile.getStart() -> ${start}`);

  service.closeClientFile(filePath);
};

console.log(`${build} (v${ts.version})`);
inspect('empty.ts', 'empty.ts', '');
inspect('newline.ts', 'newline.ts', '\n');
