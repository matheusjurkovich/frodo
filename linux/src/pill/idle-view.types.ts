import type Clutter from 'gi://Clutter';
import type {ClaudeService} from '../features/claude/claude-service.js';
import type {CodexUsage} from '../features/codex/codex-service.js';
import type {GeminiUsage} from '../features/gemini/gemini-service.js';
import type {NotificationBridge} from '../features/notifications/notification-bridge-service.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {SystemState} from '../features/system/system-state-service.js';
import type {Disposables} from '../shared/disposables.js';

export interface IdleViewDependencies {
    readonly settings: FrodoSettings;
    readonly state: SystemState;
    readonly claude: ClaudeService;
    readonly codex: CodexUsage;
    readonly gemini: GeminiUsage;
    readonly bridge: NotificationBridge;
}

export interface Segment {
    readonly actor: Clutter.Actor;
    readonly isVisible: () => boolean;
    readonly update: () => void;
}

export interface SegmentContext extends IdleViewDependencies {
    readonly built: Disposables;
    readonly refresh: () => void;
    readonly rebuild: () => void;
}
