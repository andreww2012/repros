import tseslint from 'typescript-eslint';

// The bug needs a type-aware rule *set* running together (a single rule alone
// does not trigger it), so we use the standard strict-type-checked preset.
export default tseslint.config(...tseslint.configs.strictTypeChecked, {
  files: ['src.ts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
