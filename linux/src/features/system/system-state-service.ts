import type {BatteryInfo} from './battery.types.js';
import type {MemoryInfo} from './memory.types.js';
import {Disposables} from '../../shared/disposables.js';
import {Emitter} from '../../shared/emitter.js';
import {Timer} from '../../shared/timer.js';
import {BatteryMonitor} from './battery-service.js';
import {readMemory} from './memory-service.js';
import {ALERT_SECONDS, MEMORY_SECONDS} from './system-state-service.const.js';
import type {SystemStateEvents} from './system-state-service.types.js';

export class SystemState extends Emitter<SystemStateEvents> {
    readonly #battery: BatteryMonitor;
    readonly #disposables = new Disposables();
    readonly #memoryTimer = this.#disposables.own(new Timer());
    #memory: MemoryInfo | null = null;
    #fast = false;
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
        this.#memoryTimer.every(ALERT_SECONDS, () => void this.#readMemory());
    }

    get memory(): MemoryInfo | null {
        return this.#memory;
    }

    get battery(): BatteryInfo | null {
        return this.#battery.battery;
    }

    setMemoryWanted(wanted: boolean): void {
        if (wanted === this.#fast) return;
        this.#fast = wanted;
        this.#epoch++;
        if (wanted) void this.#readMemory();
        this.#memoryTimer.every(wanted ? MEMORY_SECONDS : ALERT_SECONDS, () => void this.#readMemory());
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
        this.#disposables.dispose();
        this.#battery.destroy();
        this.clearListeners();
    }
}
