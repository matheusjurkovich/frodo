import {Disposables} from './disposables.js';

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

    it('desfaz todos mesmo quando um lança e repropaga o primeiro erro', () => {
        const bag = new Disposables();
        const order: string[] = [];
        bag.add(() => order.push('a'));
        bag.add(() => {
            throw new Error('b');
        });
        bag.add(() => {
            throw new Error('c');
        });
        expect(() => {
            bag.dispose();
        }).toThrowError('c');
        expect(order).toEqual(['a']);
    });

    it('own devolve o item e o destrói no dispose, em ordem inversa', () => {
        const calls: string[] = [];
        const disposables = new Disposables();
        const item = {
            destroy: (): void => {
                calls.push('item');
            },
        };
        expect(disposables.own(item)).toBe(item);
        disposables.add(() => {
            calls.push('add');
        });
        disposables.dispose();
        expect(calls).toEqual(['add', 'item']);
    });
});
