import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

const parserOptions = {
  projectService: true,
  tsconfigRootDir: import.meta.dirname,
  extraFileExtensions: ['.vue'],
};

export default [
  {
    files: ['*.ts'],
    languageOptions: {parser: tseslint.parser, parserOptions},
    plugins: {'@typescript-eslint': tseslint.plugin},
    rules: {'@typescript-eslint/no-unnecessary-condition': 'error'},
  },
  {
    files: ['*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {...parserOptions, parser: tseslint.parser},
    },
    plugins: {'@typescript-eslint': tseslint.plugin},
    rules: {'@typescript-eslint/no-unnecessary-condition': 'error'},
  },
];
