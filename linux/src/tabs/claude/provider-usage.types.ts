import type {ClaudeService} from '../../features/claude/claude-service.js';
import type {CodexUsage} from '../../features/codex/codex-service.js';
import type {GeminiUsage} from '../../features/gemini/gemini-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import type {Meter} from '../../shared/meter.types.js';

export interface UsageSources {
    readonly settings: FrodoSettings;
    readonly claude: ClaudeService;
    readonly codex: CodexUsage;
    readonly gemini: GeminiUsage;
}

export interface ProviderUsage {
    readonly meters: (now: number) => Meter[];
    readonly plan: () => string | null;
    readonly empty: () => string;
    readonly refresh: () => void;
    readonly onChanged: (callback: () => void) => () => void;
}
