import {codexMeters} from '../features/codex/codex-usage.js';
import {geminiMeters} from '../features/gemini/gemini-usage.js';
import type {UsageWindow} from '../features/claude/claude-usage.types.js';
import {quotaAccessibleName, quotaReading} from './quota-reading.js';
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
    codex: {meters: now => codexMeters(null, now)},
    gemini: {meters: () => geminiMeters({requests: 25, limit: 100, perMinute: 0, resetsAt: 0})},
    providerEnabled: () => true,
    showRemaining: false,
    ...overrides,
});

describe('quotaReading', () => {
    it('lê a janela do Claude pelo papel', () => {
        expect(quotaReading('claude-session', sources(), 0)).toEqual({percent: 30, level: 'ok'});
        expect(quotaReading('claude-weekly', sources(), 0)?.percent).toBe(90);
    });

    it('mostra o restante quando configurado', () => {
        expect(quotaReading('claude-session', sources({showRemaining: true}), 0)?.percent).toBe(70);
    });

    it('sem janela não há leitura', () => {
        expect(quotaReading('claude-session', sources({claudeWindows: []}), 0)).toBeNull();
    });

    it('lê a cota do Gemini com o sufixo', () => {
        expect(quotaReading('gemini-daily', sources(), 0)).toEqual({percent: 25, level: 'ok'});
    });

    it('provedor desativado ou sem dado não tem leitura', () => {
        expect(quotaReading('gemini-daily', sources({providerEnabled: () => false}), 0)).toBeNull();
        expect(quotaReading('codex-session', sources(), 0)).toBeNull();
    });
});

describe('quotaAccessibleName', () => {
    it('descreve a cota com o período', () => {
        expect(quotaAccessibleName('claude-session', 62)).toBe('Sessão do Claude: 62% da cota de 5 h usada');
        expect(quotaAccessibleName('claude-weekly', 34)).toBe('Semana do Claude: 34% da cota da semana usada');
        expect(quotaAccessibleName('codex-session', 10)).toBe('Sessão do Codex: 10% da cota de 5 h usada');
        expect(quotaAccessibleName('codex-weekly', 20)).toBe('Semana do Codex: 20% da cota da semana usada');
        expect(quotaAccessibleName('gemini-daily', 41)).toBe('Gemini: 41% da cota de hoje usada');
    });
});
