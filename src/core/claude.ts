import type {ClaudeError, Usage, UsageWindow} from './types.js';

type TokenResult = {token: string; error: null} | {token: null; error: Extract<ClaudeError, 'no-credentials' | 'expired'>};

const ERROR_TEXT: Record<ClaudeError, string> = {
    'no-credentials': 'Faça login no Claude Code',
    expired: 'Faça login no Claude Code',
    network: 'Sem conexão',
    http: 'Sem conexão',
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function toWindow(percent: unknown, resetsAt: unknown): UsageWindow | null {
    if (percent === null || percent === undefined) return null;
    const value = Number(percent);
    if (!Number.isFinite(value)) return null;
    return {percent: value, resetsAt: typeof resetsAt === 'string' ? resetsAt : null};
}

function fromLimits(limits: unknown[]): Usage {
    let session: UsageWindow | null = null;
    let weekly: UsageWindow | null = null;
    for (const limit of limits) {
        if (!isRecord(limit)) continue;
        const window = toWindow(limit.percent, limit.resets_at);
        if (!window) continue;
        const {kind, group, scope} = limit;
        if (!session && (kind === 'session' || group === 'session')) session = window;
        else if (!weekly && (kind === 'weekly_all' || (group === 'weekly' && !scope))) weekly = window;
    }
    return {session, weekly};
}

function fromLegacy(json: Record<string, unknown>): Usage {
    const fiveHour = isRecord(json.five_hour) ? json.five_hour : {};
    const sevenDay = isRecord(json.seven_day) ? json.seven_day : {};
    return {
        session: toWindow(fiveHour.utilization, fiveHour.resets_at),
        weekly: toWindow(sevenDay.utilization, sevenDay.resets_at),
    };
}

export function parseUsage(json: unknown): Usage {
    if (!isRecord(json)) return {session: null, weekly: null};
    const limits = json.limits;
    if (Array.isArray(limits) && limits.length > 0) return fromLimits(limits);
    return fromLegacy(json);
}

export function readToken(text: string | null, nowMs: number): TokenResult {
    let root: unknown;
    try {
        root = JSON.parse(text ?? 'null');
    } catch {
        return {token: null, error: 'no-credentials'};
    }
    const oauth = isRecord(root) ? root.claudeAiOauth : null;
    if (!isRecord(oauth) || typeof oauth.accessToken !== 'string' || oauth.accessToken === '')
        return {token: null, error: 'no-credentials'};
    const expiresAt = Number(oauth.expiresAt) || 0;
    if (expiresAt && expiresAt <= nowMs) return {token: null, error: 'expired'};
    return {token: oauth.accessToken, error: null};
}

export function errorForStatus(status: number): Extract<ClaudeError, 'expired' | 'http'> | null {
    if (status >= 200 && status < 300) return null;
    if (status === 401 || status === 403) return 'expired';
    return 'http';
}

export function claudeErrorText(error: ClaudeError | null): string {
    return error ? ERROR_TEXT[error] : '';
}
