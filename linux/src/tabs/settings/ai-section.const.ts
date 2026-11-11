import type {HookedAgent} from '../../features/claude/agent-hooks.types.js';
import type {NumberOption} from './settings-rows.types.js';
import {GEMINI_DAILY_LIMITS} from '../../settings/schema-values.const.js';

export const POLL_MINUTES = {min: 1, max: 60} as const;

export const GEMINI_LIMITS: readonly NumberOption[] = GEMINI_DAILY_LIMITS.map(limit => ({
    id: limit,
    label: limit.toLocaleString('pt-BR'),
}));

export const HOOK_PATHS: Record<HookedAgent, string> = {codex: '~/.codex/hooks.json', gemini: '~/.gemini/settings.json'};
