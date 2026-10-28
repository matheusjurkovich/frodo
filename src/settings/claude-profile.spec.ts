import {parseProfiles} from './claude-profile.js';

describe('parseProfiles', () => {
    it('lê a lista salva ignorando lixo', () => {
        expect(parseProfiles('[{"id":"a","label":"X","configDir":"/x"},{"bad":1}]')).toEqual([{id: 'a', label: 'X', configDir: '/x'}]);
        expect(parseProfiles('lixo')).toEqual([]);
    });
});
