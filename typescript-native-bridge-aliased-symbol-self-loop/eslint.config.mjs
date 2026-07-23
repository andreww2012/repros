import tseslint from 'typescript-eslint';

export default tseslint.config({
  files: ['src.ts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      // The bug is specific to this path. With `project: './tsconfig.json'`
      // (the classic Program path) the alias resolves and nothing loops.
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint.plugin,
  },
  rules: {
    // Walks the alias chain by RECURSION (`isSymbolTypeBased`), so the bridge's
    // self-returning alias overflows the stack — a fast, visible crash.
    '@typescript-eslint/consistent-type-exports': 'error',

    // Same root cause (also calls `getImmediateAliasedSymbol` while walking the
    // alias chain), but it uses a `while` loop instead of recursion, so it does
    // not crash — it HANGS forever. Left off so this repro terminates; enable it
    // to observe the hang.
    // '@typescript-eslint/no-deprecated': 'error',
  },
});
