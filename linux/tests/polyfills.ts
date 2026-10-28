class Port {
    onmessage: ((event: {data: unknown}) => void) | null = null;
    peer: Port | null = null;

    postMessage(data: unknown): void {
        const target = this.peer;
        setTimeout(() => target?.onmessage?.({data}), 0);
    }

    close(): void {
        this.onmessage = null;
    }
}

class Channel {
    readonly port1 = new Port();
    readonly port2 = new Port();

    constructor() {
        this.port1.peer = this.port2;
        this.port2.peer = this.port1;
    }
}

const scope = globalThis as {MessageChannel?: unknown};
scope.MessageChannel ??= Channel;

const events = globalThis as {addEventListener?: unknown; removeEventListener?: unknown};
events.addEventListener ??= () => undefined;
events.removeEventListener ??= () => undefined;

const runtime = globalThis as {structuredClone?: unknown; queueMicrotask?: unknown};
runtime.structuredClone ??= (value: unknown): unknown => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
runtime.queueMicrotask ??= (callback: () => void): void => {
    void Promise.resolve().then(callback);
};
