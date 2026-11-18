import {terminalCommand} from './terminal.js';

describe('terminalCommand', () => {
    it('usa o primeiro terminal instalado na ordem de preferência', () => {
        const installed = new Set(['gnome-terminal', 'ptyxis']);
        expect(terminalCommand(['gh', 'auth', 'login', '--web'], program => installed.has(program))).toEqual([
            'ptyxis',
            '--',
            'gh',
            'auth',
            'login',
            '--web',
        ]);
    });

    it('xdg-terminal-exec recebe o comando direto', () => {
        expect(terminalCommand(['gh'], () => true)).toEqual(['xdg-terminal-exec', 'gh']);
    });

    it('sem terminal conhecido devolve null', () => {
        expect(terminalCommand(['gh'], () => false)).toBeNull();
    });
});
