import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import {Emitter} from '../../shared/emitter.js';
import {readTextFile} from '../../shared/files.js';
import {Timer} from '../../shared/timer.js';
import {DrmReader} from './drm-service.js';
import {parseMeminfo} from './memory.js';
import {
    averageMhz,
    busiest,
    cpuUsage,
    engineBusy,
    isProtected,
    parseCpuStat,
    parseDiskStats,
    parseProcStat,
    parseSwap,
    processCpu,
    pushHistory,
    sumEngines,
} from './performance.js';
import type {CpuTimes, DiskIo} from './performance.types.js';
import {
    SAMPLE_SECONDS,
    DRM_SCAN_EVERY,
    FIRST_SAMPLE_MS,
    MHZ_READ_EVERY,
    HISTORY_SIZE,
    TICKS_PER_SECOND,
    PAGE_BYTES,
    SECTOR_BYTES,
    CPU_SENSORS,
} from './performance-service.const.js';
import type {PerformanceSnapshot, ProcessApp, ProcessSample} from './performance-service.types.js';
import {children} from './proc-service.js';

Gio._promisify(Gio.File.prototype, 'query_filesystem_info_async', 'query_filesystem_info_finish');

Gio._promisify(Gio.Subprocess.prototype, 'wait_check_async', 'wait_check_finish');

export class PerformanceMonitor extends Emitter<{changed: []}> {
    readonly #timer = new Timer();
    readonly #first = new Timer();
    readonly #drm = new DrmReader();
    readonly #uid = new Gio.Credentials().get_unix_user();
    #cancellable = new Gio.Cancellable();
    #wants = 0;
    #busy = false;
    #generation = 0;
    #destroyed = false;
    #cycle = 0;
    #sampledAt = 0;
    #mhz: number | null = null;
    #cpu: CpuTimes | null = null;
    #disk: DiskIo | null = null;
    #ticks = new Map<number, number>();
    #gpu = new Map<number, Record<string, number>>();
    #cpuHistory: number[] = [];
    #gpuHistory: number[] = [];
    #sensor: string | null | undefined = undefined;
    #snapshot: PerformanceSnapshot | null = null;

    get snapshot(): PerformanceSnapshot | null {
        return this.#snapshot;
    }

