import type {Level} from '../../shared/level.types.js';

export interface ClaudeTabActions {
    readonly openSettings: () => void;
    readonly close: () => void;
}

export interface MeterOptions {
    readonly name: string;
    readonly percent: number | null;
    readonly level: Level;
    readonly details: readonly string[];
    readonly pace?: number | null;
}
