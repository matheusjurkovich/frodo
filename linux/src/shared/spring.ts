export interface Spring {
    readonly damping: number;
    readonly ms: number;
}

export const SPRING: Spring = {damping: 0.58, ms: 560};
export const GENTLE_SPRING: Spring = {damping: 0.68, ms: 500};
export const SOFT_SPRING: Spring = {damping: 0.78, ms: 420};
export const FIRM_SPRING: Spring = {damping: 1, ms: 420};

const PEAK_SAMPLES = 200;

export function springProgress(damping: number, t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (damping >= 1) return 1 - (1 - t) ** 3;
    const w = 4 / damping;
    const wd = w * Math.sqrt(1 - damping * damping);
    return 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t));
}

export function springPeak(damping: number): number {
    let peak = 0;
    for (let i = 0; i <= PEAK_SAMPLES; i++) peak = Math.max(peak, springProgress(damping, i / PEAK_SAMPLES));
    return peak;
}

export function springWithin(spring: Spring, from: number, to: number, max: number): Spring {
    return from + (to - from) * springPeak(spring.damping) <= max ? spring : {damping: 1, ms: spring.ms};
}
