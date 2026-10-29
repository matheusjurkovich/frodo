export interface CpuTimes {
    readonly busy: number;
    readonly total: number;
}

export interface CpuStat {
    readonly times: CpuTimes;
    readonly cores: number;
}

export interface ProcStat {
    readonly pid: number;
    readonly name: string;
    readonly ticks: number;
    readonly rssPages: number;
}

export interface DrmClient {
    readonly id: string;
    readonly driver: string;
    readonly engines: Readonly<Record<string, number>>;
    readonly capacity: Readonly<Record<string, number>>;
}

export interface DiskIo {
    readonly readSectors: number;
    readonly writeSectors: number;
}

export interface Swap {
    readonly totalKb: number;
    readonly usedKb: number;
}

const WHOLE_DISK = /^(nvme\d+n\d+|sd[a-z]+|vd[a-z]+|xvd[a-z]+|hd[a-z]+|mmcblk\d+)$/;

export const PROTECTED_NAMES: readonly string[] = [
    'gnome-shell',
    'Xwayland',
    'systemd',
    'gnome-session-binary',
    'gnome-session-service',
    'dbus-daemon',
    'dbus-broker',
    'pipewire',
    'pipewire-pulse',
    'wireplumber',
    'gdm-wayland-session',
];

export function parseCpuStat(text: string): CpuStat | null {
    const lines = text.split('\n');
    const fields = lines[0]?.startsWith('cpu ') ? lines[0].trim().split(/\s+/).slice(1, 9).map(Number) : [];
    if (fields.length < 4 || fields.some(Number.isNaN)) return null;
    const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
    const total = fields.reduce((sum, value) => sum + value, 0);
    const cores = lines.filter(line => /^cpu\d+ /.test(line)).length;
    return {times: {busy: total - idle, total}, cores: Math.max(1, cores)};
}

export function cpuUsage(previous: CpuTimes, next: CpuTimes): number {
    const total = next.total - previous.total;
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, (next.busy - previous.busy) / total));
}

export function averageMhz(cpuinfo: string): number | null {
    const values = [...cpuinfo.matchAll(/^cpu MHz\s*:\s*([\d.]+)/gm)].map(match => Number(match[1]));
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function parseSwap(meminfo: string): Swap | null {
    const total = /^SwapTotal:\s+(\d+)/m.exec(meminfo)?.[1];
    const free = /^SwapFree:\s+(\d+)/m.exec(meminfo)?.[1];
    if (total === undefined || free === undefined) return null;
    return {totalKb: Number(total), usedKb: Number(total) - Number(free)};
}

export function parseDiskStats(text: string): DiskIo {
    let readSectors = 0;
    let writeSectors = 0;
    for (const line of text.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (!WHOLE_DISK.test(parts[2] ?? '')) continue;
        readSectors += Number(parts[5]) || 0;
        writeSectors += Number(parts[9]) || 0;
    }
    return {readSectors, writeSectors};
}

export function parseProcStat(text: string): ProcStat | null {
    const open = text.indexOf('(');
    const close = text.lastIndexOf(')');
    if (open < 0 || close < open) return null;
    const pid = Number(text.slice(0, open));
    const rest = text
        .slice(close + 2)
        .trim()
        .split(/\s+/);
    const utime = Number(rest[11]);
    const stime = Number(rest[12]);
    const rss = Number(rest[21]);
    if (!Number.isInteger(pid) || [utime, stime, rss].some(Number.isNaN)) return null;
    return {pid, name: text.slice(open + 1, close), ticks: utime + stime, rssPages: rss};
}

export function parseDrmFdinfo(text: string): DrmClient | null {
    let id = '';
    let driver = '';
    const engines: Record<string, number> = {};
    const capacity: Record<string, number> = {};
    for (const line of text.split('\n')) {
        const [key = '', value = ''] = line.split(/:\s*/, 2);
        if (key === 'drm-client-id') id = value.trim();
        else if (key === 'drm-driver') driver = value.trim();
        else if (key.startsWith('drm-engine-capacity-')) capacity[key.slice('drm-engine-capacity-'.length)] = Number(value) || 1;
        else if (key.startsWith('drm-engine-')) engines[key.slice('drm-engine-'.length)] = Number(value.replace(/\s*ns$/, '')) || 0;
    }
    return id === '' || Object.keys(engines).length === 0 ? null : {id, driver, engines, capacity};
}

export function mergeEngines(clients: readonly DrmClient[]): Record<string, number> {
    const total: Record<string, number> = {};
    const seen = new Set<string>();
    for (const client of clients) {
        if (seen.has(client.id)) continue;
        seen.add(client.id);
        for (const [engine, ns] of Object.entries(client.engines)) total[engine] = (total[engine] ?? 0) + ns;
    }
    return total;
}

export function engineBusy(
    previous: Readonly<Record<string, number>>,
    next: Readonly<Record<string, number>>,
    elapsedNs: number,
    capacity: Readonly<Record<string, number>> = {},
): Record<string, number> {
    const busy: Record<string, number> = {};
    if (elapsedNs <= 0) return busy;
    for (const [engine, ns] of Object.entries(next)) {
        const before = previous[engine];
        if (before === undefined || ns < before) continue;
        busy[engine] = (ns - before) / (elapsedNs * (capacity[engine] ?? 1));
    }
    return busy;
}

export function busiest(busy: Readonly<Record<string, number>>): number {
    return Math.min(1, Math.max(0, ...Object.values(busy)));
}

export function isProtected(name: string, uid: number, ownUid: number): boolean {
    return uid !== ownUid || PROTECTED_NAMES.includes(name);
}

export function topBy<T>(items: readonly T[], value: (item: T) => number, count: number): T[] {
    return [...items].sort((a, b) => value(b) - value(a)).slice(0, count);
}

export function pushHistory(history: readonly number[], value: number, size: number): number[] {
    return [...history, value].slice(-size);
}

const decimal = (value: number): string => value.toFixed(1).replace('.', ',');

export function formatBytes(bytes: number): string {
    if (bytes >= 100 * 1024 ** 3) return `${Math.round(bytes / 1024 ** 3)} GB`;
    if (bytes >= 1024 ** 3) return `${decimal(bytes / 1024 ** 3)} GB`;
    return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function formatRate(bytesPerSecond: number): string {
    if (bytesPerSecond >= 1024 ** 2) return `${Math.round(bytesPerSecond / 1024 ** 2)} MB/s`;
    return `${Math.round(bytesPerSecond / 1024)} kB/s`;
}

export function formatPercent(fraction: number): string {
    return `${decimal(fraction * 100)}%`;
}

export function monogram(name: string): string {
    const letters = name.replace(/[^\p{L}\p{N}]/gu, '');
    return `${letters.charAt(0).toUpperCase()}${letters.charAt(1).toLowerCase()}`;
}
