import type {Level} from './level.types.js';

export const WARN_PERCENT = 80;
export const CRIT_PERCENT = 95;
export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const;
export const DAY_MS = 24 * 3600e3;
export const LEVEL_RANK: Record<Level, number> = {ok: 0, warn: 1, crit: 2};
export const LEVEL_PERCENT: Record<Level, number> = {ok: 0, warn: WARN_PERCENT, crit: CRIT_PERCENT};
