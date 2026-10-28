import {addCell, hourStart} from '../../shared/consumption.js';
import type {ModelGroups, UsageCell} from '../../shared/consumption.js';
import {clockTime} from '../../shared/meter.js';
import type {Meter} from '../../shared/meter.js';

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

type Json = Record<string, unknown>;

export const GEMINI_PER_MINUTE_LIMIT = 60;
const PACIFIC = 'America/Los_Angeles';
const MINUTE_MS = 60_000;
const HASH = /^[0-9a-f]{64}$/;
const FAMILIES = ['gemini-pro', 'gemini-flash', 'gemini-other'];
const DROPPED_WORDS = new Set(['preview', 'exp', 'latest']);

const pacificParts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
});

function isJson(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function request(value: unknown): GeminiRequest | null {
    if (!isJson(value) || value.type !== 'gemini' || !isJson(value.tokens) || typeof value.id !== 'string') return null;
    const at = typeof value.timestamp === 'string' ? Date.parse(value.timestamp) : NaN;
    if (Number.isNaN(at)) return null;
    const {tokens} = value;
    const cached = count(tokens.cached);
    return {
        id: value.id,
        at,
        model: typeof value.model === 'string' ? value.model : '',
        input: Math.max(0, count(tokens.input) - cached) + count(tokens.tool),
        output: count(tokens.output) + count(tokens.thoughts),
        cacheRead: cached,
    };
}

function records(content: string): unknown[] {
    try {
        const whole: unknown = JSON.parse(content);
        return isJson(whole) && Array.isArray(whole.messages) ? [whole, ...(whole.messages as unknown[])] : [whole];
    } catch {
        return content.split('\n').flatMap(line => {
            try {
                return [JSON.parse(line) as unknown];
            } catch {
                return [];
            }
        });
    }
}

export function parseGeminiSession(content: string): GeminiSession | null {
    let id: string | null = null;
    const requests = new Map<string, GeminiRequest>();
    const add = (value: unknown): void => {
        const found = request(value);
        if (found) requests.set(found.id, found);
    };
    for (const record of records(content)) {
        if (!isJson(record)) continue;
        if (id === null && typeof record.sessionId === 'string') id = record.sessionId;
        if (isJson(record.$set) && Array.isArray(record.$set.messages)) (record.$set.messages as unknown[]).forEach(add);
        add(record);
    }
    return id === null ? null : {id, requests: [...requests.values()]};
}

export function geminiCells(requests: Iterable<GeminiRequest>, project: string, session: string): UsageCell[] {
    const cells = new Map<string, UsageCell>();
    for (const {at, model, input, output, cacheRead} of requests)
        addCell(cells, {hour: hourStart(at), model, project, session, input, output, cacheRead});
    return [...cells.values()];
}

export function parseProjects(content: string | null): [string, string][] {
    try {
        const data: unknown = JSON.parse(content ?? '');
        if (!isJson(data) || !isJson(data.projects)) return [];
        return Object.entries(data.projects).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    } catch {
        return [];
    }
}

export function projectName(dir: string, namesByHash: ReadonlyMap<string, string>): string {
    return HASH.test(dir) ? (namesByHash.get(dir) ?? 'outro') : dir;
}

function pacificWall(ms: number): number[] {
    const parts = new Map(pacificParts.formatToParts(new Date(ms)).map(part => [part.type, Number(part.value)]));
    return (['year', 'month', 'day', 'hour', 'minute', 'second'] as const).map(type => parts.get(type) ?? 0);
}

function pacificOffset(ms: number): number {
    const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = pacificWall(ms);
    return Date.UTC(year, month - 1, day, hour, minute, second) - Math.floor(ms / 1000) * 1000;
}

function pacificMidnight(year: number, month: number, day: number): number {
    const wall = Date.UTC(year, month - 1, day);
    const guess = wall - pacificOffset(wall);
    return wall - pacificOffset(guess);
}

function pacificDate(ms: number): [number, number, number] {
    const [year = 0, month = 1, day = 1] = pacificWall(ms);
    return [year, month, day];
}

export function pacificDayStart(nowMs: number): number {
    return pacificMidnight(...pacificDate(nowMs));
}

export function nextPacificReset(nowMs: number): number {
    const [year, month, day] = pacificDate(nowMs);
    return pacificMidnight(year, month, day + 1);
}

export function geminiQuota(times: Iterable<number>, limit: number, nowMs: number): GeminiQuota {
    const start = pacificDayStart(nowMs);
    let requests = 0;
    let perMinute = 0;
    for (const at of times) {
        if (at < start || at > nowMs) continue;
        requests++;
        if (at > nowMs - MINUTE_MS) perMinute++;
    }
    return {requests, limit, perMinute, resetsAt: nextPacificReset(nowMs)};
}

function geminiFamily(model: string): string {
    const name = model.toLowerCase();
    if (name.includes('flash')) return 'gemini-flash';
    if (name.includes('pro')) return 'gemini-pro';
    return 'gemini-other';
}

function geminiLabel(model: string): string {
    if (!model.toLowerCase().startsWith('gemini-')) return model || 'Outro';
    const [version = '', ...rest] = model.slice(7).split('-');
    const words = rest
        .filter(word => !DROPPED_WORDS.has(word) && !/^\d+$/.test(word))
        .map(word => word.charAt(0).toUpperCase() + word.slice(1));
    return ['Gemini', version, ...words].join(' ');
}

export const GEMINI_MODELS: ModelGroups = {order: FAMILIES, family: geminiFamily, label: geminiLabel};

export function geminiMeters(quota: GeminiQuota | null): Meter[] {
    if (!quota) return [];
    const count = (n: number): string => n.toLocaleString('pt-BR');
    return [
        {
            key: 'daily',
            label: 'Pedidos hoje (estimado)',
            short: 'Pedidos hoje',
            percent: quota.limit > 0 ? (quota.requests / quota.limit) * 100 : 0,
            note: `${count(quota.requests)} de ${count(quota.limit)} · reinicia às ${clockTime(quota.resetsAt)}`,
        },
        {
            key: 'minute',
            label: 'Pedidos por minuto (estimado)',
            short: 'Por minuto',
            percent: (quota.perMinute / GEMINI_PER_MINUTE_LIMIT) * 100,
            note: `${quota.perMinute} de ${GEMINI_PER_MINUTE_LIMIT} no último minuto`,
        },
    ];
}
