import type {UsageWindow} from '../features/claude/claude-usage.types.js';
import type {CodexLimits} from '../features/codex/codex-usage.types.js';
import type {GeminiQuota} from '../features/gemini/gemini-usage.types.js';
import type {AiProvider} from '../shared/ai-provider.types.js';

export interface QuotaSources {
    readonly claude: {readonly configDir: string; readonly windows: readonly UsageWindow[]} | null;
    readonly codex: CodexLimits | null;
    readonly gemini: GeminiQuota | null;
    readonly enabled: (provider: AiProvider) => boolean;
    readonly nowMs: number;
}
