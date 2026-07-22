// `service.log` is a property synthesized by a mapped type, so its symbol is a
// transient property symbol with no backing declaration node. How TypeScript
// represents "no declarations" on such a symbol is what this repro probes.
declare const service: {[K in 'log' | 'info']: (message: string) => void};

service.log('hello');
