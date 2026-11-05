export interface GeminiRequest {
    readonly id: string;
    readonly at: number;
    readonly model: string;
    readonly input: number;
    readonly output: number;
    readonly cacheRead: number;
}

export interface GeminiSession {
    readonly id: string;
    readonly requests: readonly GeminiRequest[];
}

export interface GeminiQuota {
    readonly requests: number;
    readonly limit: number;
    readonly perMinute: number;
    readonly resetsAt: number;
}

export type Json = Record<string, unknown>;
