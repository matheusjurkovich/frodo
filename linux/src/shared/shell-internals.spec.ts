import {patchMethod} from './shell-internals.js';

describe('patchMethod', () => {
    it('troca o método com o original ligado e restaura ao descartar', () => {
        const target = {
            value: 2,
            double(): number {
                return this.value * 2;
            },
        };
        const own = Object.getOwnPropertyDescriptor(target, 'double');
        const restore = patchMethod(target, 'double', original => () => original() + 1);
        expect(target.double()).toBe(5);
        restore();
        expect(Object.getOwnPropertyDescriptor(target, 'double')).toEqual(own);
        expect(target.double()).toBe(4);
    });

    it('apaga o método próprio quando ele vinha do protótipo', () => {
        class Base {
            value = 3;

            triple(): number {
                return this.value * 3;
            }
        }
        const target = new Base();
        const restore = patchMethod(target, 'triple', () => () => 0);
        expect(Object.hasOwn(target, 'triple')).toBeTrue();
        restore();
        expect(Object.hasOwn(target, 'triple')).toBeFalse();
        expect(target.triple()).toBe(9);
    });
});
