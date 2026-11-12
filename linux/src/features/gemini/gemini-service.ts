import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {
    geminiMeters,
    geminiModels,
    geminiCells,
    geminiQuota,
    GeminiSessionParser,
    pacificDayStart,
    parseGeminiSession,
    parseProjects,
    projectName,
} from './gemini-usage.js';
import type {GeminiQuota} from './gemini-usage.types.js';
import type {Meter, MeterSource} from '../../shared/meter.types.js';
import {Disposables} from '../../shared/disposables.js';
import {Emitter} from '../../shared/emitter.js';
import {ScanGate} from '../../shared/scan-gate.js';
import {modifiedMs, readTextFile} from '../../shared/files.js';
import {consumeLines, listIfPresent, readRange} from '../../shared/scan-files.js';
import {dayStart, summarize} from '../../shared/consumption.js';
import {KEPT_DAYS} from '../../shared/consumption.const.js';
import type {ConsumptionSource, ConsumptionSummary, Period, UsageCell} from '../../shared/consumption.types.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {ATTRIBUTES, BATCH, SCAN_SECONDS, STALE_SECONDS} from './gemini-service.const.js';
import type {Loaded, Found, Listing} from './gemini-service.types.js';

function isSessionFile(info: Gio.FileInfo, since: number): boolean {
    const name = info.get_name();
    return (
        info.get_file_type() === Gio.FileType.REGULAR && (name.endsWith('.json') || name.endsWith('.jsonl')) && modifiedMs(info) >= since
    );
}

export class GeminiUsage extends Emitter<{changed: []}> implements ConsumptionSource, MeterSource {
    readonly #settings: FrodoSettings;
    readonly #root: string;
    readonly #disposables = new Disposables();
    readonly #cancellable = new Gio.Cancellable();
    readonly #refresher: ScanGate;
    readonly #scanner: ScanGate;
    readonly #files = new Map<string, Loaded>();
    #queue: Promise<void> = Promise.resolve();
    #cells: UsageCell[] = [];
    #times: number[] = [];
    #available = false;
    #destroyed = false;

