import type {Level} from '../../shared/level.types.js';

export type WindowRole = 'session' | 'weekly' | 'scoped' | 'other';
export type TierIcon = 'free' | 'pro' | 'max' | 'team' | 'enterprise';

export interface UsageWindow {
    readonly key: string;
    readonly label: string;
    readonly role: WindowRole;
    readonly utilization: number;
    readonly resetsAt: string | null;
    readonly totalSeconds: number | null;
    readonly apiLevel: Level;
    readonly isActive: boolean;
}

export interface Spend {
    readonly used: string | null;
    readonly limit: string | null;
    readonly percent: number | null;
    readonly level: Level;
}

export interface LevelInput {
    readonly utilization: number;
    readonly resetsAt: string | null;
    readonly totalSeconds: number | null;
    readonly apiLevel: Level;
}

export type Json = Record<string, unknown>;

export interface AccountSummary {
    readonly who: string | null;
    readonly plan: string | null;
    readonly rateLimitTier: string | null;
    readonly subtitle: string;
}
