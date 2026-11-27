export function springProgress(damping: number, t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (damping >= 1) return 1 - (1 - t) ** 3;
    const w = 4 / damping;
    const wd = w * Math.sqrt(1 - damping * damping);
    return 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t));
}
