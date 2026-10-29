import type {UsageWindow} from '../features/claude/claude-usage.js';
import {codexMeters} from '../features/codex/codex-usage.js';
import type {CodexLimits} from '../features/codex/codex-usage.js';
import {geminiMeters} from '../features/gemini/gemini-usage.js';
import type {GeminiQuota} from '../features/gemini/gemini-usage.js';
import type {AiProvider} from '../shared/ai-provider.js';
import type {QuotaReading} from '../shared/meter.js';

export interface QuotaSources {
    readonly claude: {readonly configDir: string; readonly windows: readonly UsageWindow[]} | null;
    readonly codex: CodexLimits | null;
    readonly gemini: GeminiQuota | null;
    readonly enabled: (provider: AiProvider) => boolean;
    readonly nowMs: number;
}

const WINDOW_NAMES = {session: '5 h', weekly: 'semana'} as const;

export function quotaReadings({claude, codex, gemini, enabled, nowMs}: QuotaSources): QuotaReading[] {
    const readings: QuotaReading[] = [];
    if (enabled('claude') && claude)
        for (const role of ['session', 'weekly'] as const) {
            const window = claude.windows.find(candidate => candidate.role === role);
            if (window)
                readings.push({
                    id: `claude:${claude.configDir}:${role}`,
                    name: 'Claude',
                    window: WINDOW_NAMES[role],
                    percent: window.utilization,
                });
        }
    if (enabled('codex'))
        for (const meter of codexMeters(codex, nowMs))
            if (meter.key === 'session' || meter.key === 'weekly')
                readings.push({id: `codex:${meter.key}`, name: 'Codex', window: WINDOW_NAMES[meter.key], percent: meter.percent});
    if (enabled('gemini'))
        for (const meter of geminiMeters(gemini))
            if (meter.key === 'daily') readings.push({id: 'gemini:daily', name: 'Gemini', window: 'dia', percent: meter.percent});
    return readings;
}
