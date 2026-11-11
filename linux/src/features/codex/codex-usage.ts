import {addCell, hourStart} from '../../shared/consumption.js';
import type {ModelGroups, UsageCell} from '../../shared/consumption.types.js';
import {capitalize} from '../../shared/format.js';
import {count, isRecord, text} from '../../shared/json.js';
import {resetNote} from '../../shared/meter.js';
import type {Meter} from '../../shared/meter.types.js';
import {DAY_DIR_SLACK_MS, FAMILIES} from './codex-usage.const.js';
import type {CodexLine, RateWindow, CodexLimits, CodexRollout, Mutable, CodexSession, Json} from './codex-usage.types.js';

export function parseCodexLine(line: string): CodexLine | null {
    let data: unknown;
    try {
        data = JSON.parse(line);
    } catch {
        return null;
    }
    if (!isRecord(data) || typeof data.type !== 'string' || !isRecord(data.payload) || typeof data.timestamp !== 'string') return null;
    const at = Date.parse(data.timestamp);
    return Number.isNaN(at) ? null : {at, type: data.type, payload: data.payload};
}

function rateWindow(value: unknown, at: number): RateWindow | null {
    if (!isRecord(value) || typeof value.used_percent !== 'number') return null;
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
    if (line.type !== 'event_msg' || payload.type !== 'token_count' || !isRecord(payload.rate_limits)) return null;
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

export class RolloutParser {
    readonly #cells = new Map<string, UsageCell>();
    #id: string | null = null;
    #project = '';
    #model = '';
    #previousTotal: number | null = null;
    #session: Mutable<CodexSession> | null = null;
    #limits: CodexLimits | null = null;

    feed(content: string): void {
        for (const raw of content.split('\n')) this.line(raw);
    }

    line(raw: string): boolean {
        const line = parseCodexLine(raw);
        if (!line) return false;
        const {payload} = line;
        if (line.type === 'session_meta') {
            this.#id ??= text(payload.id);
            this.#project = (text(payload.cwd) ?? '').split('/').filter(Boolean).pop() ?? '';
            return true;
        }
        if (line.type === 'turn_context') {
            this.#model = text(payload.model) ?? this.#model;
            return true;
        }
        if (line.type !== 'event_msg' || payload.type !== 'token_count') return true;
        this.#limits = limitsOf(line) ?? this.#limits;
        this.#count(line, payload);
        return true;
    }

    result(): CodexRollout {
        return {
            id: this.#id,
            cells: [...this.#cells.values()].map(cell => ({...cell})),
            session: this.#id && this.#session ? {...this.#session} : null,
            limits: this.#limits,
        };
    }

    #count(line: CodexLine, payload: Json): void {
        const info = payload.info;
        if (!isRecord(info) || !isRecord(info.last_token_usage)) return;
        const total = isRecord(info.total_token_usage) ? info.total_token_usage.total_tokens : undefined;
        if (typeof total === 'number' && total === this.#previousTotal) return;
        if (typeof total === 'number') this.#previousTotal = total;
        const last = info.last_token_usage;
        const cached = count(last.cached_input_tokens);
        const input = Math.max(0, count(last.input_tokens) - cached);
        const output = count(last.output_tokens);
        if (input + cached + output === 0) return;
        const model = this.#model;
        addCell(this.#cells, {
            hour: hourStart(line.at),
            model,
            project: this.#project,
            session: this.#id ?? '',
            input,
            output,
            cacheRead: cached,
        });
        const session = (this.#session ??= {model, tokens: 0, contextTokens: 0, contextWindow: 0, startedAt: line.at, lastAt: line.at});
        session.model = model;
        session.tokens += input + output;
        session.contextTokens = input + cached + output;
        session.contextWindow = count(info.model_context_window) || session.contextWindow;
        session.lastAt = line.at;
    }
}

export function readRollout(content: string): CodexRollout {
    const parser = new RolloutParser();
    parser.feed(content);
    return parser.result();
}

export function dayDirEnded(parts: readonly string[], since: number): boolean {
    const [year, month, day] = parts.map(Number);
    if (year === undefined || Number.isNaN(year)) return false;
    if (month !== undefined && Number.isNaN(month)) return false;
    if (day !== undefined && Number.isNaN(day)) return false;
    const end = new Date(
        year,
        month === undefined ? 12 : day === undefined ? month : month - 1,
        month === undefined ? 1 : day === undefined ? 1 : day + 1,
    );
    return end.getTime() + DAY_DIR_SLACK_MS <= since;
}

export function planLabel(plan: string | null): string | null {
    if (!plan) return null;
    return plan
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map(capitalize)
        .join(' ');
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

export const codexModels: ModelGroups = {order: FAMILIES, family: codexFamily, label: codexLabel};

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
