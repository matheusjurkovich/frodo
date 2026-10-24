import type {BatteryInfo, MemoryInfo} from '../core/types.js';
import {Disposables} from '../util/disposables.js';
import {Emitter} from '../util/emitter.js';
import {Timer} from '../util/timer.js';
import {BatteryMonitor} from './battery.js';
import {readMemory} from './memory.js';

const MEMORY_SECONDS = 5;

export interface SystemStateEvents {
    memory: [];
    battery: [];
}

export class SystemState extends Emitter<SystemStateEvents> {
    memory: MemoryInfo | null = null;

    readonly #battery = new BatteryMonitor();
    readonly #memoryTimer = new Timer();
    readonly #disposables = new Disposables();
    #destroyed = false;

    constructor() {
        super();
        this.#disposables.add(
            this.#battery.on('changed', () => {
                this.emit('battery');
            }),
        );
    }

    get battery(): BatteryInfo | null {
        return this.#battery.battery;
    }

    setMemoryWanted(wanted: boolean): void {
        if (wanted === this.#memoryTimer.active) return;
        if (!wanted) {
            this.#memoryTimer.stop();
            return;
        }
        void this.#readMemory();
        this.#memoryTimer.every(MEMORY_SECONDS, () => void this.#readMemory());
    }

    async #readMemory(): Promise<void> {
        const memory = await readMemory();
        if (this.#destroyed) return;
        this.memory = memory;
        this.emit('memory');
    }

    destroy(): void {
        this.#destroyed = true;
        this.#memoryTimer.stop();
        this.#disposables.dispose();
        this.#battery.destroy();
        this.clearListeners();
    }
}
