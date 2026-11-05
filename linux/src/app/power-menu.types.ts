import type {PowerActions} from '../shared/shell-internals.types.js';
import type {FrodoIconName} from '../shared/ui/icons.types.js';

export interface Entry {
    readonly text: string;
    readonly icon: FrodoIconName;
    readonly danger: boolean;
    available(actions: PowerActions): boolean;
    activate(actions: PowerActions): void;
}
