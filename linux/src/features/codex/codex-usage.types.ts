import type {UsageCell} from '../../shared/consumption.types.js';

export interface RateWindow {
    readonly usedPercent: number;
    readonly windowMinutes: number;
    readonly resetsAt: number;
}

export interface CodexLimits {
    readonly plan: string | null;
    readonly primary: RateWindow | null;
    readonly secondary: RateWindow | null;
    readonly at: number;
}

export interface CodexSession {
    readonly model: string;
    readonly tokens: number;
    readonly contextTokens: number;
    readonly contextWindow: number;
    readonly startedAt: number;
    readonly lastAt: number;
}

export interface CodexLine {
    readonly at: number;
    readonly type: string;
    readonly payload: Json;
}

export interface CodexRollout {
    readonly id: string | null;
    readonly cells: readonly UsageCell[];
    readonly session: CodexSession | null;
    readonly limits: CodexLimits | null;
}

export type Json = Record<string, unknown>;
export type Mutable<T> = {-readonly [K in keyof T]: T[K]};
