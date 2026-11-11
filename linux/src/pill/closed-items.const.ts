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
    'claude-session': {provider: 'claude', key: 'session', name: 'Claude', suffix: ''},
    'claude-weekly': {provider: 'claude', key: 'weekly', name: 'Semana', suffix: ''},
    'codex-session': {provider: 'codex', key: 'session', name: 'Codex', suffix: ''},
    'codex-weekly': {provider: 'codex', key: 'weekly', name: 'Codex', suffix: ' · 7d'},
    'gemini-daily': {provider: 'gemini', key: 'daily', name: 'Gemini', suffix: ' hoje'},
};
