import type {UsageCell} from '../../shared/consumption.types.js';

export interface SessionStats {
    readonly tokens: number;
    readonly model: string;
    readonly contextTokens: number;
    readonly branch: string | null;
    readonly startedAt: number;
    readonly lastAt: number;
    readonly todos: {done: number; total: number} | null;
}

export type Cell = UsageCell;

export interface Session extends Mutable<SessionStats> {
    todosAt: number;
    mainAt: number;
}

export interface Seen {
    at: number;
    output: number;
}

export type Mutable<T> = {-readonly [K in keyof T]: T[K]};
