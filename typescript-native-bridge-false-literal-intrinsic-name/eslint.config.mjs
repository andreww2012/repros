import tseslint from 'typescript-eslint';

// `prefer-optional-chain` runs with its default options, which include
// `checkBoolean: true`. That default is what lets a boolean operand reach the
// `intrinsicName === 'false'` guard that the bridge defeats.
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
  },
  rules: {
    '@typescript-eslint/prefer-optional-chain': 'error',
  },
});
