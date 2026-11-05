type Handler = (...args: unknown[]) => void;

export class FakeSignals {
    readonly #handlers = new Map<number, {signal: string; handler: Handler}>();
    #nextId = 1;

    connect(signal: string, handler: Handler): number {
        const id = this.#nextId++;
        this.#handlers.set(id, {signal, handler});
        return id;
    }

    disconnect(id: number): void {
        if (!this.#handlers.delete(id)) throw new Error(`sinal ${id} desconectado duas vezes ou nunca conectado`);
    }

    emit(signal: string, ...args: unknown[]): void {
        for (const entry of [...this.#handlers.values()]) if (entry.signal === signal) entry.handler(this, ...args);
    }

    connections(signal?: string): number {
        return [...this.#handlers.values()].filter(entry => signal === undefined || entry.signal === signal).length;
    }
}
