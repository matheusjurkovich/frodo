import type Clutter from 'gi://Clutter';
import type {ClaudeSessions} from '../../features/claude/claude-sessions-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';

export interface AiSectionDependencies {
    readonly settings: FrodoSettings;
    readonly sessions: ClaudeSessions;
    readonly grabKeyboard: (focus: Clutter.Actor) => void;
}
