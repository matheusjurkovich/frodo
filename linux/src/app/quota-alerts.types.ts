import type {ClaudeService} from '../features/claude/claude-service.js';
import type {CodexUsage} from '../features/codex/codex-service.js';
import type {GeminiUsage} from '../features/gemini/gemini-service.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {ProviderNotifier} from '../shared/ui/provider-notifier.js';

export interface QuotaAlertsDependencies {
    readonly settings: FrodoSettings;
    readonly claude: Pick<ClaudeService, 'active' | 'on'>;
    readonly codex: Pick<CodexUsage, 'limits' | 'on'>;
    readonly gemini: Pick<GeminiUsage, 'quota' | 'on'>;
    readonly notifier: Pick<ProviderNotifier, 'notify'>;
}
