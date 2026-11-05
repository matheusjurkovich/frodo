import {ACTIVITY_KINDS} from './activity-priority.const.js';
import type {ActivityKind} from './activity-priority.types.js';

export function pickActivity<T extends {readonly kind: ActivityKind}>(candidates: readonly T[]): T | null {
    let best: T | null = null;
    for (const candidate of candidates)
        if (best === null || ACTIVITY_KINDS.indexOf(candidate.kind) < ACTIVITY_KINDS.indexOf(best.kind)) best = candidate;
    return best;
}
