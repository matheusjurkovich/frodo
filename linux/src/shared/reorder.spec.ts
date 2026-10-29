import {moveTo} from './reorder.js';

describe('moveTo', () => {
    it('leva o item para a posição pedida', () => {
        expect(moveTo(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
        expect(moveTo(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    });

    it('prende a posição nas pontas', () => {
        expect(moveTo(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
        expect(moveTo(['a', 'b', 'c'], 'b', 9)).toEqual(['a', 'c', 'b']);
    });

    it('item que não está na lista não muda nada', () => {
        expect(moveTo(['a', 'b'], 'z', 0)).toEqual(['a', 'b']);
    });
});
