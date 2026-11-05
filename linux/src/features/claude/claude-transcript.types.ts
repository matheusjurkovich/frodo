export interface UsageRecord {
    readonly id: string;
    readonly timestamp: number;
    readonly model: string;
    readonly project: string;
    readonly sessionId: string;
    readonly input: number;
    readonly output: number;
    readonly cacheRead: number;
    readonly cacheWrite: number;
}

export interface TranscriptEntry {
    readonly usage: UsageRecord;
    readonly branch: string | null;
    readonly todos: {done: number; total: number} | null;
    readonly sidechain: boolean;
}

export type ModelFamily = 'Opus' | 'Sonnet' | 'Haiku' | 'Outro';
export type Json = Record<string, unknown>;
