import {isActiveProfile, labelForDirName, profileChip} from './claude-profiles.js';

describe('perfis', () => {
    it('nomeia pelo diretório', () => {
        expect(labelForDirName('.claude')).toBe('Claude');
        expect(labelForDirName('.claude-work')).toBe('Work');
        expect(labelForDirName('.claude-my_client')).toBe('My Client');
    });

    it('gera a sigla do perfil', () => {
        expect(profileChip('Work Stuff')).toBe('WS');
        expect(profileChip('Claude')).toBe('CL');
    });

    it('marca como ativo o perfil do diretório padrão', () => {
        expect(isActiveProfile({id: 'a', label: 'A', configDir: '/home/u/.claude/'}, '/home/u/.claude')).toBeTrue();
        expect(isActiveProfile({id: 'b', label: 'B', configDir: '/home/u/.claude-work'}, '/home/u/.claude')).toBeFalse();
    });
});
