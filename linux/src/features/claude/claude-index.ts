import {modelDisplayName, modelFamily} from './claude-transcript.js';
import type {ModelFamily, TranscriptEntry, UsageRecord} from './claude-transcript.js';
import {weekdayLabel} from '../../shared/format.js';

export type Period = 'today' | '7d' | '30d';

export interface Bar {
    readonly label: string;
    readonly value: number;
    readonly current: boolean;
    readonly future: boolean;
}

export interface Share {
    readonly name: string;
    readonly label: string;
    readonly tokens: number;
    readonly fraction: number;
}

export interface ConsumptionSummary {
    readonly input: number;
    readonly output: number;
    readonly cacheRead: number;
    readonly sessions: number;
    readonly total: number;
    readonly bars: readonly Bar[];
    readonly models: readonly Share[];
    readonly projects: readonly Share[];
}

export interface SessionStats {
    readonly tokens: number;
    readonly model: string;
    readonly contextTokens: number;
    readonly branch: string | null;
    readonly startedAt: number;
    readonly lastAt: number;
    readonly todos: {done: number; total: number} | null;
}

interface Cell {
    hour: number;
    model: string;
    project: string;
    session: string;
    input: number;
    output: number;
    cacheRead: number;
}

interface Session extends Mutable<SessionStats> {
    todosAt: number;
    mainAt: number;
}

interface Seen {
    at: number;
    output: number;
}

interface Latest {
    tokens: number;
    hour: number;
    model: string;
}

type Mutable<T> = {-readonly [K in keyof T]: T[K]};

const VERSION = 4;
const KEPT_DAYS = 30;
const PERIOD_DAYS: Record<Period, number> = {today: 1, '7d': 7, '30d': KEPT_DAYS};
const FAMILIES: readonly ModelFamily[] = ['Opus', 'Sonnet', 'Haiku', 'Outro'];
const MAX_PROJECTS = 4;
const FIRST_HOUR = 8;
const LAST_HOUR = 18;
const LABEL_EVERY = 7;
const MAX_HOUR_LABELS = 12;

const pad = (n: number): string => String(n).padStart(2, '0');

function hourStart(ms: number): number {
    const date = new Date(ms);
    return ms - date.getMinutes() * 60_000 - date.getSeconds() * 1000 - date.getMilliseconds();
}

function dayStart(ms: number, daysBack = 0): number {
    const date = new Date(ms);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBack).getTime();
}

