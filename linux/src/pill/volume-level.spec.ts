import {volumeLevel} from './volume-level.js';

describe('volumeLevel', () => {
    it('zero é mudo', () => {
        expect(volumeLevel(0)).toBe('muted');
    });

    it('faixas em 34 e 67', () => {
        expect([1, 33, 34, 66, 67, 100].map(volumeLevel)).toEqual(['low', 'low', 'medium', 'medium', 'high', 'high']);
    });
});
