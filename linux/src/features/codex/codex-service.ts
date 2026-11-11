import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {codexModels, dayDirEnded, latestLimits, RolloutParser} from './codex-usage.js';
import type {CodexLimits, CodexSession} from './codex-usage.types.js';
import {Disposables} from '../../shared/disposables.js';
import {Emitter} from '../../shared/emitter.js';
import {ScanGate} from '../../shared/scan-gate.js';
import {modifiedMs} from '../../shared/files.js';
import {consumeLines, listIfPresent, readRange} from '../../shared/scan-files.js';
import {dayStart, summarize} from '../../shared/consumption.js';
import {KEPT_DAYS} from '../../shared/consumption.const.js';
import type {ConsumptionSource, ConsumptionSummary, Period} from '../../shared/consumption.types.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {ATTRIBUTES, BATCH, SCAN_SECONDS, STALE_SECONDS, TAIL_BYTES} from './codex-service.const.js';
import type {Cached, Found, Listing, Tracked} from './codex-service.types.js';

function newer(a: CodexLimits | null, b: CodexLimits | null): CodexLimits | null {
    if (!a) return b;
    return b && b.at > a.at ? b : a;
}

function isRollout(name: string): boolean {
    return name.startsWith('rollout-') && name.endsWith('.jsonl');
}

function byNameDescending(a: Gio.FileInfo, b: Gio.FileInfo): number {
    return b.get_name().localeCompare(a.get_name());
}

export class CodexUsage extends Emitter<{changed: []}> implements ConsumptionSource {
    readonly #settings: FrodoSettings;
    readonly #sessionsDir: string;
    readonly #disposables = new Disposables();
    readonly #cancellable = new Gio.Cancellable();
    readonly #refresher: ScanGate;
    readonly #scanner: ScanGate;
    readonly #rollouts = new Map<string, Tracked>();
    #tails = new Map<string, Cached<CodexLimits | null>>();
    #sessions = new Map<string, CodexSession>();
    #limits: CodexLimits | null = null;
    #available = false;
    #destroyed = false;

    constructor(settings: FrodoSettings, root = GLib.build_filenamev([GLib.get_home_dir(), '.codex'])) {
        super();
        this.#settings = settings;
        this.#sessionsDir = GLib.build_filenamev([root, 'sessions']);
        this.#available = GLib.file_test(this.#sessionsDir, GLib.FileTest.IS_DIR);
        const onChange = (): void => {
            this.emit('changed');
        };
        this.#refresher = this.#disposables.own(new ScanGate({task: () => this.#refreshLimits(), onChange}));
        this.#scanner = this.#disposables.own(new ScanGate({task: () => this.#scan(), onChange, announceStart: true}));
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
        return this.#refresher.lastRun;
    }

    get scanning(): boolean {
        return this.#scanner.running;
    }

