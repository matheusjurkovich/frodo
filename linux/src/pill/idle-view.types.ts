import type Clutter from 'gi://Clutter';
import type {ClosedItem} from '../settings/schema-values.types.js';
import type {ClaudeService} from '../features/claude/claude-service.js';
import type {CodexUsage} from '../features/codex/codex-service.js';
import type {GeminiUsage} from '../features/gemini/gemini-service.js';
import type {NotificationBridge} from '../features/notifications/notification-bridge-service.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';
import type {SystemState} from '../features/system/system-state-service.js';

export type MeterItem = Extract<ClosedItem, 'codex-session' | 'codex-weekly' | 'gemini-daily'>;
export type TextItem = Extract<ClosedItem, 'battery' | 'ram' | 'claude-session' | 'claude-weekly'> | MeterItem;

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
