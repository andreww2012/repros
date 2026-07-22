// `m.default` is the esModuleInterop-synthesized default of a CommonJS module.
// Its symbol is an alias with NO real declaration node. @typescript-eslint's
// no-deprecated rule walks the alias chain and calls
// `checker.getImmediateAliasedSymbol` on it — which panics NATIVELY on the
// bridge (see README). Mirrors real code like `(await import('some-cjs-plugin')).default`.
import * as m from './dep.cjs';

m.default;
