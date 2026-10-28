import {weekdayLabel} from './format.js';

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

export interface UsageCell {
    hour: number;
    model: string;
    project: string;
    session: string;
    input: number;
    output: number;
    cacheRead: number;
}

export interface ModelGroups {
    readonly order: readonly string[];
    readonly family: (model: string) => string;
    readonly label: (model: string) => string;
}

export interface ConsumptionSource {
    readonly scanning: boolean;
    summary(period: Period, now: Date): ConsumptionSummary;
    setWanted(wanted: boolean): void;
    on(event: 'changed', callback: () => void): () => void;
}

interface Latest {
    tokens: number;
    hour: number;
    model: string;
}

export const KEPT_DAYS = 30;
const PERIOD_DAYS: Record<Period, number> = {today: 1, '7d': 7, '30d': KEPT_DAYS};
const MAX_PROJECTS = 4;
const FIRST_HOUR = 8;
const LAST_HOUR = 18;
const LABEL_EVERY = 7;
const MAX_HOUR_LABELS = 12;

const pad = (n: number): string => String(n).padStart(2, '0');

export function hourStart(ms: number): number {
    const date = new Date(ms);
    return ms - date.getMinutes() * 60_000 - date.getSeconds() * 1000 - date.getMilliseconds();
}

export function dayStart(ms: number, daysBack = 0): number {
    const date = new Date(ms);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBack).getTime();
}

export function cellKey(cell: UsageCell): string {
    return JSON.stringify([cell.hour, cell.model, cell.project, cell.session]);
}

export function addCell(cells: Map<string, UsageCell>, cell: UsageCell): void {
    const key = cellKey(cell);
    const target = cells.get(key);
    if (!target) {
        cells.set(key, {...cell});
        return;
    }
    target.input += cell.input;
    target.output += cell.output;
    target.cacheRead += cell.cacheRead;
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

export function summarize(cells: Iterable<UsageCell>, period: Period, now: Date, groups: ModelGroups): ConsumptionSummary {
    const nowMs = now.getTime();
    const from = dayStart(nowMs, PERIOD_DAYS[period] - 1);
    const until = dayStart(nowMs, -1);
    const slots = new Map<number, number>();
    const sessions = new Set<string>();
    const models = new Map<string, Latest>();
    const projects = new Map<string, number>();
    let input = 0;
    let output = 0;
    let cacheRead = 0;

    for (const cell of cells) {
        if (cell.hour < from || cell.hour >= until) continue;
        const tokens = cell.input + cell.output;
        input += cell.input;
        output += cell.output;
        cacheRead += cell.cacheRead;
        sessions.add(cell.session);
        projects.set(cell.project, (projects.get(cell.project) ?? 0) + tokens);
        const family = groups.family(cell.model);
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
        models: groups.order.flatMap(family => {
            const latest = models.get(family);
            return latest && latest.tokens > 0 ? [share(family, groups.label(latest.model), latest.tokens, total)] : [];
        }),
        projects: [...projects]
            .filter(([, tokens]) => tokens > 0)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, MAX_PROJECTS)
            .map(([name, tokens]) => share(name, name, tokens, total)),
    };
}
