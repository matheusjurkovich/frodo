import type {UsageWindow} from '../features/claude/claude-usage.types.js';
import type {AiProvider} from '../shared/ai-provider.types.js';
import type {Level} from '../shared/level.types.js';
import type {MeterSource} from '../shared/meter.types.js';

export interface QuotaSources {
    readonly claudeWindows: readonly UsageWindow[];
    readonly codex: MeterSource;
    readonly gemini: MeterSource;
    readonly providerEnabled: (provider: AiProvider) => boolean;
    readonly showRemaining: boolean;
}

export interface UsageReading {
    readonly percent: number;
    readonly level: Level;
    readonly suffix: string;
}
