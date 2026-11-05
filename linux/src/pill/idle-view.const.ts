import type {ClosedItem} from '../settings/schema-values.types.js';
import type {MeterItem} from './idle-view.types.js';

export const FADE_MS = 150;

export const TEXT_ITEMS: readonly ClosedItem[] = [
    'battery',
    'ram',
    'claude-session',
    'claude-weekly',
    'codex-session',
    'codex-weekly',
    'gemini-daily',
];

export const METER_ITEMS: Record<MeterItem, {provider: 'codex' | 'gemini'; key: string; name: string; suffix: string}> = {
    'codex-session': {provider: 'codex', key: 'session', name: 'Codex', suffix: ''},
    'codex-weekly': {provider: 'codex', key: 'weekly', name: 'Codex', suffix: ' · 7d'},
    'gemini-daily': {provider: 'gemini', key: 'daily', name: 'Gemini', suffix: ' hoje'},
};
