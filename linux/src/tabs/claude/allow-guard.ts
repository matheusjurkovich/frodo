import {ALLOW_GUARD_MS} from './allow-guard.const.js';

export function allowBlocked(hoverOpenedAt: number | null, nowMs: number): boolean {
    return hoverOpenedAt !== null && nowMs - hoverOpenedAt < ALLOW_GUARD_MS;
}
