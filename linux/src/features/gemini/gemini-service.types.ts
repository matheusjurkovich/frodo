import type {GeminiSessionParser} from './gemini-usage.js';
import type {GeminiRequest} from './gemini-usage.types.js';

export interface Found {
    readonly path: string;
    readonly key: string;
    readonly modified: number;
    readonly size: number;
    readonly project: string;
    readonly parent: string | null;
}

export interface Listing {
    readonly found: Found[];
    readonly complete: boolean;
}

export interface Loaded {
    readonly key: string;
    readonly modified: number;
    readonly offset: number;
    readonly parser: GeminiSessionParser | null;
    readonly id: string;
    readonly project: string;
    readonly session: string;
    readonly requests: readonly GeminiRequest[];
}
