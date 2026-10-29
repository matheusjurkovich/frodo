export function moveTo<T>(items: readonly T[], item: T, index: number): T[] {
    if (!items.includes(item)) return [...items];
    const next = items.filter(other => other !== item);
    next.splice(Math.min(next.length, Math.max(0, index)), 0, item);
    return next;
}

export function dropIndex(from: number, target: number, after: boolean): number {
    const to = target + (after ? 1 : 0);
    return from < to ? to - 1 : to;
}