    constructor(settings: FrodoSettings, root = GLib.build_filenamev([GLib.get_home_dir(), '.gemini'])) {
        super();
        this.#settings = settings;
        this.#root = root;
        this.#available = GLib.file_test(this.#tmpDir, GLib.FileTest.IS_DIR);
        const onChange = (): void => {
            this.emit('changed');
        };
        this.#refresher = this.#disposables.own(new ScanGate({task: () => this.#load(pacificDayStart(Date.now()), false), onChange}));
        this.#scanner = this.#disposables.own(
            new ScanGate({task: () => this.#load(dayStart(Date.now(), KEPT_DAYS - 1), true), onChange, announceStart: true}),
        );
        this.#disposables.add(
            settings.onChanged(['disabled-ai', 'claude-poll-minutes'], () => {
                this.#schedule();
            }),
        );
        this.#disposables.add(
            settings.onChanged('gemini-daily-limit', () => {
                this.emit('changed');
            }),
        );
        this.#schedule();
    }

    get #tmpDir(): string {
        return GLib.build_filenamev([this.#root, 'tmp']);
    }

    get available(): boolean {
        return this.#available;
    }

    get quota(): GeminiQuota | null {
        if (!this.#available || this.lastRefresh === 0) return null;
        return geminiQuota(this.#times, this.#settings.geminiDailyLimit, Date.now());
    }

    meters(): Meter[] {
        return geminiMeters(this.quota);
    }

    get lastRefresh(): number {
        return Math.max(this.#refresher.lastRun, this.#scanner.lastRun);
    }

    get scanning(): boolean {
        return this.#scanner.running;
    }

    summary(period: Period, now: Date): ConsumptionSummary {
        return summarize(this.#cells, period, now, geminiModels);
    }

    refreshIfStale(maxAgeSeconds: number): void {
        if (Date.now() - this.lastRefresh >= maxAgeSeconds * 1000) void this.refresh();
    }

    refresh(): Promise<void> {
        return this.#refresher.run();
    }

    setWanted(wanted: boolean): void {
        this.#scanner.setWanted(wanted, SCAN_SECONDS);
    }

    scan(): Promise<void> {
        return this.#scanner.run();
    }

    #schedule(): void {
        const enabled = this.#settings.providerEnabled('gemini');
        this.#refresher.poll(enabled ? Math.max(1, this.#settings.claudePollMinutes) * 60 : null);
        if (enabled) this.refreshIfStale(STALE_SECONDS);
    }

    #load(since: number, prune: boolean): Promise<void> {
        const next = this.#queue.then(() => this.#loadNow(since, prune));
        this.#queue = next.catch(() => undefined);
        return next;
    }

    async #loadNow(since: number, prune: boolean): Promise<void> {
        this.#available = GLib.file_test(this.#tmpDir, GLib.FileTest.IS_DIR);
        const {found, complete} = await this.#list(since);
        for (const file of found) {
            if (this.#destroyed) return;
            const loaded = await this.#read(file, this.#files.get(file.path));
            if (loaded) this.#files.set(file.path, loaded);
        }
        if (this.#destroyed) return;
        const oldest = dayStart(Date.now(), KEPT_DAYS - 1);
        const paths = new Set(found.map(file => file.path));
        for (const [path, {modified}] of this.#files)
            if (modified < oldest || (prune && complete && !paths.has(path))) this.#files.delete(path);
        this.#aggregate();
    }

    async #read(file: Found, known: Loaded | undefined): Promise<Loaded | null> {
        if (known?.key === file.key) return null;
        const {path, key, modified, size, project, parent} = file;
        if (!path.endsWith('.jsonl')) {
            const parsed = parseGeminiSession((await readTextFile(path)) ?? '');
            if (!parsed) return null;
            return {
                key,
                modified,
                offset: 0,
                parser: null,
                id: parsed.id,
                project,
                session: parent ?? parsed.id,
                requests: parsed.requests,
            };
        }
        const previous = known?.parser ?? null;
        const resume = previous !== null && known !== undefined && known.offset <= size;
        const parser = resume ? previous : new GeminiSessionParser();
        const start = resume ? known.offset : 0;
        const bytes = await readRange(path, start, size - start, this.#cancellable).catch(() => null);
        if (bytes === null) return null;
        const offset = start + consumeLines(bytes, parser);
        const parsed = parser.result();
        if (!parsed) return null;
        return {key, modified, offset, parser, id: parsed.id, project, session: parent ?? parsed.id, requests: parsed.requests};
    }

    #aggregate(): void {
        const seen = new Set<string>();
        const cells: UsageCell[] = [];
        const times: number[] = [];
        for (const {id, project, session, requests} of this.#files.values()) {
            const fresh = requests.filter(request => !seen.has(`${id}:${request.id}`));
            for (const request of fresh) {
                seen.add(`${id}:${request.id}`);
                times.push(request.at);
            }
            cells.push(...geminiCells(fresh, project, session));
        }
        this.#cells = cells;
        this.#times = times;
    }

    async #names(): Promise<Map<string, string>> {
        const projects = parseProjects(await readTextFile(GLib.build_filenamev([this.#root, 'projects.json'])));
        return new Map(projects.map(([path, name]) => [GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, path, -1) ?? '', name]));
    }

    async #list(since: number): Promise<Listing> {
        const names = await this.#names();
        const found: Found[] = [];
        let complete = true;
        const children = async (dir: string): Promise<Gio.FileInfo[]> => {
            const infos = await listIfPresent(dir, ATTRIBUTES, {batch: BATCH, cancellable: this.#cancellable});
            if (infos === null) complete = false;
            return infos ?? [];
        };
        const add = (dir: string, info: Gio.FileInfo, project: string, parent: string | null): void => {
            const modified = modifiedMs(info);
            const size = info.get_size();
            found.push({path: GLib.build_filenamev([dir, info.get_name()]), key: `${modified}:${size}`, modified, size, project, parent});
        };
        for (const projectDir of await children(this.#tmpDir)) {
            if (projectDir.get_file_type() !== Gio.FileType.DIRECTORY) continue;
            const project = projectName(projectDir.get_name(), names);
            const chats = GLib.build_filenamev([this.#tmpDir, projectDir.get_name(), 'chats']);
            for (const info of await children(chats)) {
                if (isSessionFile(info, since)) add(chats, info, project, null);
                if (info.get_file_type() !== Gio.FileType.DIRECTORY) continue;
                const subagents = GLib.build_filenamev([chats, info.get_name()]);
                for (const sub of await children(subagents)) if (isSessionFile(sub, since)) add(subagents, sub, project, info.get_name());
            }
        }
        return {found, complete};
    }

    destroy(): void {
        this.#destroyed = true;
        this.#disposables.dispose();
        this.#cancellable.cancel();
        this.clearListeners();
    }
}
