import {claudeMeters} from '../../features/claude/claude-usage.js';
import {codexMeters, planLabel} from '../../features/codex/codex-usage.js';
import {geminiMeters} from '../../features/gemini/gemini-usage.js';
import type {AiProvider} from '../../shared/ai-provider.types.js';
import {MAX_AGE_SECONDS, GEMINI_PLANS} from './provider-usage.const.js';
import type {UsageSources, ProviderUsage} from './provider-usage.types.js';

export function providerUsage(provider: AiProvider, {settings, claude, codex, gemini}: UsageSources): ProviderUsage {
    switch (provider) {
        case 'claude':
            return {
                meters: now => claudeMeters(claude.active?.windows ?? [], now),
                plan: () => claude.active?.tier ?? null,
                empty: () => 'Entre no Claude Code para ver as cotas',
                refresh: () => {
                    claude.refreshIfStale(MAX_AGE_SECONDS);
                },
                onChanged: callback => claude.on('changed', callback),
            };
        case 'codex':
            return {
                meters: now => codexMeters(codex.limits, now),
                plan: () => planLabel(codex.limits?.plan ?? null),
                empty: () => (codex.available ? 'O Codex ainda não informou a cota. Use-o uma vez.' : 'Codex não encontrado em ~/.codex'),
                refresh: () => {
                    codex.refreshIfStale(MAX_AGE_SECONDS);
                },
                onChanged: callback => codex.on('changed', callback),
            };
        case 'gemini':
            return {
                meters: () => geminiMeters(gemini.quota),
                plan: () => GEMINI_PLANS[settings.geminiDailyLimit] ?? null,
                empty: () => (gemini.available ? 'Lendo o histórico do Gemini CLI…' : 'Gemini CLI não encontrado em ~/.gemini'),
                refresh: () => {
                    gemini.refreshIfStale(MAX_AGE_SECONDS);
                },
                onChanged: callback => {
                    const off = gemini.on('changed', callback);
                    const offLimit = settings.onChanged('gemini-daily-limit', callback);
                    return () => {
                        off();
                        offLimit();
                    };
                },
            };
    }
}
