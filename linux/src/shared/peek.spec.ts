import {nextPeek} from './peek.js';

const at = (hours: number, minutes: number, seconds = 0): Date => new Date(2026, 9, 29, hours, minutes, seconds);

describe('nextPeek', () => {
    it('cai no próximo múltiplo do intervalo no relógio', () => {
        expect(nextPeek(at(10, 42), 10)).toEqual(at(10, 50));
        expect(nextPeek(at(10, 42, 30), 15)).toEqual(at(10, 45));
    });

    it('em cima da hora certa pula para o próximo intervalo', () => {
        expect(nextPeek(at(10, 50), 10)).toEqual(at(11, 0));
    });

    it('vira o dia depois da meia-noite', () => {
        expect(nextPeek(at(23, 55), 10)).toEqual(new Date(2026, 9, 30, 0, 0, 0));
    });

    it('trata intervalo inválido como um minuto', () => {
        expect(nextPeek(at(10, 42, 10), 0)).toEqual(at(10, 43));
    });
});
