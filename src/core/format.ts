import type {BatteryInfo} from './types.js';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

const pad = (n: number): string => String(n).padStart(2, '0');

export function formatReset(iso: string | null, nowMs: number): string {
    if (!iso) return '';
    const at = new Date(iso);
    const diffMin = Math.max(0, Math.round((at.getTime() - nowMs) / 60e3));
    if (Number.isNaN(diffMin)) return '';
    if (diffMin < 60) return `em ${diffMin}m`;
    if (diffMin < 24 * 60) return `em ${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
    return `${WEEKDAYS[at.getDay()] ?? ''} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function formatDate(date: Date): string {
    return `${WEEKDAYS[date.getDay()] ?? ''}, ${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`;
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
