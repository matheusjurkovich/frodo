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
});
