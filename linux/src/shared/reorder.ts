import {clamp} from './geometry.js';

export function moveTo<T>(items: readonly T[], item: T, index: number): T[] {
    if (!items.includes(item)) return [...items];
    const next = items.filter(other => other !== item);
    next.splice(clamp(index, 0, next.length), 0, item);
    return next;
}
