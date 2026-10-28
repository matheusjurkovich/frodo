export type Unsubscribe = () => void;

type EventMap<Events> = {[K in keyof Events]: unknown[]};
type Listeners<Events extends EventMap<Events>> = {[K in keyof Events]?: Set<(...args: Events[K]) => void>};

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
        for (const listener of [...(this.#listeners[event] ?? [])]) listener(...args);
    }
}
