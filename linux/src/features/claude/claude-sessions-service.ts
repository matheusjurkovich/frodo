import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import type Meta from 'gi://Meta';

import {HOOK_SCRIPT_NAME, hasFrodoHooks, withFrodoHooks} from './agent-hooks.js';
import type {HookedAgent} from './agent-hooks.js';
import {decisionJson, nextState, oldestPending, parentPid, parseHookEvent, parsePending, parseShortstat} from './claude-sessions.js';
import type {Decision, DiffStat, PendingRequest, SessionState} from './claude-sessions.js';
import {Emitter} from '../../shared/emitter.js';
import {Timer} from '../../shared/timer.js';
import {readTextFile} from '../../shared/files.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');

const HOOK_SCRIPT = 'hooks/claude-session.sh';
const SWEEP_SECONDS = 60;
const EXTENSION_UUID = 'frodo@matheusjurkovich';

function agentConfigPath(agent: HookedAgent): string {
    const home = GLib.get_home_dir();
    return agent === 'codex'
        ? GLib.build_filenamev([GLib.getenv('CODEX_HOME') ?? GLib.build_filenamev([home, '.codex']), 'hooks.json'])
        : GLib.build_filenamev([home, '.gemini', 'settings.json']);
}
const BATCH = 64;

function pidAlive(pid: number): boolean {
    return GLib.file_test(`/proc/${pid}`, GLib.FileTest.EXISTS);
}

function readAlive(path: string): string | null {
    try {
        return new TextDecoder().decode(GLib.file_get_contents(path)[1]).trim();
    } catch {
        return null;
    }
}

function isAlive(state: Pick<SessionState, 'pid'>): boolean {
    return state.pid === null || pidAlive(state.pid);
}

function readStat(pid: number): string {
    try {
        return new TextDecoder().decode(GLib.file_get_contents(`/proc/${pid}/stat`)[1]);
    } catch {
        return '';
    }
}

function sessionId(file: Gio.File): string | null {
    const name = file.get_basename() ?? '';
    return name.endsWith('.json') && name.length > '.json'.length ? name.slice(0, -'.json'.length) : null;
}

async function list(directory: Gio.File, cancellable: Gio.Cancellable): Promise<Gio.FileInfo[]> {
    const enumerator = await directory.enumerate_children_async(
        'standard::name,time::modified',
        Gio.FileQueryInfoFlags.NONE,
        GLib.PRIORITY_DEFAULT,
        cancellable,
    );
    const infos: Gio.FileInfo[] = [];
    try {
        for (let batch = await enumerator.next_files_async(BATCH, GLib.PRIORITY_DEFAULT, cancellable); batch.length > 0;) {
            infos.push(...batch);
            batch = await enumerator.next_files_async(BATCH, GLib.PRIORITY_DEFAULT, cancellable);
        }
    } finally {
        enumerator.close(null);
    }
    return infos;
}

async function run(argv: string[], cwd: string, cancellable: Gio.Cancellable): Promise<string | null> {
    try {
        const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE});
        launcher.set_cwd(cwd);
        const process = launcher.spawnv(argv);
        const [stdout] = await process.communicate_utf8_async(null, cancellable);
        return process.get_successful() ? stdout : null;
    } catch {
        return null;
    }
}

export class ClaudeSessions extends Emitter<{changed: []}> {
    readonly #settings: FrodoSettings;
    readonly #dir: string;
    readonly #pendingDir: string;
    readonly #decisionsDir: string;
    readonly #alive: string;
    readonly #pid = GLib.file_read_link('/proc/self');
    readonly #activate: ((window: Meta.Window) => void) | null;
    readonly #states = new Map<string, SessionState>();
    readonly #pending = new Map<string, PendingRequest>();
    readonly #timer = new Timer();
    readonly #cancellable = new Gio.Cancellable();
    readonly #monitor: Gio.FileMonitor;
    readonly #monitorId: number;
    readonly #pendingMonitor: Gio.FileMonitor;
    readonly #pendingMonitorId: number;
    readonly #disposeSettings: () => void;
    #queue: Promise<void> = Promise.resolve();
    #hooksInstalled = false;
    #checkingHooks = false;
    #destroyed = false;

