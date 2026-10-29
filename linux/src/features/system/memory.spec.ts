import {formatGb, memoryAlarm, parseMeminfo, usedPercent} from './memory.js';

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

    it('calcula a porcentagem usada', () => {
        expect(usedPercent({totalKb: 1000, usedKb: 905})).toBe(91);
        expect(usedPercent({totalKb: 0, usedKb: 0})).toBe(0);
    });

    it('alarma a partir de 90% e só rearma abaixo de 80%', () => {
        expect(memoryAlarm(89, false)).toBeFalse();
        expect(memoryAlarm(90, false)).toBeTrue();
        expect(memoryAlarm(85, true)).toBeTrue();
        expect(memoryAlarm(79, true)).toBeFalse();
    });
});
