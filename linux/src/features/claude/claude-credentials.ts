export interface Credentials {
    readonly accessToken: string;
    readonly refreshToken: string | null;
    readonly expiresAt: number;
    readonly subscriptionType: string | null;
    readonly rateLimitTier: string | null;
}

const REFRESH_SKEW_MS = 5 * 60 * 1000;

function optionalText(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

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
    const accessToken = optionalText(data.accessToken);
    if (!accessToken) return null;
    return {
        accessToken,
        refreshToken: optionalText(data.refreshToken),
        expiresAt: Number(data.expiresAt) || 0,
        subscriptionType: optionalText(data.subscriptionType),
        rateLimitTier: optionalText(data.rateLimitTier),
    };
}

export function needsRefresh(expiresAt: number, now: number): boolean {
    return expiresAt > 0 && expiresAt - now <= REFRESH_SKEW_MS;
}
