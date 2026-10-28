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
