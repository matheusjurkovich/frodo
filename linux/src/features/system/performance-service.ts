import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {Emitter} from '../../shared/emitter.js';
import {readTextFile} from '../../shared/files.js';
import {Timer} from '../../shared/timer.js';
import {parseMeminfo} from './memory.js';
import {
    averageMhz,
    busiest,
    cpuUsage,
    engineBusy,
    isProtected,
    mergeEngines,
    parseCpuStat,
    parseDiskStats,
    parseDrmFdinfo,
    parseProcStat,
    parseSwap,
    pushHistory,
} from './performance.js';
import type {CpuTimes, DiskIo, DrmClient} from './performance.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
Gio._promisify(Gio.File.prototype, 'query_filesystem_info_async', 'query_filesystem_info_finish');
Gio._promisify(Gio.Subprocess.prototype, 'wait_check_async', 'wait_check_finish');

const SAMPLE_SECONDS = 2;
const HISTORY_SIZE = 30;
const TICKS_PER_SECOND = 100;
const PAGE_BYTES = 4096;
const SECTOR_BYTES = 512;
const DRM_SCAN_EVERY = 5;
const ENUMERATE_BATCH = 256;
const CPU_SENSORS = ['coretemp', 'k10temp', 'zenpower', 'cpu_thermal'];

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

interface Child {
    readonly name: string;
    readonly info: Gio.FileInfo;
}

interface Engines {
    readonly engines: Record<string, number>;
    readonly capacity: Record<string, number>;
    readonly driver: string;
}

async function children(path: string, attributes: string, cancellable: Gio.Cancellable): Promise<Child[]> {
    try {
        const enumerator = await Gio.File.new_for_path(path).enumerate_children_async(
            attributes,
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_LOW,
            cancellable,
        );
        const result: Child[] = [];
        for (;;) {
            const batch = await enumerator.next_files_async(ENUMERATE_BATCH, GLib.PRIORITY_LOW, cancellable);
            if (batch.length === 0) break;
            for (const info of batch) result.push({name: info.get_name(), info});
        }
        enumerator.close(null);
        return result;
    } catch {
        return [];
    }
}

export class PerformanceMonitor extends Emitter<{changed: []}> {
    readonly #timer = new Timer();
    readonly #uid = new Gio.Credentials().get_unix_user();
    #cancellable = new Gio.Cancellable();
    #running = false;
    #busy = false;
    #destroyed = false;
    #cycle = 0;
    #sampledAt = 0;
    #cpu: CpuTimes | null = null;
    #disk: DiskIo | null = null;
    #ticks = new Map<number, number>();
    #drmFds = new Map<number, string[]>();
    #gpu = new Map<number, Record<string, number>>();
    #cpuHistory: number[] = [];
    #gpuHistory: number[] = [];
    #sensor: string | null | undefined = undefined;
    #snapshot: PerformanceSnapshot | null = null;

    get snapshot(): PerformanceSnapshot | null {
        return this.#snapshot;
    }

