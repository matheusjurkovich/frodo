import type {ClaudeService} from '../../features/claude/claude-service.js';
import type {ClaudeSessions} from '../../features/claude/claude-sessions-service.js';
import type {ClaudeTranscripts} from '../../features/claude/claude-transcripts-service.js';
import type {CodexUsage} from '../../features/codex/codex-service.js';
import type {GeminiUsage} from '../../features/gemini/gemini-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import type {AiProvider} from '../../shared/ai-provider.types.js';
import type {ClaudeTabActions} from './limits-card.types.js';

export type View = AiProvider | 'all';

export interface ClaudePageDependencies {
    readonly claude: ClaudeService;
    readonly transcripts: ClaudeTranscripts;
    readonly sessions: ClaudeSessions;
    readonly codex: CodexUsage;
    readonly gemini: GeminiUsage;
    readonly settings: FrodoSettings;
    readonly actions: ClaudeTabActions;
}
