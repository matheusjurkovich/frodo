import type {UsageWindow} from '../features/claude/claude-usage.types.js';
import type {AiProvider} from '../shared/ai-provider.types.js';
import type {MeterSource} from '../shared/meter.types.js';

export interface QuotaSources {
    readonly claude: {readonly configDir: string; readonly windows: readonly UsageWindow[]} | null;
    readonly codex: MeterSource;
    readonly gemini: MeterSource;
    readonly enabled: (provider: AiProvider) => boolean;
    readonly nowMs: number;
}
