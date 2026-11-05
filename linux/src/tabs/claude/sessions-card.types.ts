import type {SessionState, SessionStatus} from '../../features/claude/claude-sessions.types.js';

export type Filter = SessionStatus | 'all';

export interface Entry {
    readonly state: SessionState;
    readonly status: SessionStatus;
}