    constructor(
        settings: FrodoSettings,
        root = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'frodo']),
        activate: ((window: Meta.Window) => void) | null = null,
    ) {
        super();
        this.#settings = settings;
        this.#dir = GLib.build_filenamev([root, 'sessions']);
        this.#pendingDir = GLib.build_filenamev([root, 'pending']);
        this.#decisionsDir = GLib.build_filenamev([root, 'decisions']);
        this.#activate = activate;
        for (const dir of [this.#dir, this.#pendingDir, this.#decisionsDir]) GLib.mkdir_with_parents(dir, 0o700);
        this.#alive = GLib.build_filenamev([root, 'alive']);
        GLib.file_set_contents(this.#alive, `${this.#pid}\n`);
        const directory = Gio.File.new_for_path(this.#dir);
        this.#monitor = directory.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, this.#cancellable);
        this.#monitorId = this.#monitor.connect('changed', (_monitor, file, other, type) => {
            this.#onFileChanged(file, other, type);
        });
        const pendingDirectory = Gio.File.new_for_path(this.#pendingDir);
        this.#pendingMonitor = pendingDirectory.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, this.#cancellable);
        this.#pendingMonitorId = this.#pendingMonitor.connect('changed', (_monitor, file, other, type) => {
            this.#onPendingChanged(file, other, type);
        });
        this.#enqueue(async () => {
            await this.#load(directory);
            return this.#loadPending(pendingDirectory);
        });
        void this.#checkHooks();
        this.#disposeSettings = settings.onChanged('disabled-ai', () => {
            this.#changed();
        });
    }

    get sessions(): readonly SessionState[] {
        const enabled = this.#settings.enabledProviders;
        return [...this.#states.values()].filter(state => isAlive(state) && enabled.includes(state.provider));
    }

    get pending(): readonly PendingRequest[] {
        return [...this.#pending.values()].filter(pending => pidAlive(pending.pid));
    }

    pendingFor(sessionId: string): PendingRequest | null {
        return oldestPending(this.pending, sessionId);
    }

    decide(request: PendingRequest, decision: Decision): boolean {
        if (!pidAlive(request.pid)) {
            if (this.#pending.delete(request.key)) this.#changed();
            return false;
        }
        try {
            GLib.file_set_contents(GLib.build_filenamev([this.#decisionsDir, `${request.key}.json`]), decisionJson(decision));
        } catch (error) {
            logError(error as object);
            return false;
        }
        this.#pending.delete(request.key);
        this.#changed();
        return true;
    }

    focus(id: string): boolean {
        const pid = this.#states.get(id)?.pid ?? null;
        if (pid === null || !this.#activate) return false;
        const windows = global.display.list_all_windows();
        for (let current: number | null = pid; current !== null && current > 1; current = parentPid(readStat(current))) {
            const window = windows.find(candidate => (candidate.get_pid() as number) === current);
            if (!window) continue;
            this.#activate(window);
            return true;
        }
        return false;
    }

    dismiss(id: string): void {
        if (this.#remove(id)) this.#changed();
    }

    canOpenPullRequest(): boolean {
        return GLib.find_program_in_path('gh') !== null;
    }

    openPullRequest(id: string): void {
        const cwd = this.#states.get(id)?.cwd;
        if (cwd) void run(['gh', 'pr', 'view', '--web'], cwd, this.#cancellable);
    }

    async diffStat(id: string): Promise<DiffStat | null> {
        const cwd = this.#states.get(id)?.cwd;
        if (!cwd) return null;
        const stdout = await run(['git', 'diff', '--shortstat', 'HEAD'], cwd, this.#cancellable);
        return stdout === null ? null : parseShortstat(stdout);
    }

    hooksInstalled(): boolean {
        if (!this.#hooksInstalled) void this.#checkHooks();
        return this.#hooksInstalled;
    }

    async agentHooksInstalled(agent: HookedAgent): Promise<boolean> {
        return hasFrodoHooks(await readTextFile(agentConfigPath(agent)));
    }

    async installAgentHooks(agent: HookedAgent): Promise<boolean> {
        const path = agentConfigPath(agent);
        const before = await readTextFile(path);
        const script = GLib.build_filenamev([
            GLib.get_user_data_dir(),
            'gnome-shell',
            'extensions',
            EXTENSION_UUID,
            'hooks',
            HOOK_SCRIPT_NAME,
        ]);
        const after = withFrodoHooks(before, agent, script);
        if (after === null) return false;
        if (after === before) return true;
        try {
            GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o700);
            if (before !== null) GLib.file_set_contents(`${path}.frodo.bak`, before);
            GLib.file_set_contents(path, after);
            return true;
        } catch (error) {
            logError(error as object);
            return false;
        }
    }

    async #checkHooks(): Promise<void> {
        if (this.#checkingHooks) return;
        this.#checkingHooks = true;
        const texts = await Promise.all(
            this.#settings.claudeProfiles.map(({configDir}) => readTextFile(GLib.build_filenamev([configDir, 'settings.json']))),
        );
        this.#checkingHooks = false;
        const installed = texts.some(text => text?.includes(HOOK_SCRIPT) ?? false);
        if (installed === this.#hooksInstalled) return;
        this.#hooksInstalled = installed;
        this.#changed();
    }

    #onFileChanged(file: Gio.File, other: Gio.File | null, type: Gio.FileMonitorEvent): void {
        switch (type) {
            case Gio.FileMonitorEvent.CREATED:
            case Gio.FileMonitorEvent.CHANGES_DONE_HINT:
            case Gio.FileMonitorEvent.MOVED_IN:
                this.#enqueue(() => this.#read(file, Date.now()));
                break;
            case Gio.FileMonitorEvent.RENAMED:
                this.#enqueue(async () => {
                    const forgotten = this.#forget(file);
                    return (other !== null && (await this.#read(other, Date.now()))) || forgotten;
                });
                break;
            case Gio.FileMonitorEvent.DELETED:
            case Gio.FileMonitorEvent.MOVED_OUT:
                this.#enqueue(() => Promise.resolve(this.#forget(file)));
                break;
        }
    }

    #onPendingChanged(file: Gio.File, other: Gio.File | null, type: Gio.FileMonitorEvent): void {
        switch (type) {
            case Gio.FileMonitorEvent.CREATED:
            case Gio.FileMonitorEvent.CHANGES_DONE_HINT:
            case Gio.FileMonitorEvent.MOVED_IN:
                this.#enqueue(() => this.#readPending(file));
                break;
            case Gio.FileMonitorEvent.RENAMED:
                this.#enqueue(async () => {
                    const forgotten = this.#forgetPending(file);
                    return (other !== null && (await this.#readPending(other))) || forgotten;
                });
                break;
            case Gio.FileMonitorEvent.DELETED:
            case Gio.FileMonitorEvent.MOVED_OUT:
                this.#enqueue(() => Promise.resolve(this.#forgetPending(file)));
                break;
        }
    }

    #enqueue(work: () => Promise<boolean>): void {
        this.#queue = this.#queue
            .then(async () => {
                if (!this.#destroyed && (await work())) this.#changed();
            })
            .catch((error: unknown) => {
                logError(error as object);
            });
    }

    async #load(directory: Gio.File): Promise<boolean> {
        for (const info of await list(directory, this.#cancellable).catch(() => [])) {
            const modified = (info.get_modification_date_time()?.to_unix() ?? 0) * 1000;
            await this.#read(directory.get_child(info.get_name()), modified || Date.now());
        }
        return true;
    }

    async #loadPending(directory: Gio.File): Promise<boolean> {
        for (const info of await list(directory, this.#cancellable).catch(() => []))
            await this.#readPending(directory.get_child(info.get_name()));
        return true;
    }

    async #readPending(file: Gio.File): Promise<boolean> {
        const text = await readTextFile(file.get_path() ?? '');
        const pending = text === null ? null : parsePending(file.get_basename() ?? '', text);
        if (this.#destroyed || !pending || !pidAlive(pending.pid)) return false;
        const previous = this.#pending.get(pending.key);
        this.#pending.set(pending.key, pending);
        return JSON.stringify(previous) !== JSON.stringify(pending);
    }

    #forgetPending(file: Gio.File): boolean {
        const name = file.get_basename() ?? '';
        return name.endsWith('.json') && this.#pending.delete(name.slice(0, -'.json'.length));
    }

    async #read(file: Gio.File, atMs: number): Promise<boolean> {
        const id = sessionId(file);
        if (id === null) return false;
        const text = await readTextFile(file.get_path() ?? '');
        const event = text === null ? null : parseHookEvent(text);
        if (this.#destroyed || event?.sessionId !== id) return false;
        const previous = this.#states.get(id) ?? null;
        const next = nextState(previous, event, atMs);
        if (!next || !isAlive(next)) return this.#remove(id);
        this.#states.set(id, next);
        return previous === null || JSON.stringify({...previous, updatedAt: 0}) !== JSON.stringify({...next, updatedAt: 0});
    }

    #forget(file: Gio.File): boolean {
        const id = sessionId(file);
        return id !== null && this.#states.delete(id);
    }

    #remove(id: string): boolean {
        GLib.unlink(GLib.build_filenamev([this.#dir, `${id}.json`]));
        return this.#states.delete(id);
    }

    #sweep(): void {
        let removed = false;
        for (const state of [...this.#states.values()]) if (!isAlive(state)) removed = this.#remove(state.sessionId) || removed;
        for (const pending of [...this.#pending.values()])
            if (!pidAlive(pending.pid)) removed = this.#pending.delete(pending.key) || removed;
        if (removed) this.#changed();
    }

    #changed(): void {
        if (this.#destroyed) return;
        const busy =
            this.#pending.size > 0 || [...this.#states.values()].some(state => state.status === 'working' || state.status === 'waiting');
        if (!busy) this.#timer.stop();
        else if (!this.#timer.active)
            this.#timer.every(SWEEP_SECONDS, () => {
                this.#sweep();
            });
        try {
            this.emit('changed');
        } catch (error) {
            logError(error as object);
        }
    }

    destroy(): void {
        this.#destroyed = true;
        this.#disposeSettings();
        this.#timer.stop();
        this.#cancellable.cancel();
        this.#monitor.disconnect(this.#monitorId);
        this.#monitor.cancel();
        this.#pendingMonitor.disconnect(this.#pendingMonitorId);
        this.#pendingMonitor.cancel();
        if (readAlive(this.#alive) === this.#pid) GLib.unlink(this.#alive);
        this.clearListeners();
    }
}
