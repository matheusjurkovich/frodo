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

    it('segue chamando os outros ouvintes quando um lança', () => {
        const counter = new Counter();
        const seen: number[] = [];
        spyOn(globalThis, 'logError');
        counter.on('changed', () => {
            throw new Error('falha');
        });
        counter.on('changed', n => seen.push(n));
        counter.fire(1);
        expect(seen).toEqual([1]);
    });

    it('não chama ouvinte removido durante a emissão', () => {
        const counter = new Counter();
        const seen: string[] = [];
        let offSecond = (): void => undefined;
        counter.on('changed', () => {
            seen.push('a');
            offSecond();
        });
        offSecond = counter.on('changed', () => seen.push('b'));
        counter.fire(1);
        expect(seen).toEqual(['a']);
    });

    it('não chama ouvintes depois de clearListeners durante a emissão', () => {
        const counter = new Counter();
        const seen: string[] = [];
        counter.on('changed', () => {
            seen.push('a');
            counter.clearListeners();
        });
        counter.on('changed', () => seen.push('b'));
        counter.fire(1);
        expect(seen).toEqual(['a']);
    });
});
