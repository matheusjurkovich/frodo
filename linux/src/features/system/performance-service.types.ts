import type Gio from 'gi://Gio';

export interface ProcessSample {
    readonly pid: number;
    readonly name: string;
    readonly cpu: number;
    readonly ramBytes: number;
    readonly gpu: number | null;
    readonly protected: boolean;
    readonly gicon: Gio.Icon | null;
}

export interface PerformanceSnapshot {
    readonly cpu: {readonly usage: number; readonly cores: number; readonly mhz: number | null; readonly celsius: number | null};
    readonly cpuHistory: readonly number[];
    readonly memory: {readonly usedKb: number; readonly totalKb: number; readonly swapUsedKb: number; readonly swapTotalKb: number} | null;
    readonly gpu: {readonly usage: number; readonly driver: string} | null;
    readonly gpuHistory: readonly number[];
    readonly disk: {readonly usedBytes: number; readonly totalBytes: number; readonly readBps: number; readonly writeBps: number} | null;
    readonly processes: readonly ProcessSample[];
}

export interface Child {
    readonly name: string;
    readonly info: Gio.FileInfo;
}

export interface Engines {
    readonly engines: Record<string, number>;
    readonly capacity: Record<string, number>;
    readonly driver: string;
}
