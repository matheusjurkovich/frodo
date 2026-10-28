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
