import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';

// The three rules below all reduce to one question — "is this type a string?" —
// answered via the type parameter's constraint. They are enabled explicitly (not
// via a preset) to show the bug needs no "rule set load": a single file with a
// single generic function reproduces it deterministically.
export default tseslint.config({
  files: ['src.ts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint.plugin,
    unicorn,
  },
  rules: {
    '@typescript-eslint/no-base-to-string': ['error', {checkUnknown: true}],
    '@typescript-eslint/restrict-template-expressions': 'error',
    'unicorn/no-unsafe-property-key': 'error',
  },
});
