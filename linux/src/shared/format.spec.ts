import {ellipsize, formatAgo, formatDate, formatSpan, formatTimer, formatTokens, formatUntil, secondsSince} from './format.js';

describe('format', () => {
    it('formata data curta', () => {
        expect(formatDate(new Date(2026, 9, 24))).toBe('Sáb, 24 out');
    });

    it('corta textos longos', () => {
        expect(ellipsize('abc', 40)).toBe('abc');
        expect(ellipsize('a'.repeat(45), 40)).toBe(`${'a'.repeat(39)}…`);
    });
});

describe('formatos do redesign', () => {
    const now = Date.UTC(2026, 9, 27, 12);

    it('data do cabeçalho', () => {
        expect(formatDate(new Date(2026, 9, 27))).toBe('Ter, 27 out');
    });

    it('tokens em pt-BR compacto', () => {
        expect([940, 612_000, 148_400, 999_600, 4_100_000, 27_000_000, 1_240_000_000].map(formatTokens)).toEqual([
            '940',
            '612 mil',
            '148 mil',
            '1 mi',
            '4,1 mi',
            '27 mi',
            '1,2 bi',
        ]);
    });

    it('cronômetro de faixa e gravação', () => {
        expect([0, 84, 232, 3725].map(formatTimer)).toEqual(['0:00', '1:24', '3:52', '1:02:05']);
    });

    it('há quanto tempo', () => {
        expect([now - 30e3, now - 9 * 60e3, now - 2 * 3600e3, now - 3 * 86400e3].map(at => formatAgo(at, now))).toEqual([
            'agora',
            '9 min',
            '2 h',
            '3 d',
        ]);
    });

    it('quanto falta', () => {
        expect([now + 5 * 60e3, now + 4 * 60e3 + 10e3, now, now - 60e3].map(at => formatUntil(at, now))).toEqual([
            'Em 5 min',
            'Em 5 min',
            'Agora',
            'Agora',
        ]);
    });

    it('duração de sessão', () => {
        expect([30, 240, 3840].map(formatSpan)).toEqual(['1 min', '4 min', '1 h 04 min']);
    });

    it('segundos desde o início, nunca negativos nem NaN', () => {
        expect([now - 84e3, now, now + 5e3, Number.NaN, Number.POSITIVE_INFINITY].map(at => secondsSince(at, now))).toEqual([
            84, 0, 0, 0, 0,
        ]);
        expect(formatTimer(secondsSince(now + 5e3, now))).toBe('0:00');
        expect(formatTimer(secondsSince(Number.NaN, now))).toBe('0:00');
    });
});
