import {CLOSED_MODES, horizontalOf, isBottom, isMiddle, isOneOf} from './schema-values.js';

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
        expect(horizontalOf('middle-right')).toBe('right');
        expect(isMiddle('middle-left')).toBeTrue();
        expect(isMiddle('bottom-left')).toBeFalse();
        expect(isBottom('middle-left')).toBeFalse();
    });
});
