export const CLOSED_MODES = ['minimal', 'compact', 'rotating'] as const;

export const CLOSED_ITEMS = [
    'clock',
    'date',
    'notifications',
    'network',
    'bluetooth',
    'volume',
    'microphone',
    'do-not-disturb',
    'system',
    'battery',
    'ram',
    'claude-session',
    'claude-weekly',
    'codex-session',
    'codex-weekly',
    'gemini-daily',
    'extensions',
] as const;

export const PILL_POSITIONS = [
    'left',
    'center',
    'right',
    'middle-left',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
] as const;

export const GEMINI_DAILY_LIMITS = [1000, 1500, 2000] as const;
export const MEETING_NOTICE_MINUTES = [0, 5, 10, 15] as const;
export const PEEK_EVERY_MINUTES = [5, 10, 15, 30] as const;
export const PEEK_SECONDS = [5, 10, 15, 30] as const;
export const MONITOR_MODES = ['primary', 'secondary', 'both'] as const;
export const PILL_AI_ACTIVITIES = ['always', 'change', 'never'] as const;
export const SURFACE_STYLES = ['solid', 'frosted', 'clear'] as const;
export const TAB_IDS = ['general', 'calendar', 'workspaces', 'claude', 'notifications', 'performance', 'mixer'] as const;
export const CARD_IDS = ['shortcuts', 'apps'] as const;
