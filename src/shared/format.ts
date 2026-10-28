import type {BatteryInfo} from '../settings/schema-values.js';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

const pad = (n: number): string => String(n).padStart(2, '0');

export function weekdayLabel(day: number): string {
    const weekday = WEEKDAYS[day] ?? '';
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}`;
}

export function formatDate(date: Date): string {
    return `${weekdayLabel(date.getDay())}, ${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`;
}

const decimal = (value: number): string => String(Math.round(value * 10) / 10).replace('.', ',');

export function formatTokens(n: number): string {
    if (n < 1e3) return String(n);
    if (Math.round(n / 1e3) < 1e3) return `${Math.round(n / 1e3)} mil`;
    if (Math.round(n / 1e5) / 10 < 1e3) return `${decimal(n / 1e6)} mi`;
    return `${decimal(n / 1e9)} bi`;
}

export function formatTimer(seconds: number): string {
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total / 60) % 60;
    const rest = pad(total % 60);
    return hours > 0 ? `${hours}:${pad(minutes)}:${rest}` : `${minutes}:${rest}`;
}

export function secondsSince(thenMs: number, nowMs: number): number {
    const seconds = (nowMs - thenMs) / 1000;
    return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

export function formatAgo(thenMs: number, nowMs: number): string {
    const minutes = Math.floor((nowMs - thenMs) / 60e3);
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h`;
    return `${Math.floor(minutes / (24 * 60))} d`;
}

export function formatUntil(startMs: number, nowMs: number): string {
    const minutes = Math.ceil((startMs - nowMs) / 60e3);
    return minutes > 0 ? `Em ${minutes} min` : 'Agora';
}

export function formatSpan(seconds: number): string {
    const minutes = Math.max(1, Math.floor(seconds / 60));
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${pad(minutes % 60)} min`;
}

export type BatteryLevel = 'empty' | 'low' | 'medium' | 'high' | 'full' | 'charging';

export function batteryLevel(battery: BatteryInfo): BatteryLevel {
    if (battery.charging) return 'charging';
    if (battery.percent >= 90) return 'full';
    if (battery.percent >= 60) return 'high';
    if (battery.percent >= 35) return 'medium';
    if (battery.percent >= 10) return 'low';
    return 'empty';
}

export function ellipsize(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
