export function nextPeek(now: Date, everyMinutes: number): Date {
    const step = Math.max(1, Math.round(everyMinutes));
    const minutes = now.getHours() * 60 + now.getMinutes();
    const next = new Date(now);
    next.setHours(0, (Math.floor(minutes / step) + 1) * step, 0, 0);
    return next;
}
