export interface MemoryInfo {
    readonly totalKb: number;
    readonly usedKb: number;
}

export function parseMeminfo(text: string): MemoryInfo | null {
    const total = /^MemTotal:\s+(\d+)/m.exec(text)?.[1];
    const available = /^MemAvailable:\s+(\d+)/m.exec(text)?.[1];
    if (total === undefined || available === undefined) return null;
    const totalKb = Number(total);
    return {totalKb, usedKb: totalKb - Number(available)};
}

export function formatGb(kb: number): string {
    return `${(kb / 1048576).toFixed(1)}G`;
}

const HIGH_MEMORY_PERCENT = 90;
const MEMORY_REARM_PERCENT = 80;

export function usedPercent(memory: MemoryInfo): number {
    return memory.totalKb > 0 ? Math.round((memory.usedKb / memory.totalKb) * 100) : 0;
}

export function memoryAlarm(percent: number, alarmed: boolean): boolean {
    return percent >= (alarmed ? MEMORY_REARM_PERCENT : HIGH_MEMORY_PERCENT);
}
