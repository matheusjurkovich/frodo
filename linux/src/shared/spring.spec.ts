import {FIRM_SPRING, GENTLE_SPRING, SOFT_SPRING, SPRING, springPeak, springProgress, springWithin} from './spring.js';

describe('springProgress', () => {
    it('começa em 0 e termina exatamente em 1', () => {
        for (const damping of [SPRING.damping, SOFT_SPRING.damping, FIRM_SPRING.damping]) {
            expect(springProgress(damping, 0)).toBe(0);
            expect(springProgress(damping, 1)).toBe(1);
        }
    });

    it('prende t fora de 0 a 1', () => {
        expect(springProgress(SPRING.damping, -0.5)).toBe(0);
        expect(springProgress(SPRING.damping, 2)).toBe(1);
    });

    it('mola C passa uns 10% do alvo', () => {
        expect(springPeak(SPRING.damping)).toBeCloseTo(1.107, 2);
    });

    it('mola da ilha passa uns 5% do alvo', () => {
        expect(springPeak(GENTLE_SPRING.damping)).toBeCloseTo(1.054, 2);
    });

    it('mola leve quase não passa do alvo', () => {
        expect(springPeak(SOFT_SPRING.damping)).toBeGreaterThan(1.01);
        expect(springPeak(SOFT_SPRING.damping)).toBeLessThan(1.03);
    });

    it('firme nunca passa do alvo e desacelera', () => {
        expect(springPeak(FIRM_SPRING.damping)).toBe(1);
        expect(springProgress(FIRM_SPRING.damping, 0.5)).toBeCloseTo(0.875, 3);
    });
});

describe('springWithin', () => {
    it('mantém a mola quando o quique cabe no teto', () => {
        expect(springWithin(SPRING, 38, 700, 800)).toBe(SPRING);
    });

    it('troca por firme quando o quique passaria do teto', () => {
        expect(springWithin(SPRING, 38, 790, 800)).toEqual({damping: 1, ms: SPRING.ms});
    });

    it('encolher nunca passa do teto', () => {
        expect(springWithin(SPRING, 700, 38, 700)).toBe(SPRING);
    });
});
