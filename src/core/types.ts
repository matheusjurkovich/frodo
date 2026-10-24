export interface MemoryInfo {
    readonly totalKb: number;
    readonly usedKb: number;
}

export interface BatteryInfo {
    readonly percent: number;
    readonly charging: boolean;
}

export interface UsageWindow {
    readonly percent: number;
    readonly resetsAt: string | null;
}

export interface Usage {
    readonly session: UsageWindow | null;
    readonly weekly: UsageWindow | null;
}

export type ClaudeError = 'no-credentials' | 'expired' | 'network' | 'http';

export interface ClaudeUsage extends Usage {
    readonly error: ClaudeError | null;
}

export interface ClaudeState extends ClaudeUsage {
    readonly fetchedAt: number;
}

export const CLOSED_MODES = ['minimal', 'compact', 'rotating'] as const;
export type ClosedMode = (typeof CLOSED_MODES)[number];

export const CLOSED_ITEMS = ['battery', 'ram', 'claude-session', 'claude-weekly'] as const;
export type ClosedItem = (typeof CLOSED_ITEMS)[number];

export const OPEN_LAYOUTS = ['single', 'tabs'] as const;
export type OpenLayout = (typeof OPEN_LAYOUTS)[number];

export function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
    return (values as readonly string[]).includes(value);
}
