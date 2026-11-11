import {count, isObject, isRecord, optionalString, text} from './json.js';

describe('json', () => {
    it('isObject aceita objeto e array, rejeita nulo e primitivo', () => {
        expect(isObject({})).toBeTrue();
        expect(isObject([])).toBeTrue();
        expect(isObject(null)).toBeFalse();
        expect(isObject('a')).toBeFalse();
    });

    it('isRecord rejeita array', () => {
        expect(isRecord({a: 1})).toBeTrue();
        expect(isRecord([])).toBeFalse();
        expect(isRecord(null)).toBeFalse();
    });

    it('text exige string não vazia, optionalString aceita vazia', () => {
        expect(text('a')).toBe('a');
        expect(text('')).toBeNull();
        expect(text(1)).toBeNull();
        expect(optionalString('')).toBe('');
        expect(optionalString(1)).toBeNull();
    });

    it('count devolve número finito ou zero', () => {
        expect(count(3)).toBe(3);
        expect(count(NaN)).toBe(0);
        expect(count(Infinity)).toBe(0);
        expect(count('3')).toBe(0);
    });
});
