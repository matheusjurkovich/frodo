import {addCell, hourStart} from '../../shared/consumption.js';
import type {ModelGroups, UsageCell} from '../../shared/consumption.js';
import {resetNote} from '../../shared/meter.js';
import type {Meter} from '../../shared/meter.js';

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

type Json = Record<string, unknown>;
type Mutable<T> = {-readonly [K in keyof T]: T[K]};

const FAMILIES = ['codex-gpt', 'codex-codex', 'codex-mini', 'codex-other'];

function isJson(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function count(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

export function parseCodexLine(line: string): CodexLine | null {
    let data: unknown;
    try {
        data = JSON.parse(line);
    } catch {
        return null;
    }
    if (!isJson(data) || typeof data.type !== 'string' || !isJson(data.payload) || typeof data.timestamp !== 'string') return null;
    const at = Date.parse(data.timestamp);
    return Number.isNaN(at) ? null : {at, type: data.type, payload: data.payload};
}

function rateWindow(value: unknown, at: number): RateWindow | null {
    if (!isJson(value) || typeof value.used_percent !== 'number') return null;
    const resetsAt =
        typeof value.resets_at === 'number'
            ? value.resets_at * 1000
            : typeof value.resets_in_seconds === 'number'
              ? at + value.resets_in_seconds * 1000
              : null;
    if (resetsAt === null) return null;
    return {usedPercent: value.used_percent, windowMinutes: count(value.window_minutes), resetsAt};
}

function limitsOf(line: CodexLine): CodexLimits | null {
    const {payload} = line;
    if (line.type !== 'event_msg' || payload.type !== 'token_count' || !isJson(payload.rate_limits)) return null;
    const limits = payload.rate_limits;
    return {
        plan: text(limits.plan_type),
        primary: rateWindow(limits.primary, line.at),
        secondary: rateWindow(limits.secondary, line.at),
        at: line.at,
    };
}

export function latestLimits(content: string): CodexLimits | null {
    for (const line of content.split('\n').reverse()) {
        if (!line.includes('"rate_limits"')) continue;
        const parsed = parseCodexLine(line);
        const limits = parsed && limitsOf(parsed);
        if (limits) return limits;
    }
    return null;
}

export function readRollout(content: string): CodexRollout {
    const cells = new Map<string, UsageCell>();
    let id: string | null = null;
    let project = '';
    let model = '';
    let previousTotal: number | null = null;
    let session: Mutable<CodexSession> | null = null;
    let limits: CodexLimits | null = null;

    for (const raw of content.split('\n')) {
        const line = parseCodexLine(raw);
        if (!line) continue;
        const {payload} = line;
        if (line.type === 'session_meta') {
            id ??= text(payload.id);
            project = (text(payload.cwd) ?? '').split('/').filter(Boolean).pop() ?? '';
            continue;
        }
        if (line.type === 'turn_context') {
            model = text(payload.model) ?? model;
            continue;
        }
        if (line.type !== 'event_msg' || payload.type !== 'token_count') continue;
        limits = limitsOf(line) ?? limits;
        const info = payload.info;
        if (!isJson(info) || !isJson(info.last_token_usage)) continue;
        const total = isJson(info.total_token_usage) ? info.total_token_usage.total_tokens : undefined;
        if (typeof total === 'number' && total === previousTotal) continue;
        if (typeof total === 'number') previousTotal = total;
        const last = info.last_token_usage;
        const cached = count(last.cached_input_tokens);
        const input = Math.max(0, count(last.input_tokens) - cached);
        const output = count(last.output_tokens);
        if (input + cached + output === 0) continue;
        addCell(cells, {hour: hourStart(line.at), model, project, session: id ?? '', input, output, cacheRead: cached});
        session ??= {model, tokens: 0, contextTokens: 0, contextWindow: 0, startedAt: line.at, lastAt: line.at};
        session.model = model;
        session.tokens += input + output;
        session.contextTokens = input + cached + output;
        session.contextWindow = count(info.model_context_window) || session.contextWindow;
        session.lastAt = line.at;
    }
    return {id, cells: [...cells.values()], session: id ? session : null, limits};
}

export function planLabel(plan: string | null): string | null {
    if (!plan) return null;
    return plan
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map(capitalize)
        .join(' ');
}

function capitalize(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

function codexFamily(model: string): string {
    const name = model.toLowerCase();
    if (name.includes('mini')) return 'codex-mini';
    if (name.includes('codex')) return 'codex-codex';
    if (name.startsWith('gpt')) return 'codex-gpt';
    return 'codex-other';
}

function codexLabel(model: string): string {
    if (!model.toLowerCase().startsWith('gpt-')) return model || 'Outro';
    const [version = '', ...rest] = model.slice(4).split('-');
    return [`GPT-${version}`, ...rest.map(capitalize)].join(' ');
}

export const CODEX_MODELS: ModelGroups = {order: FAMILIES, family: codexFamily, label: codexLabel};

function windowName(minutes: number): string {
    if (minutes > 0 && minutes % (7 * 24 * 60) === 0) return 'Semana';
    if (minutes > 0 && minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} dias`;
    if (minutes > 0 && minutes % 60 === 0) return `Janela de ${minutes / 60} h`;
    return `Janela de ${minutes} min`;
}

function windowMeter(key: string, window: RateWindow, nowMs: number): Meter {
    const label = windowName(window.windowMinutes);
    const expired = window.resetsAt <= nowMs;
    return {
        key,
        label,
        short: label.replace('Janela de ', 'Janela '),
        percent: expired ? 0 : window.usedPercent,
        note: resetNote(window.resetsAt, nowMs),
    };
}

export function codexMeters(limits: CodexLimits | null, nowMs: number): Meter[] {
    if (!limits) return [];
    const meters: Meter[] = [];
    if (limits.primary) meters.push(windowMeter('session', limits.primary, nowMs));
    if (limits.secondary) meters.push(windowMeter('weekly', limits.secondary, nowMs));
    return meters;
}