function cellKey(cell: Cell): string {
    return JSON.stringify([cell.hour, cell.model, cell.project, cell.session]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isCount(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isCell(value: unknown): value is Cell {
    return (
        isRecord(value) &&
        isCount(value.hour) &&
        typeof value.model === 'string' &&
        typeof value.project === 'string' &&
        typeof value.session === 'string' &&
        isCount(value.input) &&
        isCount(value.output) &&
        isCount(value.cacheRead)
    );
}

function isTodos(value: unknown): value is {done: number; total: number} {
    return isRecord(value) && isCount(value.done) && isCount(value.total);
}

function isSession(value: unknown): value is Session & {id: string} {
    return (
        isRecord(value) &&
        typeof value.id === 'string' &&
        isCount(value.tokens) &&
        typeof value.model === 'string' &&
        isCount(value.contextTokens) &&
        (value.branch === null || typeof value.branch === 'string') &&
        isCount(value.startedAt) &&
        isCount(value.lastAt) &&
        (value.todos === null || isTodos(value.todos)) &&
        isCount(value.todosAt) &&
        isCount(value.mainAt)
    );
}

function isSeen(value: unknown): value is Seen {
    return isRecord(value) && isCount(value.at) && isCount(value.output);
}

function share(name: string, label: string, tokens: number, total: number): Share {
    return {name, label, tokens, fraction: total > 0 ? tokens / total : 0};
}

function hourBars(slots: ReadonlyMap<number, number>, now: Date): Bar[] {
    const nowHour = now.getHours();
    const used = [...slots].filter(([, value]) => value > 0).map(([hour]) => hour);
    const first = Math.min(FIRST_HOUR, ...used);
    const last = Math.max(LAST_HOUR, nowHour);
    const length = last - first + 1;
    const step = length > MAX_HOUR_LABELS ? 2 : 1;
    return Array.from({length}, (_, i) => {
        const hour = first + i;
        const label = i % step === 0 ? `${pad(hour)}h` : '';
        return {label, value: slots.get(hour) ?? 0, current: hour === nowHour, future: hour > nowHour};
    });
}

function dayBars(slots: ReadonlyMap<number, number>, nowMs: number, period: '7d' | '30d'): Bar[] {
    const days = PERIOD_DAYS[period];
    return Array.from({length: days}, (_, i) => {
        const day = dayStart(nowMs, days - 1 - i);
        const date = new Date(day);
        const monthLabel = i % LABEL_EVERY === 0 ? `${date.getDate()}/${date.getMonth() + 1}` : '';
        return {
            label: period === '7d' ? weekdayLabel(date.getDay()) : monthLabel,
            value: slots.get(day) ?? 0,
            current: i === days - 1,
            future: false,
        };
    });
}

export class ClaudeIndex {
    private readonly cells = new Map<string, Cell>();
    private readonly sessions = new Map<string, Session>();
    private readonly ids = new Map<string, Seen>();

    has(id: string): boolean {
        return this.ids.has(id);
    }

    add({usage, branch, todos, sidechain}: TranscriptEntry): void {
        const seen = this.ids.get(usage.id);
        if (seen) {
            const extra = usage.output - seen.output;
            if (extra > 0) {
                seen.output = usage.output;
                this.count({...usage, input: 0, output: extra, cacheRead: 0, cacheWrite: 0});
            }
            if (todos && !sidechain) this.setTodos(usage.sessionId, usage.timestamp, todos);
            return;
        }
        this.ids.set(usage.id, {at: usage.timestamp, output: usage.output});
        const session = this.count(usage);
        if (sidechain) return;
        if (usage.timestamp >= session.mainAt) {
            session.model = usage.model;
            session.contextTokens = usage.input + usage.cacheRead + usage.cacheWrite;
            session.branch = branch;
            session.mainAt = usage.timestamp;
        }
        if (todos) this.setTodos(usage.sessionId, usage.timestamp, todos);
    }

    private count(usage: UsageRecord): Session {
        const cell: Cell = {
            hour: hourStart(usage.timestamp),
            model: usage.model,
            project: usage.project,
            session: usage.sessionId,
            input: 0,
            output: 0,
            cacheRead: 0,
        };
        const key = cellKey(cell);
        const target = this.cells.get(key) ?? cell;
        this.cells.set(key, target);
        target.input += usage.input;
        target.output += usage.output;
        target.cacheRead += usage.cacheRead;

        const session: Session = this.sessions.get(usage.sessionId) ?? {
            tokens: 0,
            model: '',
            contextTokens: 0,
            branch: null,
            startedAt: usage.timestamp,
            lastAt: usage.timestamp,
            todos: null,
            todosAt: 0,
            mainAt: 0,
        };
        this.sessions.set(usage.sessionId, session);
        session.tokens += usage.input + usage.output;
        session.startedAt = Math.min(session.startedAt, usage.timestamp);
        session.lastAt = Math.max(session.lastAt, usage.timestamp);
        return session;
    }

    setTodos(sessionId: string, timestamp: number, todos: {done: number; total: number}): void {
        const session = this.sessions.get(sessionId);
        if (!session || timestamp < session.todosAt) return;
        session.todos = {...todos};
        session.todosAt = timestamp;
    }

    prune(nowMs: number): void {
        const cutoff = dayStart(nowMs, KEPT_DAYS - 1);
        for (const [key, cell] of this.cells) if (cell.hour < cutoff) this.cells.delete(key);
        for (const [id, session] of this.sessions) if (session.lastAt < cutoff) this.sessions.delete(id);
        for (const [id, {at}] of this.ids) if (at < cutoff) this.ids.delete(id);
    }

    summary(period: Period, now: Date): ConsumptionSummary {
        const nowMs = now.getTime();
        const days = PERIOD_DAYS[period];
        const from = dayStart(nowMs, days - 1);
        const until = dayStart(nowMs, -1);
        const slots = new Map<number, number>();
        const sessions = new Set<string>();
        const models = new Map<ModelFamily, Latest>();
        const projects = new Map<string, number>();
        let input = 0;
        let output = 0;
        let cacheRead = 0;

        for (const cell of this.cells.values()) {
            if (cell.hour < from || cell.hour >= until) continue;
            const tokens = cell.input + cell.output;
            input += cell.input;
            output += cell.output;
            cacheRead += cell.cacheRead;
            sessions.add(cell.session);
            projects.set(cell.project, (projects.get(cell.project) ?? 0) + tokens);
            const family = modelFamily(cell.model);
            const latest = models.get(family) ?? {tokens: 0, hour: cell.hour, model: cell.model};
            models.set(family, latest);
            latest.tokens += tokens;
            if (cell.hour >= latest.hour) {
                latest.hour = cell.hour;
                latest.model = cell.model;
            }
            const slot = period === 'today' ? new Date(cell.hour).getHours() : dayStart(cell.hour);
            slots.set(slot, (slots.get(slot) ?? 0) + tokens);
        }

        const total = input + output;
        return {
            input,
            output,
            cacheRead,
            sessions: sessions.size,
            total,
            bars: period === 'today' ? hourBars(slots, now) : dayBars(slots, nowMs, period),
            models: FAMILIES.flatMap(family => {
                const latest = models.get(family);
                return latest && latest.tokens > 0 ? [share(family, modelDisplayName(latest.model), latest.tokens, total)] : [];
            }),
            projects: [...projects]
                .filter(([, tokens]) => tokens > 0)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .slice(0, MAX_PROJECTS)
                .map(([name, tokens]) => share(name, name, tokens, total)),
        };
    }

    session(id: string): SessionStats | null {
        const found = this.sessions.get(id);
        if (!found) return null;
        const {tokens, model, contextTokens, branch, startedAt, lastAt, todos} = found;
        return {tokens, model, contextTokens, branch, startedAt, lastAt, todos: todos && {...todos}};
    }

    toJSON(): unknown {
        return {
            version: VERSION,
            cells: [...this.cells.values()].map(cell => ({...cell})),
            sessions: [...this.sessions].map(([id, session]) => ({id, ...session, todos: session.todos && {...session.todos}})),
            ids: Object.fromEntries([...this.ids].map(([id, seen]) => [id, {...seen}])),
        };
    }

    static fromJSON(data: unknown): ClaudeIndex {
        const index = new ClaudeIndex();
        if (
            !isRecord(data) ||
            data.version !== VERSION ||
            !Array.isArray(data.cells) ||
            !Array.isArray(data.sessions) ||
            !isRecord(data.ids)
        )
            return index;
        const cells = data.cells as unknown[];
        const sessions = data.sessions as unknown[];
        const ids = Object.entries(data.ids);
        if (!cells.every(isCell) || !sessions.every(isSession) || !ids.every((entry): entry is [string, Seen] => isSeen(entry[1])))
            return index;
        for (const cell of cells) index.cells.set(cellKey(cell), {...cell});
        for (const {id, ...session} of sessions) index.sessions.set(id, session);
        for (const [id, {at, output}] of ids) index.ids.set(id, {at, output});
        return index;
    }
}
