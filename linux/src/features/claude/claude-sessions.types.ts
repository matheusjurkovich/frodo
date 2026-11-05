import type {AiProvider} from '../../settings/schema-values.js';

export type SessionStatus = 'working' | 'waiting' | 'done' | 'idle';

export interface HookEvent {
    readonly provider: AiProvider;
    readonly sessionId: string;
    readonly cwd: string;
    readonly name: string;
    readonly tool: string | null;
    readonly input: Record<string, unknown>;
    readonly notificationType: string | null;
    readonly pid: number | null;
}

export interface SessionState {
    readonly provider: AiProvider;
    readonly sessionId: string;
    readonly cwd: string;
    readonly repo: string;
    readonly status: SessionStatus;
    readonly tool: string | null;
    readonly step: string;
    readonly pid: number | null;
    readonly since: number;
    readonly updatedAt: number;
}

export interface PendingRequest {
    readonly key: string;
    readonly sessionId: string;
    readonly request: string;
    readonly pid: number;
    readonly tool: string;
    readonly since: number;
}

export type Decision = 'allow' | 'deny';

export interface DiffStat {
    readonly files: number;
    readonly added: number;
    readonly removed: number;
}

export interface ContextUsage {
    readonly fraction: number;
    readonly warn: boolean;
    readonly text: string;
}
