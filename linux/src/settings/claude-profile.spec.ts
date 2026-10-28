import {parseProfiles, expandHome} from './claude-profile.js';

describe('parseProfiles', () => {
    it('lê a lista salva ignorando lixo', () => {
        expect(parseProfiles('[{"id":"a","label":"X","configDir":"/x"},{"bad":1}]')).toEqual([{id: 'a', label: 'X', configDir: '/x'}]);
        expect(parseProfiles('lixo')).toEqual([]);
    });
});

describe('expandHome', () => {
    it('expande o til do caminho para a pasta pessoal', () => {
        expect(expandHome('~/.claude-trabalho', '/home/a')).toBe('/home/a/.claude-trabalho');
        expect(expandHome('~', '/home/a')).toBe('/home/a');
        expect(expandHome('  /opt/claude/ ', '/home/a')).toBe('/opt/claude');
        expect(expandHome('', '/home/a')).toBe('');
    });
});
