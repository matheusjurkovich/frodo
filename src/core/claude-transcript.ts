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

type Json = Record<string, unknown>;

const SYNTHETIC_MODEL = '<synthetic>';
const ASSISTANT_MARK = '"type":"assistant"';
const NEWLINE = 0x0a;
const SMALL_WINDOW = 200_000;
const LARGE_WINDOW = 1_000_000;

function isJson(value: unknown): value is Json {
    return typeof value === 'object' && value !== null;
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

function count(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function todosOf(content: unknown): TranscriptEntry['todos'] {
    if (!Array.isArray(content)) return null;
    let todos: TranscriptEntry['todos'] = null;
    for (const block of content as unknown[]) {
        if (!isJson(block) || block.type !== 'tool_use' || block.name !== 'TodoWrite') continue;
        const items = isJson(block.input) ? block.input.todos : null;
        if (!Array.isArray(items)) continue;
        const done = (items as unknown[]).filter(item => isJson(item) && item.status === 'completed').length;
        todos = {done, total: items.length};
    }
    return todos;
}

export function parseAssistantLine(line: string): TranscriptEntry | null {
    if (!line.includes(ASSISTANT_MARK)) return null;
    let data: unknown;
    try {
        data = JSON.parse(line);
    } catch {
        return null;
    }
    if (!isJson(data) || data.type !== 'assistant' || !isJson(data.message) || !isJson(data.message.usage)) return null;
    const {message} = data;
    const usage = message.usage as Json;
    const id = text(message.id);
    const model = text(message.model);
    const sessionId = text(data.sessionId);
    const timestamp = typeof data.timestamp === 'string' ? Date.parse(data.timestamp) : NaN;
    if (!id || !model || model === SYNTHETIC_MODEL || !sessionId || Number.isNaN(timestamp)) return null;
    return {
        usage: {
            id,
            timestamp,
            model,
            project: (text(data.cwd) ?? '').split('/').filter(Boolean).pop() ?? '',
            sessionId,
            input: count(usage.input_tokens),
            output: count(usage.output_tokens),
            cacheRead: count(usage.cache_read_input_tokens),
            cacheWrite: count(usage.cache_creation_input_tokens),
        },
        branch: text(data.gitBranch),
        todos: todosOf(message.content),
        sidechain: data.isSidechain === true,
    };
}

export function completeLines(bytes: Uint8Array): {text: string; consumed: number} {
    const consumed = bytes.lastIndexOf(NEWLINE) + 1;
    return {text: new TextDecoder().decode(bytes.subarray(0, consumed)), consumed};
}

export function modelFamily(model: string): ModelFamily {
    const name = model.toLowerCase();
    if (name.includes('opus')) return 'Opus';
    if (name.includes('sonnet')) return 'Sonnet';
    if (name.includes('haiku')) return 'Haiku';
    return 'Outro';
}

export function modelDisplayName(model: string): string {
    const family = modelFamily(model);
    if (family === 'Outro') return model;
    const version = model
        .replace(/\[.*\]$/, '')
        .split('-')
        .filter(part => /^\d{1,2}$/.test(part))
        .join('.');
    return version ? `${family} ${version}` : family;
}

export function contextWindow(contextTokens: number): number {
    return contextTokens > SMALL_WINDOW ? LARGE_WINDOW : SMALL_WINDOW;
}