    start(): void {
        if (this.#destroyed) return;
        this.#wants++;
        if (this.#wants > 1) return;
        this.#cancellable = new Gio.Cancellable();
        this.#first.once(FIRST_SAMPLE_MS, () => {
            void this.#sample();
        });
        this.#timer.every(SAMPLE_SECONDS, () => {
            void this.#sample();
        });
    }

    stop(): void {
        if (this.#wants === 0) return;
        this.#wants--;
        if (this.#wants === 0) this.#halt();
    }

    describe(process: ProcessSample): ProcessApp {
        const app = Shell.WindowTracker.get_default().get_app_from_pid(process.pid) as Shell.App | null;
        return {name: app?.get_name() ?? process.name, gicon: app?.get_icon() ?? null};
    }

    #halt(): void {
        this.#generation++;
        this.#busy = false;
        this.#timer.stop();
        this.#first.stop();
        this.#cancellable.cancel();
        this.#cpu = null;
        this.#disk = null;
        this.#ticks = new Map();
        this.#gpu = new Map();
        this.#drm.reset();
        this.#cycle = 0;
        this.#sampledAt = 0;
        this.#mhz = null;
        this.#cpuHistory = [];
        this.#gpuHistory = [];
        this.#snapshot = null;
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
        if (this.#busy || this.#wants === 0) return;
        const generation = this.#generation;
        this.#busy = true;
        try {
            await this.#collect();
        } finally {
            if (generation === this.#generation) this.#busy = false;
        }
    }

    async #collect(): Promise<void> {
        const cancellable = this.#cancellable;
        const now = GLib.get_monotonic_time();
        const elapsedSeconds = this.#sampledAt > 0 ? (now - this.#sampledAt) / 1e6 : 0;
        const readMhz = this.#cycle % MHZ_READ_EVERY === 0;
        const [stat, meminfo, cpuinfo, diskstats, filesystem, temperature, entries] = await Promise.all([
            readTextFile('/proc/stat'),
            readTextFile('/proc/meminfo'),
            readMhz ? readTextFile('/proc/cpuinfo') : Promise.resolve(null),
            readTextFile('/proc/diskstats'),
            this.#filesystem(cancellable),
            this.#temperature(cancellable),
            children('/proc', 'standard::name,unix::uid', cancellable),
        ]);
        const pids = entries
            .filter(entry => /^\d+$/.test(entry.name))
            .map(entry => ({pid: Number(entry.name), uid: entry.info.get_attribute_uint32('unix::uid')}));
        const stats = await Promise.all(pids.map(({pid}) => readTextFile(`/proc/${pid}/stat`)));
        const tracker = Shell.WindowTracker.get_default();
        if (this.#cycle % DRM_SCAN_EVERY === 0)
            await this.#drm.scan(
                pids
                    .filter(
                        ({pid, uid}) =>
                            uid === this.#uid && (this.#drm.has(pid) || (tracker.get_app_from_pid(pid) as Shell.App | null) !== null),
                    )
                    .map(({pid}) => pid),
                cancellable,
            );
        const engines = await this.#drm.read();
        if (this.#destroyed || this.#wants === 0 || cancellable.is_cancelled()) return;
        this.#cycle++;
        this.#sampledAt = now;
        if (readMhz) this.#mhz = cpuinfo === null ? null : averageMhz(cpuinfo);

        const cpuStat = stat === null ? null : parseCpuStat(stat);
        const cores = cpuStat?.cores ?? 1;
        const usage = cpuStat && this.#cpu ? cpuUsage(this.#cpu, cpuStat.times) : 0;
        if (cpuStat && this.#cpu) this.#cpuHistory = pushHistory(this.#cpuHistory, usage, HISTORY_SIZE);
        this.#cpu = cpuStat?.times ?? null;

        const elapsedNs = elapsedSeconds * 1e9;
        const ticks = new Map<number, number>();
        const busyParts: Record<string, number>[] = [];
        const nextGpu = new Map<number, Record<string, number>>();
        let driver = '';
        const processes: ProcessSample[] = [];
        pids.forEach(({pid, uid}, index) => {
            const text = stats[index];
            const parsed = text ? parseProcStat(text) : null;
            if (!parsed) return;
            ticks.set(pid, parsed.ticks);
            let gpu: number | null = null;
            const own = engines.get(pid);
            if (own) {
                driver ||= own.driver;
                nextGpu.set(pid, own.engines);
                const busy = engineBusy(this.#gpu.get(pid) ?? {}, own.engines, elapsedNs, own.capacity);
                busyParts.push(busy);
                gpu = busiest(busy);
            }
            processes.push({
                pid,
                name: parsed.name,
                cpu: processCpu(this.#ticks.get(pid), parsed.ticks, elapsedSeconds, cores, TICKS_PER_SECOND),
                ramBytes: parsed.rssPages * PAGE_BYTES,
                gpu,
                protected: isProtected(parsed.name, uid, this.#uid),
            });
        });
        this.#ticks = ticks;
        this.#gpu = nextGpu;
        const gpuUsage = busiest(sumEngines(busyParts));
        if (driver !== '' && elapsedSeconds > 0) this.#gpuHistory = pushHistory(this.#gpuHistory, gpuUsage, HISTORY_SIZE);

        const memory = meminfo === null ? null : parseMeminfo(meminfo);
        const swap = meminfo === null ? null : parseSwap(meminfo);
        const io = diskstats === null ? null : parseDiskStats(diskstats);
        const previousIo = this.#disk;
        this.#disk = io;
        const rate = (now: number, before: number): number =>
            elapsedSeconds > 0 ? Math.max(0, ((now - before) * SECTOR_BYTES) / elapsedSeconds) : 0;

        this.#snapshot = {
            cpu: {usage, cores, mhz: this.#mhz, celsius: temperature},
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

    destroy(): void {
        this.#destroyed = true;
        this.#wants = 0;
        this.#halt();
        this.clearListeners();
    }
}
