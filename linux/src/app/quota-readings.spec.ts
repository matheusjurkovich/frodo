import {quotaReadings} from './quota-readings.js';
import type {UsageWindow} from '../features/claude/claude-usage.js';

function window(key: string, role: UsageWindow['role'], utilization: number): UsageWindow {
    return {key, label: key, role, utilization, resetsAt: null, totalSeconds: null, apiLevel: 'ok', isActive: true};
}

describe('leituras de cota', () => {
    const now = Date.UTC(2026, 9, 29, 12);
    const everyone = (): boolean => true;

    it('duas janelas semanais do Claude geram uma leitura só, a primeira, como na pílula', () => {
        const readings = quotaReadings({
            claude: {
                configDir: '/c',
                windows: [window('five_hour', 'session', 10), window('seven_day', 'weekly', 85), window('seven_day_fable', 'weekly', 0)],
            },
            codex: null,
            gemini: null,
            enabled: everyone,
            nowMs: now,
        });
        expect(readings).toEqual([
            {id: 'claude:/c:session', provider: 'claude', name: 'Claude', window: '5 h', percent: 10},
            {id: 'claude:/c:weekly', provider: 'claude', name: 'Claude', window: 'semana', percent: 85},
        ]);
    });

    it('codex e gemini entram com as janelas que a pílula mostra', () => {
        const readings = quotaReadings({
            claude: null,
            codex: {
                plan: null,
                primary: {usedPercent: 42, windowMinutes: 300, resetsAt: now + 3600e3},
                secondary: {usedPercent: 81, windowMinutes: 10080, resetsAt: now + 86400e3},
                at: now,
            },
            gemini: {requests: 900, limit: 1000, perMinute: 59, resetsAt: now + 3600e3},
            enabled: everyone,
            nowMs: now,
        });
        expect(readings).toEqual([
            {id: 'codex:session', provider: 'codex', name: 'Codex', window: '5 h', percent: 42},
            {id: 'codex:weekly', provider: 'codex', name: 'Codex', window: 'semana', percent: 81},
            {id: 'gemini:daily', provider: 'gemini', name: 'Gemini', window: 'dia', percent: 90},
        ]);
    });

    it('provedor desligado não entra', () => {
        const readings = quotaReadings({
            claude: {configDir: '/c', windows: [window('five_hour', 'session', 90)]},
            codex: null,
            gemini: {requests: 900, limit: 1000, perMinute: 0, resetsAt: now},
            enabled: provider => provider !== 'claude',
            nowMs: now,
        });
        expect(readings.map(({id}) => id)).toEqual(['gemini:daily']);
    });
});
