import {missingItems} from './pill-items.js';

describe('pill-items', () => {
    it('lista os itens fora da pílula na ordem do catálogo', () => {
        expect(missingItems(['ram', 'clock', 'date', 'notifications', 'network', 'battery'])).toEqual([
            'bluetooth',
            'volume',
            'microphone',
            'do-not-disturb',
            'system',
            'claude-session',
            'claude-weekly',
            'codex-session',
            'codex-weekly',
            'gemini-daily',
            'extensions',
        ]);
    });

    it('esconde itens de IA desligada', () => {
        expect(missingItems(['clock'], ['codex'])).not.toContain('claude-session');
        expect(missingItems(['clock'], ['codex'])).not.toContain('gemini-daily');
        expect(missingItems(['clock'], ['codex'])).toContain('codex-weekly');
    });
});
