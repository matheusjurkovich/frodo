import GLib from 'gi://GLib';
import {hasFrodoHooks, withFrodoHooks} from './agent-hooks.js';
import {HOOK_SCRIPT_NAME} from './agent-hooks.const.js';
import type {HookedAgent} from './agent-hooks.types.js';
import {Emitter} from '../../shared/emitter.js';
import {readTextFile} from '../../shared/files.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {EXTENSION_UUID, RECHECK_SECONDS} from './agent-hooks-service.const.js';

function agentConfigPath(agent: HookedAgent, claudeDir: string): string {
    const home = GLib.get_home_dir();
    if (agent === 'claude') return GLib.build_filenamev([claudeDir, 'settings.json']);
    return agent === 'codex'
        ? GLib.build_filenamev([GLib.getenv('CODEX_HOME') ?? GLib.build_filenamev([home, '.codex']), 'hooks.json'])
        : GLib.build_filenamev([home, '.gemini', 'settings.json']);
}

export class AgentHooks extends Emitter<{changed: []}> {
    readonly #settings: FrodoSettings;
    readonly #claudeDir: string;
    #claudeInstalled = false;
    #claudeDirExists = false;
    #checking = false;
    #checkedAt = 0;
    #destroyed = false;

    constructor(settings: FrodoSettings, claudeDir = GLib.build_filenamev([GLib.get_home_dir(), '.claude'])) {
        super();
        this.#settings = settings;
        this.#claudeDir = claudeDir;
        void this.#check();
    }

    claudeInstalled(): boolean {
        if (!this.#claudeInstalled && Date.now() - this.#checkedAt >= RECHECK_SECONDS * 1000) void this.#check();
        return this.#claudeInstalled;
    }

    claudeDirExists(): boolean {
        return this.#claudeDirExists;
    }

    async installed(agent: HookedAgent): Promise<boolean> {
        return hasFrodoHooks(await readTextFile(agentConfigPath(agent, this.#claudeDir)));
    }

    async install(agent: HookedAgent): Promise<boolean> {
        const path = agentConfigPath(agent, this.#claudeDir);
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
        if (after !== before) {
            try {
                GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o700);
                if (before !== null) GLib.file_set_contents(`${path}.frodo.bak`, before);
                GLib.file_set_contents(path, after);
            } catch (error) {
                logError(error as object);
                return false;
            }
        }
        if (agent === 'claude' && !this.#claudeInstalled && !this.#destroyed) {
            this.#claudeInstalled = true;
            this.emit('changed');
        }
        return true;
    }

    async #check(): Promise<void> {
        if (this.#checking) return;
        this.#checking = true;
        this.#checkedAt = Date.now();
        const texts = await Promise.all(
            this.#settings.claudeProfiles.map(({configDir}) => readTextFile(GLib.build_filenamev([configDir, 'settings.json']))),
        );
        this.#checking = false;
        const installed = texts.some(hasFrodoHooks);
        const dirExists = GLib.file_test(this.#claudeDir, GLib.FileTest.IS_DIR);
        if (this.#destroyed || (installed === this.#claudeInstalled && dirExists === this.#claudeDirExists)) return;
        this.#claudeInstalled = installed;
        this.#claudeDirExists = dirExists;
        this.emit('changed');
    }

    destroy(): void {
        this.#destroyed = true;
        this.clearListeners();
    }
}
