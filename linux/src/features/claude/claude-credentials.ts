import {REFRESH_SKEW_MS} from './claude-credentials.const.js';
import {text} from '../../shared/json.js';
import type {Credentials} from './claude-credentials.types.js';

export function parseCredentials(json: string | null): Credentials | null {
    let root: unknown;
    try {
        root = JSON.parse(json ?? 'null');
    } catch {
        return null;
    }
    const oauth = typeof root === 'object' && root !== null ? (root as Record<string, unknown>).claudeAiOauth : null;
    if (typeof oauth !== 'object' || oauth === null) return null;
    const data = oauth as Record<string, unknown>;
    const accessToken = text(data.accessToken);
    if (!accessToken) return null;
    return {
        accessToken,
        refreshToken: text(data.refreshToken),
        expiresAt: Number(data.expiresAt) || 0,
        subscriptionType: text(data.subscriptionType),
        rateLimitTier: text(data.rateLimitTier),
    };
}

export function needsRefresh(expiresAt: number, now: number): boolean {
    return expiresAt > 0 && expiresAt - now <= REFRESH_SKEW_MS;
}
