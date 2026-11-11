import type {BatteryInfo} from './battery.types.js';
import type {MemoryInfo} from './memory.types.js';
import {Disposables} from '../../shared/disposables.js';
import {Emitter} from '../../shared/emitter.js';
import {Timer} from '../../shared/timer.js';
import {BatteryMonitor} from './battery-service.js';
import {readMemory} from './memory-service.js';
import {MEMORY_SECONDS} from './system-state-service.const.js';
import type {SystemStateEvents} from './system-state-service.types.js';

export class SystemState extends Emitter<SystemStateEvents> {
    readonly #battery: BatteryMonitor;
    readonly #memoryTimer = new Timer();
    readonly #disposables = new Disposables();
    #memory: MemoryInfo | null = null;
    #epoch = 0;
    #destroyed = false;

    constructor(battery = new BatteryMonitor()) {
        super();
        this.#battery = battery;
        this.#disposables.add(
            this.#battery.on('changed', () => {
                this.emit('battery');
            }),
        );
    }

    get memory(): MemoryInfo | null {
        return this.#memory;
    }

    get battery(): BatteryInfo | null {
        return this.#battery.battery;
    }

    setMemoryWanted(wanted: boolean): void {
        if (wanted === this.#memoryTimer.active) return;
        this.#epoch++;
        if (!wanted) {
            this.#memoryTimer.stop();
            return;
        }
        void this.#readMemory();
        this.#memoryTimer.every(MEMORY_SECONDS, () => void this.#readMemory());
    }

    async #readMemory(): Promise<void> {
        const epoch = this.#epoch;
        const memory = await readMemory();
        if (this.#destroyed || epoch !== this.#epoch) return;
        this.#memory = memory;
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