    summary(period: Period, now: Date): ConsumptionSummary {
        return summarize(
            [...this.#rollouts.values()].flatMap(({value}) => value.cells),
            period,
            now,
            codexModels,
        );
    }

    session(id: string): CodexSession | null {
        return this.#sessions.get(id) ?? null;
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
        const enabled = this.#settings.providerEnabled('codex');
        this.#refresher.poll(enabled ? Math.max(1, this.#settings.claudePollMinutes) * 60 : null);
        if (enabled) this.refreshIfStale(STALE_SECONDS);
    }

    async #refreshLimits(): Promise<void> {
        this.#available = GLib.file_test(this.#sessionsDir, GLib.FileTest.IS_DIR);
        const visited = new Map<string, Cached<CodexLimits | null>>();
        const limits = await this.#newestLimits(visited);
        if (this.#destroyed) return;
        this.#tails = visited;
        if (limits) this.#limits = newer(this.#limits, limits);
    }

    async #newestLimits(visited: Map<string, Cached<CodexLimits | null>>): Promise<CodexLimits | null> {
        const descend = async (dir: string, depth: number): Promise<CodexLimits | null> => {
            const infos = (await listIfPresent(dir, ATTRIBUTES, {batch: BATCH, cancellable: this.#cancellable})) ?? [];
            const folders = depth < 3 ? infos.filter(info => info.get_file_type() === Gio.FileType.DIRECTORY).sort(byNameDescending) : [];
            for (const info of folders) {
                const limits = await descend(GLib.build_filenamev([dir, info.get_name()]), depth + 1);
                if (limits) return limits;
            }
            return this.#limitsIn(dir, infos, visited);
        };
        return descend(this.#sessionsDir, 0);
    }

    async #limitsIn(dir: string, infos: Gio.FileInfo[], visited: Map<string, Cached<CodexLimits | null>>): Promise<CodexLimits | null> {
        const files = infos.filter(info => isRollout(info.get_name())).sort((a, b) => modifiedMs(b) - modifiedMs(a));
        for (const info of files) {
            if (this.#destroyed) return null;
            const path = GLib.build_filenamev([dir, info.get_name()]);
            const size = info.get_size();
            const key = `${modifiedMs(info)}:${size}`;
            const cached = this.#tails.get(path);
            const limits = cached?.key === key ? cached.value : await this.#tail(path, size).catch(() => null);
            visited.set(path, {key, value: limits});
            if (limits) return limits;
        }
        return null;
    }

    async #tail(path: string, size: number): Promise<CodexLimits | null> {
        const offset = Math.max(0, size - TAIL_BYTES);
        const bytes = await readRange(path, offset, size - offset, this.#cancellable);
        return latestLimits(new TextDecoder().decode(bytes));
    }

    async #scan(): Promise<void> {
        const {found, complete} = await this.#list(dayStart(Date.now(), KEPT_DAYS - 1));
        for (const file of found) {
            if (this.#destroyed) return;
            await this.#load(file);
        }
        if (this.#destroyed) return;
        if (complete) {
            const paths = new Set(found.map(file => file.path));
            for (const path of this.#rollouts.keys()) if (!paths.has(path)) this.#rollouts.delete(path);
        }
        this.#sessions = new Map();
        for (const {value} of this.#rollouts.values()) {
            this.#limits = newer(this.#limits, value.limits);
            if (value.id && value.session) this.#addSession(value.id, value.session);
        }
    }

    async #load({path, key, size}: Found): Promise<void> {
        const known = this.#rollouts.get(path);
        if (known?.key === key) return;
        const resume = known !== undefined && known.offset <= size;
        const parser = resume ? known.parser : new RolloutParser();
        const start = resume ? known.offset : 0;
        const bytes = await readRange(path, start, size - start, this.#cancellable).catch(() => null);
        if (bytes === null || this.#destroyed) return;
        const offset = start + consumeLines(bytes, parser);
        this.#rollouts.set(path, {key, offset, parser, value: parser.result()});
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

    async #list(since: number): Promise<Listing> {
        const found: Found[] = [];
        let complete = true;
        const walk = async (dir: string, parts: readonly string[]): Promise<void> => {
            const infos = await listIfPresent(dir, ATTRIBUTES, {batch: BATCH, cancellable: this.#cancellable});
            if (infos === null) {
                complete = false;
                return;
            }
            for (const info of infos) {
                const name = info.get_name();
                const path = GLib.build_filenamev([dir, name]);
                if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                    const next = [...parts, name];
                    if (parts.length < 3 && !dayDirEnded(next, since)) await walk(path, next);
                    continue;
                }
                const modified = modifiedMs(info);
                if (modified < since || !isRollout(name)) continue;
                const size = info.get_size();
                found.push({path, key: `${modified}:${size}`, modified, size});
            }
        };
        await walk(this.#sessionsDir, []);
        return {found, complete};
    }

    destroy(): void {
        this.#destroyed = true;
        this.#disposables.dispose();
        this.#cancellable.cancel();
        this.clearListeners();
    }
}
