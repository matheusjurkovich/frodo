import type {GeminiRequest} from './gemini-usage.types.js';

export interface Found {
    readonly path: string;
    readonly key: string;
    readonly project: string;
    readonly parent: string | null;
}

export interface Loaded {
    readonly key: string;
    readonly id: string;
    readonly project: string;
    readonly session: string;
    readonly requests: readonly GeminiRequest[];
}
