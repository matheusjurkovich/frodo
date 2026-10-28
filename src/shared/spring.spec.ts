import {FIRM_SPRING, SOFT_SPRING, SPRING, springProgress} from './spring.js';

function springPeak(damping: number): number {
    let peak = 0;
    for (let i = 0; i <= 200; i++) peak = Math.max(peak, springProgress(damping, i / 200));
    return peak;
}

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

    it('mola leve quase não passa do alvo', () => {
        expect(springPeak(SOFT_SPRING.damping)).toBeGreaterThan(1.01);
        expect(springPeak(SOFT_SPRING.damping)).toBeLessThan(1.03);
    });

    it('firme nunca passa do alvo e desacelera', () => {
        expect(springPeak(FIRM_SPRING.damping)).toBe(1);
        expect(springProgress(FIRM_SPRING.damping, 0.5)).toBeCloseTo(0.875, 3);
    });
});
