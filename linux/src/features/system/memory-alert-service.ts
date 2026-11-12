import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {formatGb, memoryAlarm, usedPercent} from './memory.js';
import type {MemoryAlertSource} from './memory-alert-service.types.js';

export class MemoryAlert {
    readonly #state: MemoryAlertSource;
    readonly #off: () => void;
    #alarmed = false;

    constructor(state: MemoryAlertSource) {
        this.#state = state;
        this.#off = state.on('memory', () => {
            this.#check();
        });
    }

    #check(): void {
        const memory = this.#state.memory;
        if (!memory) return;
        const percent = usedPercent(memory);
        const alarmed = memoryAlarm(percent, this.#alarmed);
        if (alarmed && !this.#alarmed)
            Main.notify('Memória alta', `${percent}% da RAM em uso (${formatGb(memory.usedKb)} de ${formatGb(memory.totalKb)})`);
        this.#alarmed = alarmed;
    }

    destroy(): void {
        this.#off();
    }
}
