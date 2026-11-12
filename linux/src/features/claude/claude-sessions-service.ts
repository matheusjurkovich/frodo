import GLib from 'gi://GLib';
import type Gio from 'gi://Gio';
import type Meta from 'gi://Meta';
import {AgentHooks} from './agent-hooks-service.js';
import type {HookedAgent} from './agent-hooks.types.js';
import {decisionJson, nextState, oldestPending, parseHookEvent, parsePending} from './claude-sessions.js';
import type {ClaudeSessionsDependencies} from './claude-sessions-service.types.js';
import type {Decision, DiffStat, PendingRequest, SessionState} from './claude-sessions.types.js';
import {focusProcessWindow} from './process-window-service.js';
import {RepoActions} from './repo-actions-service.js';
import {WatchedDirectory} from './watched-directory-service.js';
import {Emitter} from '../../shared/emitter.js';
import {Disposables} from '../../shared/disposables.js';
import {Timer} from '../../shared/timer.js';
import {readTextFile} from '../../shared/files.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {SWEEP_SECONDS} from './claude-sessions-service.const.js';

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

function jsonKey(file: Gio.File): string | null {
    const name = file.get_basename() ?? '';
    return name.endsWith('.json') && name.length > '.json'.length ? name.slice(0, -'.json'.length) : null;
}

export class ClaudeSessions extends Emitter<{changed: []}> {
    readonly #settings: FrodoSettings;
    readonly #dir: string;
    readonly #decisionsDir: string;
    readonly #alive: string;
    readonly #pid = GLib.file_read_link('/proc/self');
    readonly #activate: ((window: Meta.Window) => void) | null;
    readonly #states = new Map<string, SessionState>();
    readonly #pending = new Map<string, PendingRequest>();
    readonly #disposables = new Disposables();
    readonly #timer = this.#disposables.own(new Timer());
    readonly #hooks: AgentHooks;
    readonly #repo = new RepoActions();
    readonly #sessionsWatch: WatchedDirectory;
    readonly #pendingWatch: WatchedDirectory;
    readonly #disposeSettings: () => void;
    readonly #disposeHooks: () => void;
    #destroyed = false;

    constructor({
        settings,
        root = GLib.getenv('FRODO_RUNTIME_DIR') ?? GLib.build_filenamev([GLib.get_user_runtime_dir(), 'frodo']),
        activate = null,
    }: ClaudeSessionsDependencies) {
        super();
        this.#settings = settings;
        this.#dir = GLib.build_filenamev([root, 'sessions']);
        const pendingDir = GLib.build_filenamev([root, 'pending']);
        this.#decisionsDir = GLib.build_filenamev([root, 'decisions']);
        this.#activate = activate;
        for (const dir of [this.#dir, pendingDir, this.#decisionsDir]) GLib.mkdir_with_parents(dir, 0o700);
        this.#alive = GLib.build_filenamev([root, 'alive']);
        GLib.file_set_contents(this.#alive, `${this.#pid} gnome-shell\n`);
        this.#sessionsWatch = new WatchedDirectory(this.#dir, {
            read: (file, atMs) => this.#read(file, atMs),
            forget: file => this.#forget(file),
            onChanged: () => {
                this.#changed();
            },
        });
        this.#pendingWatch = new WatchedDirectory(pendingDir, {
            read: file => this.#readPending(file),
            forget: file => this.#forgetPending(file),
            onChanged: () => {
                this.#changed();
            },
        });
        void Promise.all([this.#sessionsWatch.ready, this.#pendingWatch.ready]).then(() => {
            this.#changed();
        });
        this.#hooks = new AgentHooks(settings);
        this.#disposeHooks = this.#hooks.on('changed', () => {
            this.#changed();
        });
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
        return pid !== null && this.#activate !== null && focusProcessWindow(pid, this.#activate);
    }

    dismiss(id: string): void {
        if (this.#remove(id)) this.#changed();
    }

    canOpenPullRequest(): boolean {
        return this.#repo.canOpenPullRequest();
    }

    openPullRequest(id: string): void {
        const cwd = this.#states.get(id)?.cwd;
        if (cwd) this.#repo.openPullRequest(cwd);
    }

    async diffStat(id: string): Promise<DiffStat | null> {
        const cwd = this.#states.get(id)?.cwd;
        return cwd ? this.#repo.diffStat(cwd) : null;
    }

    hooksInstalled(): boolean {
        return this.#hooks.claudeInstalled();
    }

    agentHooksInstalled(agent: HookedAgent): Promise<boolean> {
        return this.#hooks.installed(agent);
    }

    installAgentHooks(agent: HookedAgent): Promise<boolean> {
        return this.#hooks.install(agent);
    }

    async #readPending(file: Gio.File): Promise<boolean> {
        const key = jsonKey(file);
        const text = await readTextFile(file.get_path() ?? '');
        const pending = text === null ? null : parsePending(file.get_basename() ?? '', text);
        if (this.#destroyed) return false;
        if (!pending || !pidAlive(pending.pid)) return key !== null && this.#pending.delete(key);
        const previous = this.#pending.get(pending.key);
        this.#pending.set(pending.key, pending);
        return JSON.stringify(previous) !== JSON.stringify(pending);
    }

    #forgetPending(file: Gio.File): boolean {
        const key = jsonKey(file);
        return key !== null && this.#pending.delete(key);
    }

    async #read(file: Gio.File, atMs: number): Promise<boolean> {
        const id = jsonKey(file);
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
        const id = jsonKey(file);
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
        if (this.#pending.size === 0 && this.#states.size === 0) this.#timer.stop();
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
        this.#disposeHooks();
        this.#sessionsWatch.destroy();
        this.#pendingWatch.destroy();
        this.#hooks.destroy();
        this.#repo.destroy();
        this.#disposables.dispose();
        if (readAlive(this.#alive)?.split(' ')[0] === this.#pid) GLib.unlink(this.#alive);
        this.clearListeners();
    }
}
