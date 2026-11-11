import type {EventMap, Listeners, Unsubscribe} from './emitter.types.js';

export class Emitter<Events extends EventMap<Events>> {
    #listeners: Listeners<Events> = {};

    on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): Unsubscribe {
        const set = (this.#listeners[event] ??= new Set());
        set.add(listener);
        return () => {
            set.delete(listener);
        };
    }

    clearListeners(): void {
        this.#listeners = {};
    }

    protected emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
        const set = this.#listeners[event];
        if (!set) return;
        for (const listener of [...set]) {
            if (!set.has(listener) || this.#listeners[event] !== set) continue;
            try {
                listener(...args);
            } catch (error) {
                logError(error);
            }
        }
    }
}
