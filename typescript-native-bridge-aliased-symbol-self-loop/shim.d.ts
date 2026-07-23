// A wildcard ambient module with a `default` export — the generic form of the
// `declare module '*.svg'` / `'*.css'` / `'*.graphql'` / `'*.vue'` shims that
// every bundler-based project ships. No real `*.foo` file exists on disk; the
// import specifier `./thing.foo` resolves to this ambient declaration.
declare module '*.foo' {
  const bar: { readonly label: string };
  export default bar;
}
