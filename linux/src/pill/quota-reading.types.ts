import type {CodexLimits} from '../features/codex/codex-usage.types.js';
import type {GeminiQuota} from '../features/gemini/gemini-usage.types.js';
import type {UsageWindow} from '../features/claude/claude-usage.types.js';
import type {AiProvider} from '../shared/ai-provider.types.js';
import type {Level} from '../shared/level.types.js';

export interface QuotaSources {
    readonly claudeWindows: readonly UsageWindow[];
    readonly codexLimits: CodexLimits | null;
    readonly geminiQuota: GeminiQuota | null;
    readonly providerEnabled: (provider: AiProvider) => boolean;
    readonly showRemaining: boolean;
}

export interface UsageReading {
    readonly percent: number;
    readonly level: Level;
    readonly suffix: string;
}
