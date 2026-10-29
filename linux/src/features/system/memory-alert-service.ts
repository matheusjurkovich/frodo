import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Timer} from '../../shared/timer.js';
import {formatGb, memoryAlarm, usedPercent} from './memory.js';
import {readMemory} from './memory-service.js';

const CHECK_SECONDS = 30;

export class MemoryAlert {
    readonly #timer = new Timer();
    #alarmed = false;
    #destroyed = false;

    constructor() {
        this.#timer.every(CHECK_SECONDS, () => void this.#check());
    }

    async #check(): Promise<void> {
        const memory = await readMemory();
        if (this.#destroyed || !memory) return;
        const percent = usedPercent(memory);
        const alarmed = memoryAlarm(percent, this.#alarmed);
        if (alarmed && !this.#alarmed)
            Main.notify('Memória alta', `${percent}% da RAM em uso (${formatGb(memory.usedKb)} de ${formatGb(memory.totalKb)})`);
        this.#alarmed = alarmed;
    }

    destroy(): void {
        this.#destroyed = true;
        this.#timer.stop();
    }
}
