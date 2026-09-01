// Asking the checker for the type of the `type {Thing}` import CLAUSE below
// panics natively (Go) on the bridge and kills the process. The JS-based
// TypeScript it is built from throws a catchable TypeError for the same query.
import type {Thing} from './other';

export const describe = (thing: Thing) => thing.name;
