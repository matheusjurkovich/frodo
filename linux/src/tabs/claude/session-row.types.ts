import type {SessionStats} from '../../features/claude/claude-index.types.js';
import type {DiffStat, PendingRequest, SessionState, SessionStatus} from '../../features/claude/claude-sessions.types.js';

export interface SessionRowActions {
    readonly toggle: () => void;
    readonly focus: () => void;
    readonly openPullRequest: () => void;
    readonly dismiss: () => void;
    readonly approve: (request: PendingRequest) => void;
    readonly deny: (request: PendingRequest) => void;
}

export interface SessionRowView {
    readonly state: SessionState;
    readonly status: SessionStatus;
    readonly stats: SessionStats | null;
    readonly expanded: boolean;
    readonly diff: DiffStat | null;
    readonly pending: PendingRequest | null;
    readonly canOpenPullRequest: () => boolean;
    readonly nowMs: number;
}
