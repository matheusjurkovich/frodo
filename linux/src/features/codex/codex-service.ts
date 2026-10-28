import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {CODEX_MODELS, latestLimits, readRollout} from './codex-usage.js';
import type {CodexLimits, CodexRollout, CodexSession} from './codex-usage.js';
import {Disposables} from '../../shared/disposables.js';
import {Emitter} from '../../shared/emitter.js';
import {Timer} from '../../shared/timer.js';
import {readTextFile} from '../../shared/files.js';
import {KEPT_DAYS, dayStart, summarize} from '../../shared/consumption.js';
import type {ConsumptionSource, ConsumptionSummary, Period} from '../../shared/consumption.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
Gio._promisify(Gio.File.prototype, 'read_async', 'read_finish');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');

const SCAN_SECONDS = 30;
const TAIL_BYTES = 256 * 1024;
const BATCH = 256;
const ATTRIBUTES = 'standard::name,standard::type,standard::size,time::modified';

interface Found {
    readonly path: string;
    readonly key: string;
    readonly modified: number;
    readonly size: number;
}

interface Cached<T> {
    readonly key: string;
    readonly value: T;
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

function newer(a: CodexLimits | null, b: CodexLimits | null): CodexLimits | null {
    if (!a) return b;
    return b && b.at > a.at ? b : a;
}

export class CodexUsage extends Emitter<{changed: []}> implements ConsumptionSource {
    readonly #settings: FrodoSettings;
    readonly #sessionsDir: string;
    readonly #pollTimer = new Timer();
    readonly #scanTimer = new Timer();
    readonly #disposables = new Disposables();
    readonly #cancellable = new Gio.Cancellable();
    readonly #rollouts = new Map<string, Cached<CodexRollout>>();
    readonly #tails = new Map<string, Cached<CodexLimits | null>>();
    #sessions = new Map<string, CodexSession>();
    #limits: CodexLimits | null = null;
    #available = false;
    #lastRefresh = 0;
    #refreshing: Promise<void> | null = null;
    #scanning: Promise<void> | null = null;
    #wanted = 0;
    #destroyed = false;

    constructor(settings: FrodoSettings, root = GLib.build_filenamev([GLib.get_home_dir(), '.codex'])) {
        super();
        this.#settings = settings;
        this.#sessionsDir = GLib.build_filenamev([root, 'sessions']);
        this.#available = GLib.file_test(this.#sessionsDir, GLib.FileTest.IS_DIR);
        this.#disposables.add(
            settings.onChanged(['disabled-ai', 'claude-poll-minutes'], () => {
                this.#schedule();
            }),
        );
        this.#schedule();
    }

    get available(): boolean {
        return this.#available;
    }

    get limits(): CodexLimits | null {
        return this.#limits;
    }

    get lastRefresh(): number {
        return this.#lastRefresh;
    }

    get scanning(): boolean {
        return this.#scanning !== null;
    }

    summary(period: Period, now: Date): ConsumptionSummary {
        return summarize(
            [...this.#rollouts.values()].flatMap(({value}) => value.cells),
            period,
            now,
            CODEX_MODELS,
        );
    }

    session(id: string): CodexSession | null {
        return this.#sessions.get(id) ?? null;
    }

    refreshIfStale(maxAgeSeconds: number): void {
        if (Date.now() - this.#lastRefresh >= maxAgeSeconds * 1000) void this.refresh();
    }

    refresh(): Promise<void> {
        this.#refreshing ??= this.#refreshLimits().finally(() => {
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
        this.#scanning = this.#scan().finally(() => {
            this.#scanning = null;
            if (!this.#destroyed) this.emit('changed');
        });
        this.emit('changed');
        return this.#scanning;
    }

    #schedule(): void {
        this.#pollTimer.stop();
        if (!this.#settings.providerEnabled('codex')) return;
        this.#pollTimer.every(Math.max(1, this.#settings.claudePollMinutes) * 60, () => {
            void this.refresh();
        });
        this.refreshIfStale(60);
    }

    async #refreshLimits(): Promise<void> {
        this.#lastRefresh = Date.now();
        this.#available = GLib.file_test(this.#sessionsDir, GLib.FileTest.IS_DIR);
        const found = (await this.#list(0)).sort((a, b) => b.modified - a.modified);
        for (const file of found) {
            if (this.#destroyed) return;
            const cached = this.#tails.get(file.path);
            const limits = cached?.key === file.key ? cached.value : await this.#tail(file).catch(() => null);
            this.#tails.set(file.path, {key: file.key, value: limits});
            if (!limits) continue;
            this.#limits = newer(this.#limits, limits);
            break;
        }
        const paths = new Set(found.map(file => file.path));
        for (const path of this.#tails.keys()) if (!paths.has(path)) this.#tails.delete(path);
    }

    async #tail({path, size}: Found): Promise<CodexLimits | null> {
        const stream = await Gio.File.new_for_path(path).read_async(GLib.PRIORITY_LOW, this.#cancellable);
        try {
            const offset = Math.max(0, size - TAIL_BYTES);
            stream.seek(offset, GLib.SeekType.SET, this.#cancellable);
            const bytes = new Uint8Array(size - offset);
            let filled = 0;
            while (filled < bytes.length) {
                const chunk = (await stream.read_bytes_async(bytes.length - filled, GLib.PRIORITY_LOW, this.#cancellable)).toArray();
                if (chunk.length === 0) break;
                bytes.set(chunk, filled);
                filled += chunk.length;
            }
            return latestLimits(new TextDecoder().decode(bytes.subarray(0, filled)));
        } finally {
            stream.close(null);
        }
    }

    async #scan(): Promise<void> {
        const found = await this.#list(dayStart(Date.now(), KEPT_DAYS - 1));
        for (const file of found) {
            if (this.#destroyed) return;
            if (this.#rollouts.get(file.path)?.key === file.key) continue;
            const text = await readTextFile(file.path);
            if (text !== null) this.#rollouts.set(file.path, {key: file.key, value: readRollout(text)});
        }
        if (this.#destroyed) return;
        const paths = new Set(found.map(file => file.path));
        for (const path of this.#rollouts.keys()) if (!paths.has(path)) this.#rollouts.delete(path);
        this.#sessions = new Map();
        for (const {value} of this.#rollouts.values()) {
            this.#limits = newer(this.#limits, value.limits);
            if (value.id && value.session) this.#addSession(value.id, value.session);
        }
    }

    #addSession(id: string, session: CodexSession): void {
        const known = this.#sessions.get(id);
        if (!known) {
            this.#sessions.set(id, session);
            return;
        }
        const latest = session.lastAt >= known.lastAt ? session : known;
        this.#sessions.set(id, {
            ...latest,
            tokens: known.tokens + session.tokens,
            startedAt: Math.min(known.startedAt, session.startedAt),
        });
    }

    async #list(since: number): Promise<Found[]> {
        const found: Found[] = [];
        const walk = async (dir: string, depth: number): Promise<void> => {
            for (const info of await children(dir, this.#cancellable)) {
                const path = GLib.build_filenamev([dir, info.get_name()]);
                if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                    if (depth < 3) await walk(path, depth + 1);
                    continue;
                }
                const modified = modifiedMs(info);
                const name = info.get_name();
                if (modified < since || !name.startsWith('rollout-') || !name.endsWith('.jsonl')) continue;
                const size = info.get_size();
                found.push({path, key: `${modified}:${size}`, modified, size});
            }
        };
        await walk(this.#sessionsDir, 0);
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
