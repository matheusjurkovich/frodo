import type {ActivityKind} from '../pill/activity-priority.types.js';

export interface CoverInput {
    readonly fullscreen: boolean;
    readonly maximized: boolean;
    readonly alwaysShowPill: boolean;
    readonly kind: ActivityKind | undefined;
    readonly peeking: boolean;
}

export interface Cover {
    readonly covered: boolean;
    readonly pillWanted: boolean;
}

export interface TongueInput {
    readonly covered: boolean;
    readonly fullscreen: boolean;
    readonly open: boolean;
    readonly pillVisible: boolean;
}
