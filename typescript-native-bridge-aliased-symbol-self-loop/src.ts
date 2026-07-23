// A `default` re-export from a WILDCARD ambient module (`*.foo`, declared in
// shim.d.ts). This is the exact shape of a barrel file re-exporting a component
// from a bundler-shimmed module, e.g. `export { default as X } from './x.svg'`.
//
// The re-export creates an alias symbol whose immediate target is the synthetic
// `default` of the ambient module. On the bridge's tsserver ProjectService
// checker path (the one `@typescript-eslint`'s `parserOptions.projectService`
// uses), `checker.getImmediateAliasedSymbol` returns that alias symbol *to
// itself* instead of its target — see README. Any lint rule that walks the alias
// chain then loops forever.
export { default as Baz } from './thing.foo';
