import type {Level} from './level.js';

export interface Meter {
    readonly key: string;
    readonly label: string;
    readonly short: string;
    readonly percent: number;
    readonly note: string;
}

const WARN_PERCENT = 80;
const CRIT_PERCENT = 95;
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const;
const DAY_MS = 24 * 3600e3;

const pad = (n: number): string => String(n).padStart(2, '0');

export function meterLevel(percent: number): Level {
    if (percent >= CRIT_PERCENT) return 'crit';
    return percent >= WARN_PERCENT ? 'warn' : 'ok';
}

export function clockTime(ms: number): string {
    const date = new Date(ms);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function resetNote(resetsAt: number, nowMs: number): string {
    const left = resetsAt - nowMs;
    if (left <= 0) return 'Reiniciada';
    if (left >= DAY_MS) return `Reinicia ${WEEKDAYS[new Date(resetsAt).getDay()] ?? ''}, ${clockTime(resetsAt)}`;
    const minutes = Math.max(1, Math.ceil(left / 60e3));
    const hours = Math.floor(minutes / 60);
    if (hours === 0) return `Reinicia em ${minutes} min`;
    return minutes % 60 === 0 ? `Reinicia em ${hours} h` : `Reinicia em ${hours} h ${minutes % 60} min`;
}

export function shownMeterPercent(percent: number, remaining: boolean): number {
    const clamped = Math.min(100, Math.max(0, percent));
    return remaining ? 100 - clamped : clamped;
}

export interface QuotaReading {
    readonly id: string;
    readonly name: string;
    readonly window: string;
    readonly percent: number;
}

export interface QuotaNotice {
    readonly title: string;
    readonly body: string;
}

const LEVEL_RANK: Record<Level, number> = {ok: 0, warn: 1, crit: 2};
const LEVEL_PERCENT: Record<Level, number> = {ok: 0, warn: WARN_PERCENT, crit: CRIT_PERCENT};

export function quotaNotices(
    previous: ReadonlyMap<string, Level>,
    readings: readonly QuotaReading[],
): {states: Map<string, Level>; notices: QuotaNotice[]} {
    const states = new Map<string, Level>();
    const notices: QuotaNotice[] = [];
    for (const {id, name, window, percent} of readings) {
        const next = meterLevel(percent);
        const before = previous.get(id);
        if (before === undefined) {
            states.set(id, next);
        } else if (LEVEL_RANK[next] > LEVEL_RANK[before]) {
            const limit = LEVEL_PERCENT[next];
            notices.push({title: `Cota em ${limit}%`, body: `${name}: ${limit}% da cota de ${window}`});
            states.set(id, next);
        } else if (next === 'ok' && before !== 'ok') {
            notices.push({title: 'Cota renovada', body: `${name}: cota de ${window} renovada`});
            states.set(id, 'ok');
        } else {
            states.set(id, before);
        }
    }
    return {states, notices};
}
