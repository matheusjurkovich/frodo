import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import {parseShortstat} from './claude-sessions.js';
import type {DiffStat} from './claude-sessions.types.js';
import {Timer} from '../../shared/timer.js';
import {RUN_TIMEOUT_SECONDS} from './repo-actions-service.const.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');

export class RepoActions {
    readonly #cancellable = new Gio.Cancellable();

    canOpenPullRequest(): boolean {
        return GLib.find_program_in_path('gh') !== null;
    }

    openPullRequest(cwd: string): void {
        void this.#run(['gh', 'pr', 'view', '--web'], cwd);
    }

    async diffStat(cwd: string): Promise<DiffStat | null> {
        const stdout = await this.#run(['git', 'diff', '--shortstat', 'HEAD'], cwd);
        return stdout === null ? null : parseShortstat(stdout);
    }

    async #run(argv: string[], cwd: string): Promise<string | null> {
        const timeout = new Timer();
        try {
            const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE});
            launcher.set_cwd(cwd);
            const process = launcher.spawnv(argv);
            timeout.once(RUN_TIMEOUT_SECONDS * 1000, () => {
                process.force_exit();
            });
            const [stdout] = await process.communicate_utf8_async(null, this.#cancellable);
            return process.get_successful() ? stdout : null;
        } catch (error) {
            if (!this.#cancellable.is_cancelled()) logError(error as object, `frodo: ${argv.join(' ')}`);
            return null;
        } finally {
            timeout.destroy();
        }
    }

    destroy(): void {
        this.#cancellable.cancel();
    }
}
