import {missingItems, moveItem} from './pill-items.js';

describe('pill-items', () => {
    it('move o item uma posição para o lado pedido', () => {
        expect(moveItem(['clock', 'date', 'ram'], 'date', -1)).toEqual(['date', 'clock', 'ram']);
        expect(moveItem(['clock', 'date', 'ram'], 'date', 1)).toEqual(['clock', 'ram', 'date']);
    });

    it('não move além das pontas nem item ausente', () => {
        expect(moveItem(['clock', 'date'], 'clock', -1)).toEqual(['clock', 'date']);
        expect(moveItem(['clock', 'date'], 'date', 1)).toEqual(['clock', 'date']);
        expect(moveItem(['clock'], 'ram', 1)).toEqual(['clock']);
    });

    it('lista os itens fora da pílula na ordem do catálogo', () => {
        expect(missingItems(['ram', 'clock', 'date', 'notifications', 'network', 'battery'])).toEqual([
            'system',
            'claude-session',
            'claude-weekly',
            'extensions',
        ]);
    });
});
