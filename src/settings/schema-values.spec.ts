import {CLOSED_MODES, isOneOf} from './schema-values.js';

describe('types', () => {
    it('valida valores de enum de configuração', () => {
        expect(isOneOf(CLOSED_MODES, 'compact')).toBeTrue();
        expect(isOneOf(CLOSED_MODES, 'outro')).toBeFalse();
    });
});
