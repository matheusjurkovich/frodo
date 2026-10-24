import type {BatteryInfo, ClaudeState, MemoryInfo} from '../core/types.js';
import {Disposables} from '../util/disposables.js';
import {Emitter} from '../util/emitter.js';
import {Timer} from '../util/timer.js';
import {BatteryMonitor} from './battery.js';
import {ClaudeClient} from './claude-client.js';
import {readMemory} from './memory.js';
import type {FrodoSettings} from './settings.js';

const MEMORY_SECONDS = 5;
const MIN_CLAUDE_MINUTES = 2;

export interface SystemStateEvents {
    memory: [];
    battery: [];
    claude: [];
}

export class SystemState extends Emitter<SystemStateEvents> {
    memory: MemoryInfo | null = null;
    claude: ClaudeState = {session: null, weekly: null, error: null, fetchedAt: 0};

    readonly #settings: FrodoSettings;
    readonly #battery = new BatteryMonitor();
    readonly #client = new ClaudeClient();
    readonly #memoryTimer = new Timer();
    readonly #claudeTimer = new Timer();
    readonly #disposables = new Disposables();
    #claudeBusy = false;
    #destroyed = false;

    constructor(settings: FrodoSettings) {
        super();
        this.#settings = settings;
        this.#disposables.add(
            this.#battery.on('changed', () => {
                this.emit('battery');
            }),
        );
        this.#disposables.add(
            settings.onChanged('claude-poll-minutes', () => {
                this.#scheduleClaude();
            }),
        );
        this.#scheduleClaude();
        void this.refreshClaude();
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

    async refreshClaude(maxAgeSeconds = 0): Promise<void> {
        if (this.#claudeBusy || Date.now() - this.claude.fetchedAt < maxAgeSeconds * 1000) return;
        this.#claudeBusy = true;
        const usage = await this.#client.fetch();
        this.#claudeBusy = false;
        if (this.#destroyed) return;
        this.claude = {...usage, fetchedAt: Date.now()};
        this.emit('claude');
    }

    #scheduleClaude(): void {
        const minutes = Math.max(MIN_CLAUDE_MINUTES, this.#settings.claudePollMinutes);
        this.#claudeTimer.every(minutes * 60, () => void this.refreshClaude());
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
        this.#claudeTimer.stop();
        this.#disposables.dispose();
        this.#battery.destroy();
        this.#client.destroy();
        this.clearListeners();
    }
}
