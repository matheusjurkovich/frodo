export type SessionStatus = 'working' | 'waiting' | 'done' | 'idle';

export interface HookEvent {
    readonly sessionId: string;
    readonly cwd: string;
    readonly transcriptPath: string;
    readonly name: string;
    readonly tool: string | null;
    readonly input: Record<string, unknown>;
    readonly notificationType: string | null;
    readonly pid: number | null;
}

export interface SessionState {
    readonly sessionId: string;
    readonly cwd: string;
    readonly repo: string;
    readonly transcriptPath: string;
    readonly status: SessionStatus;
    readonly tool: string | null;
    readonly step: string;
    readonly pid: number | null;
    readonly updatedAt: number;
}

export interface DiffStat {
    readonly files: number;
    readonly added: number;
    readonly removed: number;
}

const IDLE_AFTER_MS = 30 * 60 * 1000;
const STEP_KEYS = ['command', 'file_path', 'notebook_path', 'pattern', 'description', 'url', 'query'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function basename(path: string): string {
    return path.replace(/\/+$/, '').split('/').pop() ?? '';
}

export function parseHookEvent(text: string): HookEvent | null {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        return null;
    }
    if (!isRecord(data) || !isRecord(data.event)) return null;
    const {session_id: sessionId, cwd, transcript_path: transcriptPath, hook_event_name: name} = data.event;
    if (typeof sessionId !== 'string' || sessionId === '' || typeof cwd !== 'string' || typeof name !== 'string') return null;
    return {
        sessionId,
        cwd,
        transcriptPath: optionalString(transcriptPath) ?? '',
        name,
        tool: optionalString(data.event.tool_name),
        input: isRecord(data.event.tool_input) ? data.event.tool_input : {},
        notificationType: optionalString(data.event.notification_type),
        pid: typeof data.pid === 'number' && Number.isSafeInteger(data.pid) && data.pid > 0 ? data.pid : null,
    };
}

export function stepFor(tool: string, input: Record<string, unknown>): string {
    for (const key of STEP_KEYS) {
        const value = input[key];
        if (typeof value !== 'string') continue;
        const detail = value.trim().split('\n')[0]?.trim() ?? '';
        if (detail === '') continue;
        return `${tool} ${key.endsWith('_path') ? basename(detail) : detail}`;
    }
    return tool;
}

export function nextState(previous: SessionState | null, event: HookEvent, atMs: number): SessionState | null {
    if (event.name === 'SessionEnd') return null;
    const base = {
        sessionId: event.sessionId,
        cwd: event.cwd,
        repo: basename(event.cwd),
        transcriptPath: event.transcriptPath,
        pid: event.pid ?? previous?.pid ?? null,
        updatedAt: atMs,
    };
    const kept = {status: previous?.status ?? 'idle', tool: previous?.tool ?? null, step: previous?.step ?? ''} as const;
    const tool = event.tool ?? '';
    switch (event.name) {
        case 'SessionStart':
            return {...base, status: 'idle', tool: null, step: ''};
        case 'UserPromptSubmit':
            return {...base, status: 'working', tool: null, step: 'Pensando'};
        case 'PreToolUse':
        case 'PostToolUse':
        case 'PostToolUseFailure':
            return {...base, status: 'working', tool: event.tool, step: stepFor(tool, event.input)};
        case 'PermissionRequest':
            return {...base, status: 'waiting', tool: event.tool, step: stepFor(tool, event.input)};
        case 'Notification':
            if (event.notificationType === 'permission_prompt') return {...base, ...kept, status: 'waiting'};
            if (event.notificationType === 'idle_prompt')
                return previous?.status === 'done' ? previous : {...base, ...kept, status: 'idle'};
            return previous ?? {...base, ...kept};
        case 'PreCompact':
            return {...base, status: 'working', tool: null, step: 'Compactando contexto'};
        case 'Stop':
            return {...base, ...kept, status: 'done'};
        default:
            return previous ?? {...base, ...kept};
    }
}

export function displayStatus(state: SessionState, nowMs: number): SessionStatus {
    return state.status === 'done' && nowMs - state.updatedAt > IDLE_AFTER_MS ? 'idle' : state.status;
}

export function countByStatus(states: readonly SessionState[], nowMs: number): Record<SessionStatus | 'all', number> {
    const counts = {all: states.length, working: 0, waiting: 0, done: 0, idle: 0};
    for (const state of states) counts[displayStatus(state, nowMs)]++;
    return counts;
}

export function parentPid(stat: string): number | null {
    const end = stat.lastIndexOf(')');
    if (end < 0) return null;
    const ppid =
        stat
            .slice(end + 1)
            .trim()
            .split(/\s+/)[1] ?? '';
    return /^\d+$/.test(ppid) ? Number(ppid) : null;
}

export function parseShortstat(text: string): DiffStat | null {
    const files = /(\d+) files? changed/.exec(text);
    if (!files) return null;
    const count = (pattern: RegExp): number => Number(pattern.exec(text)?.[1] ?? 0);
    return {files: Number(files[1]), added: count(/(\d+) insertions?\(\+\)/), removed: count(/(\d+) deletions?\(-\)/)};
}
