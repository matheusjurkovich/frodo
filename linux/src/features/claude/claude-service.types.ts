import type {ClaudeProfile} from '../../settings/claude-profile.types.js';
import type {Spend, UsageWindow} from './claude-usage.types.js';
import type {ClaudeClient} from './claude-client.js';

export type ProfileStatus = 'loading' | 'ok' | 'error' | 'signed-out';

export interface ProfileUsage {
    readonly profile: ClaudeProfile;
    readonly active: boolean;
    readonly status: ProfileStatus;
    readonly windows: readonly UsageWindow[];
    readonly spend: Spend | null;
    readonly tier: string | null;
    readonly subtitle: string | null;
    readonly error: string | null;
    readonly updatedAt: number;
}

export interface Entry {
    readonly client: ClaudeClient;
    usage: ProfileUsage;
}
