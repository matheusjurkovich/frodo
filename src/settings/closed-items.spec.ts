import {itemsForPreferences, moveItem} from './closed-items.js';

describe('itens da ilha fechada', () => {
    it('lista ativos na ordem salva e depois os inativos na ordem canônica', () => {
        expect(itemsForPreferences(['ram', 'clock'])).toEqual([
            {item: 'ram', enabled: true},
            {item: 'clock', enabled: true},
            {item: 'date', enabled: false},
            {item: 'notifications', enabled: false},
            {item: 'network', enabled: false},
            {item: 'system', enabled: false},
            {item: 'battery', enabled: false},
            {item: 'claude-session', enabled: false},
            {item: 'claude-weekly', enabled: false},
        ]);
    });

    it('move um item e devolve só os ativos na nova ordem', () => {
        const entries = itemsForPreferences(['clock', 'system', 'ram']);
        expect(moveItem(entries, 2, 0)).toEqual(['ram', 'clock', 'system']);
        expect(moveItem(entries, 0, 4)).toEqual(['system', 'ram', 'clock']);
    });

    it('ignora movimentos fora da lista', () => {
        const entries = itemsForPreferences(['clock', 'ram']);
        expect(moveItem(entries, 9, 0)).toEqual(['clock', 'ram']);
    });
});
