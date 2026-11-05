import {URGENCY_CRITICAL} from './notifications.const.js';
import type {InterceptCandidate} from './notifications.types.js';

export function shouldIntercept(notification: InterceptCandidate | null | undefined): notification is InterceptCandidate {
    return !!notification && notification.urgency !== URGENCY_CRITICAL;
}

export function latest<T>(items: readonly T[], timeOf: (item: T) => number, max: number): T[] {
    return [...items].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, max);
}
