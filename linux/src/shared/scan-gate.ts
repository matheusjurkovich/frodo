import {Disposables} from './disposables.js';
import {Timer} from './timer.js';
import type {ScanGateOptions} from './scan-gate.types.js';

export class ScanGate {
    readonly #disposables = new Disposables();
    readonly #timer = this.#disposables.own(new Timer());
    readonly #options: ScanGateOptions;
    #running: Promise<void> | null = null;
    #lastRun = 0;
    #wanted = 0;
    #destroyed = false;

    constructor(options: ScanGateOptions) {
        this.#options = options;
    }

    get running(): boolean {
        return this.#running !== null;
    }

    get lastRun(): number {
        return this.#lastRun;
    }

    run(): Promise<void> {
        if (this.#running) return this.#running;
        this.#lastRun = Date.now();
        this.#running = this.#options.task().finally(() => {
            this.#running = null;
            if (!this.#destroyed) this.#options.onChange();
        });
        if (this.#options.announceStart) this.#options.onChange();
        return this.#running;
    }

    setWanted(wanted: boolean, everySeconds: number): void {
        if (this.#destroyed) return;
        const before = this.#wanted;
        this.#wanted = Math.max(0, before + (wanted ? 1 : -1));
        if (this.#wanted === 0) {
            this.#timer.stop();
            return;
        }
        if (before > 0) return;
        this.#timer.every(everySeconds, () => {
            void this.run();
        });
        void this.run();
    }

    poll(everySeconds: number | null): void {
        this.#timer.stop();
        if (everySeconds === null) return;
        this.#timer.every(everySeconds, () => {
            void this.run();
        });
    }

    destroy(): void {
        this.#destroyed = true;
        this.#disposables.dispose();
    }
}
