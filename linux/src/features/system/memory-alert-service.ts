import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Timer} from '../../shared/timer.js';
import {formatGb, memoryAlarm, usedPercent} from './memory.js';
import {readMemory} from './memory-service.js';
import {CHECK_SECONDS} from './memory-alert-service.const.js';

export class MemoryAlert {
    readonly #read: typeof readMemory;
    readonly #timer = new Timer();
    #alarmed = false;
    #destroyed = false;

    constructor(read = readMemory) {
        this.#read = read;
        this.#timer.every(CHECK_SECONDS, () => void this.#check());
    }

    async #check(): Promise<void> {
        const memory = await this.#read();
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
