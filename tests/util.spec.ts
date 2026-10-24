import {Disposables} from '../src/util/disposables.js';
import {Emitter} from '../src/util/emitter.js';
import {Timer} from '../src/util/timer.js';

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

describe('Disposables', () => {
    it('desfaz em ordem reversa e só uma vez', () => {
        const bag = new Disposables();
        const order: string[] = [];
        bag.add(() => order.push('a'));
        bag.add(() => order.push('b'));
        bag.dispose();
        bag.dispose();
        expect(order).toEqual(['b', 'a']);
    });

    it('desconecta sinais', () => {
        const bag = new Disposables();
        const target = {disconnect: jasmine.createSpy('disconnect')};
        bag.signal(target, 7);
        bag.dispose();
        expect(target.disconnect).toHaveBeenCalledOnceWith(7);
    });
});

describe('Timer', () => {
    it('dispara uma vez depois do atraso', done => {
        const timer = new Timer();
        timer.once(10, () => {
            expect(timer.active).toBeFalse();
            done();
        });
        expect(timer.active).toBeTrue();
    });

    it('cancela antes de disparar', done => {
        const timer = new Timer();
        const fn = jasmine.createSpy('fn');
        timer.once(10, fn);
        timer.stop();
        setTimeout(() => {
            expect(fn).not.toHaveBeenCalled();
            done();
        }, 40);
    });
});
