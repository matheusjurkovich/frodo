import {meterLevel, resetNote, shownMeterPercent} from './meter.js';

describe('medidores de cota', () => {
    const now = new Date(2026, 9, 28, 10, 0).getTime();

    it('classifica o nível pelo uso', () => {
        expect(meterLevel(10)).toBe('ok');
        expect(meterLevel(80)).toBe('warn');
        expect(meterLevel(97)).toBe('crit');
    });

    it('descreve quando a cota reinicia', () => {
        expect(resetNote(now - 1, now)).toBe('Reiniciada');
        expect(resetNote(now + 20 * 60e3, now)).toBe('Reinicia em 20 min');
        expect(resetNote(now + 130 * 60e3, now)).toBe('Reinicia em 2 h 10 min');
        expect(resetNote(now + 3 * 3600e3, now)).toBe('Reinicia em 3 h');
        expect(resetNote(new Date(2026, 9, 31, 14, 0).getTime(), now)).toBe('Reinicia sábado, 14:00');
    });

    it('mostra o restante quando pedido', () => {
        expect(shownMeterPercent(30, false)).toBe(30);
        expect(shownMeterPercent(30, true)).toBe(70);
        expect(shownMeterPercent(140, false)).toBe(100);
    });
});
