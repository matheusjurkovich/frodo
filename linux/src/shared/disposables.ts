import type {Disposer, SignalSource} from './disposables.types.js';

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
        const errors: unknown[] = [];
        for (const dispose of items) {
            try {
                dispose();
            } catch (error) {
                errors.push(error);
            }
        }
        if (errors.length > 0) throw errors[0];
    }
}
