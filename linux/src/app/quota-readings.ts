import type {QuotaReading} from '../shared/meter.types.js';
import {WINDOW_NAMES} from './quota-readings.const.js';
import type {QuotaSources} from './quota-readings.types.js';

export function quotaReadings({claude, codex, gemini, enabled, nowMs}: QuotaSources): QuotaReading[] {
    const readings: QuotaReading[] = [];
    if (enabled('claude') && claude)
        for (const role of ['session', 'weekly'] as const) {
            const window = claude.windows.find(candidate => candidate.role === role);
            if (window)
                readings.push({
                    id: `claude:${claude.configDir}:${role}`,
                    provider: 'claude',
                    name: 'Claude',
                    window: WINDOW_NAMES[role],
                    percent: window.utilization,
                });
        }
    if (enabled('codex'))
        for (const meter of codex.meters(nowMs))
            if (meter.key === 'session' || meter.key === 'weekly')
                readings.push({
                    id: `codex:${meter.key}`,
                    provider: 'codex',
                    name: 'Codex',
                    window: WINDOW_NAMES[meter.key],
                    percent: meter.percent,
                });
    if (enabled('gemini'))
        for (const meter of gemini.meters(nowMs))
            if (meter.key === 'daily')
                readings.push({id: 'gemini:daily', provider: 'gemini', name: 'Gemini', window: 'dia', percent: meter.percent});
    return readings;
}
