import {springProgress} from './spring.js';
import {FIRM_SPRING, GENTLE_SPRING, PILL_SOFT_SPRING, PILL_SPRING, SPRING} from './spring.const.js';

function peak(damping: number): number {
    return Math.max(...Array.from({length: 201}, (_, index) => springProgress(damping, index / 200)));
}

describe('springProgress', () => {
    it('começa em 0 e termina exatamente em 1', () => {
        for (const damping of [SPRING.damping, PILL_SPRING.damping, PILL_SOFT_SPRING.damping, FIRM_SPRING.damping]) {
            expect(springProgress(damping, 0)).toBe(0);
            expect(springProgress(damping, 1)).toBe(1);
        }
    });

    it('prende t fora de 0 a 1', () => {
        expect(springProgress(PILL_SPRING.damping, -0.5)).toBe(0);
        expect(springProgress(PILL_SPRING.damping, 2)).toBe(1);
    });

    it('molas da ilha aberta nunca passam do alvo', () => {
        for (const spring of [SPRING, GENTLE_SPRING, FIRM_SPRING]) expect(peak(spring.damping)).toBe(1);
    });

    it('sem quique, desacelera até parar', () => {
        expect(springProgress(SPRING.damping, 0.5)).toBeCloseTo(0.875, 3);
    });

    it('mola da pílula passa uns 10% do alvo', () => {
        expect(peak(PILL_SPRING.damping)).toBeCloseTo(1.107, 2);
    });

    it('mola leve da pílula quase não passa do alvo', () => {
        expect(peak(PILL_SOFT_SPRING.damping)).toBeGreaterThan(1.01);
        expect(peak(PILL_SOFT_SPRING.damping)).toBeLessThan(1.03);
    });
});