    start(): void {
        if (this.#running || this.#destroyed) return;
        this.#running = true;
        this.#cancellable = new Gio.Cancellable();
        void this.#sample();
        this.#timer.every(SAMPLE_SECONDS, () => {
            void this.#sample();
        });
    }

    stop(): void {
        this.#running = false;
        this.#timer.stop();
        this.#cancellable.cancel();
        this.#cpu = null;
        this.#disk = null;
        this.#ticks = new Map();
        this.#gpu = new Map();
        this.#drmFds = new Map();
        this.#cycle = 0;
        this.#cpuHistory = [];
        this.#gpuHistory = [];
    }

    async kill(pid: number): Promise<boolean> {
        try {
            const process = Gio.Subprocess.new(['kill', '-TERM', String(pid)], Gio.SubprocessFlags.STDERR_SILENCE);
            return await process.wait_check_async(null);
        } catch {
            return false;
        }
    }

    async #sample(): Promise<void> {
        if (this.#busy || !this.#running) return;
        this.#busy = true;
        try {
            await this.#collect();
        } finally {
            this.#busy = false;
        }
    }

    async #collect(): Promise<void> {
        const cancellable = this.#cancellable;
        const now = GLib.get_monotonic_time();
        const elapsedSeconds = this.#sampledAt > 0 ? (now - this.#sampledAt) / 1e6 : 0;
        const [stat, meminfo, cpuinfo, diskstats, filesystem, temperature, entries] = await Promise.all([
            readTextFile('/proc/stat'),
            readTextFile('/proc/meminfo'),
            readTextFile('/proc/cpuinfo'),
            readTextFile('/proc/diskstats'),
            this.#filesystem(cancellable),
            this.#temperature(cancellable),
            children('/proc', 'standard::name,unix::uid', cancellable),
        ]);
        const pids = entries
            .filter(entry => /^\d+$/.test(entry.name))
            .map(entry => ({pid: Number(entry.name), uid: entry.info.get_attribute_uint32('unix::uid')}));
        const stats = await Promise.all(pids.map(({pid}) => readTextFile(`/proc/${pid}/stat`)));
        if (this.#cycle % DRM_SCAN_EVERY === 0)
            await this.#scanDrm(
                pids.filter(({uid}) => uid === this.#uid).map(({pid}) => pid),
                cancellable,
            );
        const engines = await this.#readEngines();
        if (this.#destroyed || !this.#running || cancellable.is_cancelled()) return;
        this.#cycle++;
        this.#sampledAt = now;

        const cpuStat = stat === null ? null : parseCpuStat(stat);
        const cores = cpuStat?.cores ?? 1;
        const usage = cpuStat && this.#cpu ? cpuUsage(this.#cpu, cpuStat.times) : 0;
        if (cpuStat && this.#cpu) this.#cpuHistory = pushHistory(this.#cpuHistory, usage, HISTORY_SIZE);
        this.#cpu = cpuStat?.times ?? null;

        const elapsedNs = elapsedSeconds * 1e9;
        const tracker = Shell.WindowTracker.get_default();
        const ticks = new Map<number, number>();
        const gpuTotals: Record<string, number> = {};
        const nextGpu = new Map<number, Record<string, number>>();
        let driver = '';
        const processes: ProcessSample[] = [];
        pids.forEach(({pid, uid}, index) => {
            const text = stats[index];
            const parsed = text ? parseProcStat(text) : null;
            if (!parsed) return;
            ticks.set(pid, parsed.ticks);
            const before = this.#ticks.get(pid);
            const cpu =
                before === undefined || elapsedSeconds <= 0
                    ? 0
                    : Math.max(0, (parsed.ticks - before) / (elapsedSeconds * TICKS_PER_SECOND * cores));
            let gpu: number | null = null;
            const own = engines.get(pid);
            if (own) {
                driver ||= own.driver;
                nextGpu.set(pid, own.engines);
                const busy = engineBusy(this.#gpu.get(pid) ?? {}, own.engines, elapsedNs, own.capacity);
                for (const [engine, fraction] of Object.entries(busy)) gpuTotals[engine] = (gpuTotals[engine] ?? 0) + fraction;
                gpu = busiest(busy);
            }
            const app = tracker.get_app_from_pid(pid) as Shell.App | null;
            processes.push({
                pid,
                name: app?.get_name() ?? parsed.name,
                cpu,
                ramBytes: parsed.rssPages * PAGE_BYTES,
                gpu,
                protected: isProtected(parsed.name, uid, this.#uid),
                gicon: app?.get_icon() ?? null,
            });
        });
        this.#ticks = ticks;
        this.#gpu = nextGpu;
        const gpuUsage = busiest(gpuTotals);
        if (driver !== '' && elapsedSeconds > 0) this.#gpuHistory = pushHistory(this.#gpuHistory, gpuUsage, HISTORY_SIZE);

        const memory = meminfo === null ? null : parseMeminfo(meminfo);
        const swap = meminfo === null ? null : parseSwap(meminfo);
        const io = diskstats === null ? null : parseDiskStats(diskstats);
        const previousIo = this.#disk;
        this.#disk = io;
        const rate = (now: number, before: number): number =>
            elapsedSeconds > 0 ? Math.max(0, ((now - before) * SECTOR_BYTES) / elapsedSeconds) : 0;

        this.#snapshot = {
            cpu: {usage, cores, mhz: cpuinfo === null ? null : averageMhz(cpuinfo), celsius: temperature},
            cpuHistory: this.#cpuHistory,
            memory: memory && {...memory, swapUsedKb: swap?.usedKb ?? 0, swapTotalKb: swap?.totalKb ?? 0},
            gpu: driver === '' ? null : {usage: gpuUsage, driver},
            gpuHistory: this.#gpuHistory,
            disk: filesystem && {
                ...filesystem,
                readBps: io && previousIo ? rate(io.readSectors, previousIo.readSectors) : 0,
                writeBps: io && previousIo ? rate(io.writeSectors, previousIo.writeSectors) : 0,
            },
            processes,
        };
        this.emit('changed');
    }

    async #filesystem(cancellable: Gio.Cancellable): Promise<{usedBytes: number; totalBytes: number} | null> {
        try {
            const info = await Gio.File.new_for_path('/').query_filesystem_info_async(
                'filesystem::size,filesystem::free',
                GLib.PRIORITY_LOW,
                cancellable,
            );
            const totalBytes = info.get_attribute_uint64('filesystem::size');
            return {totalBytes, usedBytes: totalBytes - info.get_attribute_uint64('filesystem::free')};
        } catch {
            return null;
        }
    }

    async #temperature(cancellable: Gio.Cancellable): Promise<number | null> {
        if (this.#sensor === undefined) {
            this.#sensor = null;
            for (const {name} of await children('/sys/class/hwmon', 'standard::name', cancellable)) {
                const kind = (await readTextFile(`/sys/class/hwmon/${name}/name`))?.trim() ?? '';
                if (!CPU_SENSORS.includes(kind)) continue;
                this.#sensor = `/sys/class/hwmon/${name}/temp1_input`;
                break;
            }
        }
        if (this.#sensor === null) return null;
        const milli = Number((await readTextFile(this.#sensor))?.trim());
        return Number.isFinite(milli) && milli > 0 ? milli / 1000 : null;
    }

    async #scanDrm(pids: readonly number[], cancellable: Gio.Cancellable): Promise<void> {
        const found = new Map<number, string[]>();
        await Promise.all(
            pids.map(async pid => {
                const fds = await children(`/proc/${pid}/fd`, 'standard::name,standard::symlink-target', cancellable);
                const drm = fds.filter(({info}) => info.get_symlink_target()?.startsWith('/dev/dri/')).map(({name}) => name);
                if (drm.length > 0) found.set(pid, drm);
            }),
        );
        this.#drmFds = found;
    }

    async #readEngines(): Promise<Map<number, Engines>> {
        const result = new Map<number, Engines>();
        await Promise.all(
            [...this.#drmFds].map(async ([pid, fds]) => {
                const texts = await Promise.all(fds.map(fd => readTextFile(`/proc/${pid}/fdinfo/${fd}`)));
                const clients = texts
                    .map(text => (text === null ? null : parseDrmFdinfo(text)))
                    .filter((client): client is DrmClient => client !== null);
                const first = clients[0];
                if (!first) return;
                result.set(pid, {engines: mergeEngines(clients), capacity: {...first.capacity}, driver: first.driver});
            }),
        );
        return result;
    }

    destroy(): void {
        this.#destroyed = true;
        this.stop();
        this.clearListeners();
    }
}
