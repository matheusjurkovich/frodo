import type {ClosedItem} from '../settings/schema-values.types.js';
import type {QuotaItem, QuotaSpec} from './closed-items.types.js';

export const TEXT_ITEMS: readonly ClosedItem[] = [
    'battery',
    'ram',
    'claude-session',
    'claude-weekly',
    'codex-session',
    'codex-weekly',
    'gemini-daily',
];

export const QUOTA_ITEMS: Record<QuotaItem, QuotaSpec> = {
    'claude-session': {provider: 'claude', key: 'session', name: 'Claude', suffix: '', ringSuffix: ''},
    'claude-weekly': {provider: 'claude', key: 'weekly', name: 'Semana', suffix: '', ringSuffix: ' · 7d'},
    'codex-session': {provider: 'codex', key: 'session', name: 'Codex', suffix: '', ringSuffix: ''},
    'codex-weekly': {provider: 'codex', key: 'weekly', name: 'Codex', suffix: ' · 7d', ringSuffix: ' · 7d'},
    'gemini-daily': {provider: 'gemini', key: 'daily', name: 'Gemini', suffix: ' hoje', ringSuffix: ' hoje'},
};

export const QUOTA_NAMES: Record<QuotaItem, string> = {
    'claude-session': 'Sessão do Claude',
    'claude-weekly': 'Semana do Claude',
    'codex-session': 'Sessão do Codex',
    'codex-weekly': 'Semana do Codex',
    'gemini-daily': 'Gemini',
};

export const QUOTA_PERIODS: Record<QuotaItem, string> = {
    'claude-session': 'de 5 h',
    'claude-weekly': 'da semana',
    'codex-session': 'de 5 h',
    'codex-weekly': 'da semana',
    'gemini-daily': 'de hoje',
};
