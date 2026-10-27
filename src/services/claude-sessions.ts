import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import type Meta from 'gi://Meta';

import {nextState, parentPid, parseHookEvent, parseShortstat} from '../core/claude-sessions.js';
import type {DiffStat, SessionState} from '../core/claude-sessions.js';
import {Emitter} from '../util/emitter.js';
import {Timer} from '../util/timer.js';
import {readTextFile} from './memory.js';
import type {FrodoSettings} from './settings.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');

const HOOK_SCRIPT = 'hooks/claude-session.sh';
const SWEEP_SECONDS = 60;
const BATCH = 64;

function isAlive(state: SessionState): boolean {
    return state.pid === null || GLib.file_test(`/proc/${state.pid}`, GLib.FileTest.EXISTS);
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
    readonly #activate: ((window: Meta.Window) => void) | null;
    readonly #states = new Map<string, SessionState>();
    readonly #timer = new Timer();
    readonly #cancellable = new Gio.Cancellable();
    readonly #monitor: Gio.FileMonitor;
    readonly #monitorId: number;
    #queue: Promise<void> = Promise.resolve();
    #hooksInstalled = false;
    #checkingHooks = false;
    #destroyed = false;

    constructor(
        settings: FrodoSettings,
        dir = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'frodo', 'sessions']),
        activate: ((window: Meta.Window) => void) | null = null,
    ) {
        super();
        this.#settings = settings;
        this.#dir = dir;
        this.#activate = activate;
        GLib.mkdir_with_parents(dir, 0o700);
        const directory = Gio.File.new_for_path(dir);
        this.#monitor = directory.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, this.#cancellable);
        this.#monitorId = this.#monitor.connect('changed', (_monitor, file, other, type) => {
            this.#onFileChanged(file, other, type);
        });
        this.#enqueue(() => this.#load(directory));
        void this.#checkHooks();
    }

    get sessions(): readonly SessionState[] {
        return [...this.#states.values()].filter(isAlive);
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

    #enqueue(work: () => Promise<boolean>): void {
        this.#queue = this.#queue.then(async () => {
            if (!this.#destroyed && (await work())) this.#changed();
        });
    }

    async #load(directory: Gio.File): Promise<boolean> {
        for (const info of await list(directory, this.#cancellable).catch(() => [])) {
            const modified = (info.get_modification_date_time()?.to_unix() ?? 0) * 1000;
            await this.#read(directory.get_child(info.get_name()), modified || Date.now());
        }
        return true;
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
        if (removed) this.#changed();
    }

    #changed(): void {
        if (this.#destroyed) return;
        const busy = [...this.#states.values()].some(state => state.status === 'working' || state.status === 'waiting');
        if (!busy) this.#timer.stop();
        else if (!this.#timer.active)
            this.#timer.every(SWEEP_SECONDS, () => {
                this.#sweep();
            });
        this.emit('changed');
    }

    destroy(): void {
        this.#destroyed = true;
        this.#timer.stop();
        this.#cancellable.cancel();
        this.#monitor.disconnect(this.#monitorId);
        this.#monitor.cancel();
        this.clearListeners();
    }
}
