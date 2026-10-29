export function moveTo<T>(items: readonly T[], item: T, index: number): T[] {
    if (!items.includes(item)) return [...items];
    const next = items.filter(other => other !== item);
    next.splice(Math.min(next.length, Math.max(0, index)), 0, item);
    return next;
}
