import type {PillActivity} from './activity-feed.types.js';

export type QueueKind = Exclude<PillActivity['kind'], 'notification' | 'volume' | 'decision'>;

export type QueueNames = {
    readonly [K in QueueKind]: (activity: Extract<PillActivity, {kind: K}>) => string;
};
