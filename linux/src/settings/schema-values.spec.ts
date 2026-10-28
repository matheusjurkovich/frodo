import {CLOSED_MODES, horizontalOf, isBottom, isOneOf} from './schema-values.js';

describe('types', () => {
    it('valida valores de enum de configuração', () => {
        expect(isOneOf(CLOSED_MODES, 'compact')).toBeTrue();
        expect(isOneOf(CLOSED_MODES, 'outro')).toBeFalse();
    });

    it('separa a borda e o lado da posição da pílula', () => {
        expect(isBottom('bottom-left')).toBeTrue();
        expect(isBottom('center')).toBeFalse();
        expect(horizontalOf('bottom-right')).toBe('right');
        expect(horizontalOf('bottom-center')).toBe('center');
        expect(horizontalOf('left')).toBe('left');
    });
});
