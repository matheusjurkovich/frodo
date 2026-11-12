import {clamp} from './geometry.js';
import type {Level} from './level.types.js';
import {CRIT_PERCENT, WARN_PERCENT, DAY_MS, WEEKDAYS, LEVEL_RANK, LEVEL_PERCENT} from './meter.const.js';
import type {QuotaReading, QuotaNotice} from './meter.types.js';
import {pad} from './format.js';

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
    const clamped = clamp(percent, 0, 100);
    return remaining ? 100 - clamped : clamped;
}

export function quotaNotices(
    previous: ReadonlyMap<string, Level>,
    readings: readonly QuotaReading[],
): {states: Map<string, Level>; notices: QuotaNotice[]} {
    const states = new Map<string, Level>();
    const notices: QuotaNotice[] = [];
    for (const {id, provider, name, window, percent} of readings) {
        const next = meterLevel(percent);
        const before = previous.get(id);
        if (before === undefined) {
            states.set(id, next);
        } else if (LEVEL_RANK[next] > LEVEL_RANK[before]) {
            const limit = LEVEL_PERCENT[next];
            notices.push({provider, title: `Cota em ${limit}%`, body: `${name}: ${limit}% da cota de ${window}`});
            states.set(id, next);
        } else if (next === 'ok' && before !== 'ok') {
            notices.push({provider, title: 'Cota renovada', body: `${name}: cota de ${window} renovada`});
            states.set(id, 'ok');
        } else {
            states.set(id, before);
        }
    }
    return {states, notices};
}
