import type {ClaudeService} from '../features/claude/claude-service.js';
import type {NotificationBridge} from '../features/notifications/notification-bridge-service.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {SystemState} from '../features/system/system-state-service.js';
import type {ActivityFeed} from './activity-feed.js';
import type {ActivityServices} from './activity-view.types.js';
import type {CodexUsage} from '../features/codex/codex-service.js';
import type {GeminiUsage} from '../features/gemini/gemini-service.js';

export interface PillDependencies extends ActivityServices {
    readonly settings: FrodoSettings;
    readonly state: SystemState;
    readonly claude: ClaudeService;
    readonly codex: CodexUsage;
    readonly gemini: GeminiUsage;
    readonly bridge: NotificationBridge;
    readonly feed: ActivityFeed;
}
