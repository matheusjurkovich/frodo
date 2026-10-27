export interface MemoryInfo {
    readonly totalKb: number;
    readonly usedKb: number;
}

export interface BatteryInfo {
    readonly percent: number;
    readonly charging: boolean;
}

export const CLOSED_MODES = ['minimal', 'compact', 'rotating'] as const;
export type ClosedMode = (typeof CLOSED_MODES)[number];

export const CLOSED_ITEMS = ['clock', 'system', 'battery', 'ram', 'claude-session', 'claude-weekly'] as const;
export type ClosedItem = (typeof CLOSED_ITEMS)[number];

export const MONITOR_MODES = ['primary', 'secondary', 'both'] as const;
export type MonitorMode = (typeof MONITOR_MODES)[number];

export const TAB_IDS = ['general', 'calendar', 'workspaces', 'claude', 'notifications'] as const;
export type TabId = (typeof TAB_IDS)[number];

export const CARD_IDS = ['shortcuts', 'apps'] as const;
export type CardId = (typeof CARD_IDS)[number];

export function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
    return (values as readonly string[]).includes(value);
}
