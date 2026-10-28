import {Emitter} from './emitter.js';

class Counter extends Emitter<{changed: [number]; reset: []}> {
    fire(n: number): void {
        this.emit('changed', n);
    }
}

describe('Emitter', () => {
    it('entrega argumentos e permite cancelar', () => {
        const counter = new Counter();
        const seen: number[] = [];
        const off = counter.on('changed', n => seen.push(n));
        counter.fire(1);
        off();
        counter.fire(2);
        expect(seen).toEqual([1]);
    });

    it('remove todos os ouvintes', () => {
        const counter = new Counter();
        const seen: number[] = [];
        counter.on('changed', n => seen.push(n));
        counter.clearListeners();
        counter.fire(1);
        expect(seen).toEqual([]);
    });
});
