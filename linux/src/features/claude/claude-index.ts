import {modelDisplayName, modelFamily} from './claude-transcript.js';
import type {ModelFamily, TranscriptEntry, UsageRecord} from './claude-transcript.js';
import {KEPT_DAYS, addCell, cellKey, dayStart, hourStart, summarize} from '../../shared/consumption.js';
import type {ConsumptionSummary, ModelGroups, Period, UsageCell} from '../../shared/consumption.js';

export type {Bar, ConsumptionSummary, Period, Share} from '../../shared/consumption.js';

export interface SessionStats {
    readonly tokens: number;
    readonly model: string;
    readonly contextTokens: number;
    readonly branch: string | null;
    readonly startedAt: number;
    readonly lastAt: number;
    readonly todos: {done: number; total: number} | null;
}

type Cell = UsageCell;

interface Session extends Mutable<SessionStats> {
    todosAt: number;
    mainAt: number;
}

interface Seen {
    at: number;
    output: number;
}

type Mutable<T> = {-readonly [K in keyof T]: T[K]};

const VERSION = 4;
const FAMILIES: readonly ModelFamily[] = ['Opus', 'Sonnet', 'Haiku', 'Outro'];
const CLAUDE_MODELS: ModelGroups = {order: FAMILIES, family: modelFamily, label: modelDisplayName};

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
        addCell(this.cells, {
            hour: hourStart(usage.timestamp),
            model: usage.model,
            project: usage.project,
            session: usage.sessionId,
            input: usage.input,
            output: usage.output,
            cacheRead: usage.cacheRead,
        });

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
        return summarize(this.cells.values(), period, now, CLAUDE_MODELS);
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
