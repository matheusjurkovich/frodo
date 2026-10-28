export type Disposer = () => void;

export interface SignalSource {
    disconnect(id: number): void;
}

export class Disposables {
    #items: Disposer[] = [];

    add(dispose: Disposer): void {
        this.#items.push(dispose);
    }

    own<T extends {destroy(): void}>(item: T): T {
        this.add(() => {
            item.destroy();
        });
        return item;
    }

    signal(source: SignalSource, id: number): void {
        this.add(() => {
            source.disconnect(id);
        });
    }

    dispose(): void {
        const items = this.#items.reverse();
        this.#items = [];
        for (const dispose of items) dispose();
    }
}
