import GLib from 'gi://GLib';

export class Timer {
    #id = 0;

    get active(): boolean {
        return this.#id !== 0;
    }

    once(ms: number, callback: () => void): void {
        this.stop();
        this.#id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            this.#id = 0;
            callback();
            return GLib.SOURCE_REMOVE;
        });
    }

    every(seconds: number, callback: () => void): void {
        this.stop();
        this.#id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            callback();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop(): void {
        if (this.#id) GLib.source_remove(this.#id);
        this.#id = 0;
    }
}
