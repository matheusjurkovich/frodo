import type {Level} from '../../shared/level.types.js';
import type {WindowRole, TierIcon} from './claude-usage.types.js';

export const FIVE_HOUR_SECONDS = 5 * 3600;
export const SEVEN_DAY_SECONDS = 7 * 24 * 3600;
export const GROUP_SECONDS: Record<string, number> = {session: FIVE_HOUR_SECONDS, weekly: SEVEN_DAY_SECONDS};
export const ROLE_ORDER: Record<WindowRole, number> = {session: 0, weekly: 1, scoped: 2, other: 3};
export const LEVEL_RANK: Record<Level, number> = {ok: 0, warn: 1, crit: 2};
export const KNOWN_MODEL: Record<string, string> = {opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', oauth_apps: 'OAuth Apps'};
export const TIER_ICONS: readonly TierIcon[] = ['free', 'pro', 'max', 'team', 'enterprise'];
export const LOCKOUT_CRIT_FRACTION = 0.1;
export const DISPLAY_WARN_UTILIZATION = 80;
export const STALE_USAGE_MESSAGE = 'Uso desatualizado. Abra o Claude Code para atualizar.';
export const SHORT_LABELS: Partial<Record<WindowRole, string>> = {session: 'Sessão 5 h', weekly: 'Semana'};
