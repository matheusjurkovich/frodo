import type {Disposer} from '../../shared/disposables.types.js';

export type Subscription = (callback: () => void) => Disposer;

export interface MappedHooks {
    readonly start?: () => void;
    readonly stop?: () => void;
}
