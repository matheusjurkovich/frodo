import type {UsageWindow} from '../features/claude/claude-usage.types.js';
import {quotaReading} from './quota-reading.js';
import type {QuotaSources} from './quota-reading.types.js';

const window = (role: UsageWindow['role'], utilization: number): UsageWindow => ({
    key: role,
    label: role,
    role,
    utilization,
    resetsAt: null,
    totalSeconds: null,
    apiLevel: 'ok',
    isActive: true,
});

const sources = (overrides: Partial<QuotaSources> = {}): QuotaSources => ({
    claudeWindows: [window('session', 30), window('weekly', 90)],
    codexLimits: null,
    geminiQuota: {requests: 25, limit: 100, perMinute: 0, resetsAt: 0},
    providerEnabled: () => true,
    showRemaining: false,
    ...overrides,
});

describe('quotaReading', () => {
    it('lê a janela do Claude pelo papel', () => {
        expect(quotaReading('claude-session', sources(), 0)).toEqual({percent: 30, level: 'ok', suffix: ''});
        expect(quotaReading('claude-weekly', sources(), 0)?.percent).toBe(90);
    });

    it('mostra o restante quando configurado', () => {
        expect(quotaReading('claude-session', sources({showRemaining: true}), 0)?.percent).toBe(70);
    });

    it('sem janela não há leitura', () => {
        expect(quotaReading('claude-session', sources({claudeWindows: []}), 0)).toBeNull();
    });

    it('lê a cota do Gemini com o sufixo', () => {
        expect(quotaReading('gemini-daily', sources(), 0)).toEqual({percent: 25, level: 'ok', suffix: ' hoje'});
    });

    it('provedor desativado ou sem dado não tem leitura', () => {
        expect(quotaReading('gemini-daily', sources({providerEnabled: () => false}), 0)).toBeNull();
        expect(quotaReading('codex-session', sources(), 0)).toBeNull();
    });
});
