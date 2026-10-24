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

export function batteryIconName(battery: BatteryInfo): string {
    const level = Math.min(100, Math.max(0, Math.floor(battery.percent / 10) * 10));
    return `battery-level-${level}${battery.charging ? '-charging' : ''}-symbolic`;
}

export function ellipsize(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
