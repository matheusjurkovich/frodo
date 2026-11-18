import {allowBlocked} from './allow-guard.js';

describe('allow-guard', () => {
    it('bloqueia dentro dos 600 ms após a abertura pelo hover', () => {
        expect(allowBlocked(1000, 1599)).toBe(true);
    });

    it('libera a partir dos 600 ms', () => {
        expect(allowBlocked(1000, 1600)).toBe(false);
    });

    it('libera quando a ilha não abriu pelo hover', () => {
        expect(allowBlocked(null, 1001)).toBe(false);
    });
});
