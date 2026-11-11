import type {RolloutParser} from './codex-usage.js';
import type {CodexRollout} from './codex-usage.types.js';

export interface Found {
    readonly path: string;
    readonly key: string;
    readonly modified: number;
    readonly size: number;
}

export interface Listing {
    readonly found: Found[];
    readonly complete: boolean;
}

export interface Tracked {
    readonly key: string;
    readonly offset: number;
    readonly parser: RolloutParser;
    readonly value: CodexRollout;
}

export interface Cached<T> {
    readonly key: string;
    readonly value: T;
}
