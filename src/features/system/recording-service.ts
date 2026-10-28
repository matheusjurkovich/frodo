import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Emitter} from '../../shared/emitter.js';

interface ScreencastUi {
    readonly screencast_in_progress: boolean;
    stopScreencast(): Promise<void>;
    connect(signal: 'notify::screencast-in-progress', callback: () => void): number;
    disconnect(id: number): void;
}

export class Recording extends Emitter<{changed: []}> {
    readonly #ui = Main.screenshotUI as ScreencastUi;
    readonly #signalId: number;
    #startedAt: number | null;

    constructor() {
        super();
        this.#startedAt = this.#ui.screencast_in_progress ? Date.now() : null;
        this.#signalId = this.#ui.connect('notify::screencast-in-progress', () => {
            const active = this.#ui.screencast_in_progress;
            if (active === (this.#startedAt !== null)) return;
            this.#startedAt = active ? Date.now() : null;
            this.emit('changed');
        });
    }

    get startedAt(): number | null {
        return this.#startedAt;
    }

    stop(): void {
        this.#ui.stopScreencast().catch(() => undefined);
    }

    destroy(): void {
        this.#ui.disconnect(this.#signalId);
        this.clearListeners();
    }
}
