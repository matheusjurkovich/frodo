import type {ClaudeIndex} from './claude-index.js';

export interface Cache {
    index: ClaudeIndex;
    offsets: Map<string, number>;
}

export interface Found {
    size: number;
    modified: number;
}

export interface Listing {
    found: Map<string, Found>;
    roots: string[];
}
