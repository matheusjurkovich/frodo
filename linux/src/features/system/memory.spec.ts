import {formatGb, parseMeminfo} from './memory.js';

describe('memory', () => {
    it('calcula usado a partir de MemAvailable', () => {
        expect(parseMeminfo('MemTotal:       14680064 kB\nMemFree: 1 kB\nMemAvailable:    8178893 kB\n')).toEqual({
            totalKb: 14680064,
            usedKb: 6501171,
        });
    });

    it('retorna null para texto inválido', () => {
        expect(parseMeminfo('lixo')).toBeNull();
    });

    it('formata em GB com uma casa', () => {
        expect(formatGb(6501171)).toBe('6.2G');
    });
});
