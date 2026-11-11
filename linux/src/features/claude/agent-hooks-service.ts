import GLib from 'gi://GLib';
import {hasFrodoHooks, withFrodoHooks} from './agent-hooks.js';
import {HOOK_SCRIPT_NAME} from './agent-hooks.const.js';
import type {HookedAgent} from './agent-hooks.types.js';
import {Emitter} from '../../shared/emitter.js';
import {readTextFile} from '../../shared/files.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {EXTENSION_UUID, RECHECK_SECONDS} from './agent-hooks-service.const.js';

function agentConfigPath(agent: HookedAgent): string {
    const home = GLib.get_home_dir();
    return agent === 'codex'
        ? GLib.build_filenamev([GLib.getenv('CODEX_HOME') ?? GLib.build_filenamev([home, '.codex']), 'hooks.json'])
        : GLib.build_filenamev([home, '.gemini', 'settings.json']);
}

export class AgentHooks extends Emitter<{changed: []}> {
    readonly #settings: FrodoSettings;
    #claudeInstalled = false;
    #checking = false;
    #checkedAt = 0;
    #destroyed = false;

    constructor(settings: FrodoSettings) {
        super();
        this.#settings = settings;
        void this.#check();
    }

    claudeInstalled(): boolean {
        if (!this.#claudeInstalled && Date.now() - this.#checkedAt >= RECHECK_SECONDS * 1000) void this.#check();
        return this.#claudeInstalled;
    }

    async installed(agent: HookedAgent): Promise<boolean> {
        return hasFrodoHooks(await readTextFile(agentConfigPath(agent)));
    }

    async install(agent: HookedAgent): Promise<boolean> {
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

    async #check(): Promise<void> {
        if (this.#checking) return;
        this.#checking = true;
        this.#checkedAt = Date.now();
        const texts = await Promise.all(
            this.#settings.claudeProfiles.map(({configDir}) => readTextFile(GLib.build_filenamev([configDir, 'settings.json']))),
        );
        this.#checking = false;
        const installed = texts.some(hasFrodoHooks);
        if (this.#destroyed || installed === this.#claudeInstalled) return;
        this.#claudeInstalled = installed;
        this.emit('changed');
    }

    destroy(): void {
        this.#destroyed = true;
        this.clearListeners();
    }
}
