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
