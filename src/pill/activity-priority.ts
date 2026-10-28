export const ACTIVITY_KINDS = [
    'notification',
    'recording',
    'claude-permission',
    'claude-waiting',
    'meeting',
    'volume',
    'claude-working',
    'media',
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export function pickActivity<T extends {readonly kind: ActivityKind}>(candidates: readonly T[]): T | null {
    let best: T | null = null;
    for (const candidate of candidates)
        if (best === null || ACTIVITY_KINDS.indexOf(candidate.kind) < ACTIVITY_KINDS.indexOf(best.kind)) best = candidate;
    return best;
}
