import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {GEMINI_MODELS, geminiCells, geminiQuota, pacificDayStart, parseGeminiSession, parseProjects, projectName} from './gemini-usage.js';
import type {GeminiQuota, GeminiRequest} from './gemini-usage.js';
import {Disposables} from '../../shared/disposables.js';
import {Emitter} from '../../shared/emitter.js';
import {Timer} from '../../shared/timer.js';
import {readTextFile} from '../../shared/files.js';
import {KEPT_DAYS, dayStart, summarize} from '../../shared/consumption.js';
import type {ConsumptionSource, ConsumptionSummary, Period, UsageCell} from '../../shared/consumption.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');

const SCAN_SECONDS = 30;
const BATCH = 256;
const ATTRIBUTES = 'standard::name,standard::type,standard::size,time::modified';

interface Found {
    readonly path: string;
    readonly key: string;
    readonly project: string;
    readonly parent: string | null;
}

interface Loaded {
    readonly key: string;
    readonly id: string;
    readonly project: string;
    readonly session: string;
    readonly requests: readonly GeminiRequest[];
}

async function children(dir: string, cancellable: Gio.Cancellable): Promise<Gio.FileInfo[]> {
    try {
        const enumerator = await Gio.File.new_for_path(dir).enumerate_children_async(
            ATTRIBUTES,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_LOW,
            cancellable,
        );
        const infos: Gio.FileInfo[] = [];
        try {
            for (let batch = await enumerator.next_files_async(BATCH, GLib.PRIORITY_LOW, cancellable); batch.length > 0;) {
                infos.push(...batch);
                batch = await enumerator.next_files_async(BATCH, GLib.PRIORITY_LOW, cancellable);
            }
        } finally {
            enumerator.close(null);
        }
        return infos;
    } catch {
        return [];
    }
}

function modifiedMs(info: Gio.FileInfo): number {
    return (info.get_modification_date_time()?.to_unix() ?? 0) * 1000;
}

function isSessionFile(info: Gio.FileInfo, since: number): boolean {
    const name = info.get_name();
    return (
        info.get_file_type() === Gio.FileType.REGULAR && (name.endsWith('.json') || name.endsWith('.jsonl')) && modifiedMs(info) >= since
    );
}

export class GeminiUsage extends Emitter<{changed: []}> implements ConsumptionSource {
    readonly #settings: FrodoSettings;
    readonly #root: string;
    readonly #pollTimer = new Timer();
    readonly #scanTimer = new Timer();
    readonly #disposables = new Disposables();
    readonly #cancellable = new Gio.Cancellable();
    readonly #files = new Map<string, Loaded>();
    #cells: UsageCell[] = [];
    #times: number[] = [];
    #available = false;
    #lastRefresh = 0;
    #refreshing: Promise<void> | null = null;
    #scanning: Promise<void> | null = null;
    #wanted = 0;
    #destroyed = false;

    constructor(settings: FrodoSettings, root = GLib.build_filenamev([GLib.get_home_dir(), '.gemini'])) {
        super();
        this.#settings = settings;
        this.#root = root;
        this.#available = GLib.file_test(this.#tmpDir, GLib.FileTest.IS_DIR);
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
        if (!this.#available || this.#lastRefresh === 0) return null;
        return geminiQuota(this.#times, this.#settings.geminiDailyLimit, Date.now());
    }

    get lastRefresh(): number {
        return this.#lastRefresh;
    }

    get scanning(): boolean {
        return this.#scanning !== null;
    }

    summary(period: Period, now: Date): ConsumptionSummary {
        return summarize(this.#cells, period, now, GEMINI_MODELS);
    }

    refreshIfStale(maxAgeSeconds: number): void {
        if (Date.now() - this.#lastRefresh >= maxAgeSeconds * 1000) void this.refresh();
    }

    refresh(): Promise<void> {
        this.#refreshing ??= this.#load(pacificDayStart(Date.now()), false).finally(() => {
            this.#refreshing = null;
            if (!this.#destroyed) this.emit('changed');
        });
        return this.#refreshing;
    }

    setWanted(wanted: boolean): void {
        if (this.#destroyed) return;
        const before = this.#wanted;
        this.#wanted = Math.max(0, before + (wanted ? 1 : -1));
        if (this.#wanted === 0) {
            this.#scanTimer.stop();
            return;
        }
        if (before > 0) return;
        this.#scanTimer.every(SCAN_SECONDS, () => {
            void this.scan();
        });
        void this.scan();
    }

    scan(): Promise<void> {
        if (this.#scanning) return this.#scanning;
        this.#scanning = this.#load(dayStart(Date.now(), KEPT_DAYS - 1), true).finally(() => {
            this.#scanning = null;
            if (!this.#destroyed) this.emit('changed');
        });
        this.emit('changed');
        return this.#scanning;
    }

    #schedule(): void {
        this.#pollTimer.stop();
        if (!this.#settings.providerEnabled('gemini')) return;
        this.#pollTimer.every(Math.max(1, this.#settings.claudePollMinutes) * 60, () => {
            void this.refresh();
        });
        this.refreshIfStale(60);
    }

    async #load(since: number, prune: boolean): Promise<void> {
        this.#lastRefresh = Date.now();
        this.#available = GLib.file_test(this.#tmpDir, GLib.FileTest.IS_DIR);
        const found = await this.#list(since);
        for (const file of found) {
            if (this.#destroyed) return;
            if (this.#files.get(file.path)?.key === file.key) continue;
            const parsed = parseGeminiSession((await readTextFile(file.path)) ?? '');
            if (!parsed) continue;
            const {id, requests} = parsed;
            this.#files.set(file.path, {key: file.key, id, project: file.project, session: file.parent ?? id, requests});
        }
        if (this.#destroyed) return;
        if (prune) {
            const paths = new Set(found.map(file => file.path));
            for (const path of this.#files.keys()) if (!paths.has(path)) this.#files.delete(path);
        }
        this.#aggregate();
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

    async #list(since: number): Promise<Found[]> {
        const names = await this.#names();
        const found: Found[] = [];
        const add = (dir: string, info: Gio.FileInfo, project: string, parent: string | null): void => {
            found.push({
                path: GLib.build_filenamev([dir, info.get_name()]),
                key: `${modifiedMs(info)}:${info.get_size()}`,
                project,
                parent,
            });
        };
        for (const projectDir of await children(this.#tmpDir, this.#cancellable)) {
            if (projectDir.get_file_type() !== Gio.FileType.DIRECTORY) continue;
            const project = projectName(projectDir.get_name(), names);
            const chats = GLib.build_filenamev([this.#tmpDir, projectDir.get_name(), 'chats']);
            for (const info of await children(chats, this.#cancellable)) {
                if (isSessionFile(info, since)) add(chats, info, project, null);
                if (info.get_file_type() !== Gio.FileType.DIRECTORY) continue;
                const subagents = GLib.build_filenamev([chats, info.get_name()]);
                for (const sub of await children(subagents, this.#cancellable))
                    if (isSessionFile(sub, since)) add(subagents, sub, project, info.get_name());
            }
        }
        return found;
    }

    destroy(): void {
        this.#destroyed = true;
        this.#pollTimer.stop();
        this.#scanTimer.stop();
        this.#disposables.dispose();
        this.#cancellable.cancel();
        this.clearListeners();
    }
}
