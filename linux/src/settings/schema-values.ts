export const CLOSED_MODES = ['minimal', 'compact', 'rotating'] as const;
export type ClosedMode = (typeof CLOSED_MODES)[number];

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
export type ClosedItem = (typeof CLOSED_ITEMS)[number];

export const PILL_POSITIONS = ['left', 'center', 'right', 'bottom-left', 'bottom-center', 'bottom-right'] as const;
export type PillPosition = (typeof PILL_POSITIONS)[number];
export type HorizontalPosition = 'left' | 'center' | 'right';

export function isBottom(position: PillPosition): boolean {
    return position.startsWith('bottom-');
}

export function horizontalOf(position: PillPosition): HorizontalPosition {
    const side = position.replace('bottom-', '');
    return side === 'left' || side === 'right' ? side : 'center';
}

export {AI_PROVIDERS} from '../shared/ai-provider.js';
export type {AiProvider} from '../shared/ai-provider.js';

export const GEMINI_DAILY_LIMITS = [1000, 1500, 2000] as const;
export const MEETING_NOTICE_MINUTES = [0, 5, 10, 15] as const;

export const MONITOR_MODES = ['primary', 'secondary', 'both'] as const;
export type MonitorMode = (typeof MONITOR_MODES)[number];

export const SURFACE_STYLES = ['solid', 'frosted', 'clear'] as const;
export type SurfaceStyle = (typeof SURFACE_STYLES)[number];

export const TAB_IDS = ['general', 'calendar', 'workspaces', 'claude', 'notifications'] as const;
export type TabId = (typeof TAB_IDS)[number];

export const CARD_IDS = ['shortcuts', 'apps'] as const;
export type CardId = (typeof CARD_IDS)[number];

export function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
    return (values as readonly string[]).includes(value);
}
