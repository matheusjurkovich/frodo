import {TAB_IDS} from './schema-values.js';
import {orderedTabs, tabToOpen, visibleTabs} from './tabs.js';

describe('abas', () => {
    it('mostra as não ocultas na ordem fixa', () => {
        expect(visibleTabs([])).toEqual(['general', 'calendar', 'workspaces', 'claude', 'notifications', 'performance']);
        expect(visibleTabs(['calendar', 'claude'])).toEqual(['general', 'workspaces', 'notifications', 'performance']);
    });

    it('nunca fica sem aba', () => {
        expect(visibleTabs([...TAB_IDS])).toEqual(['general']);
        expect(visibleTabs([...TAB_IDS], ['claude', 'general'])).toEqual(['claude']);
    });

    it('segue a ordem escolhida', () => {
        expect(visibleTabs(['calendar'], ['notifications', 'calendar', 'general'])).toEqual(['notifications', 'general']);
    });

    it('completa a ordem gravada com as abas que faltam e descarta as desconhecidas', () => {
        expect(orderedTabs(['claude', 'velha', 'general', 'claude'])).toEqual([
            'claude',
            'general',
            'calendar',
            'workspaces',
            'notifications',
            'performance',
        ]);
        expect(orderedTabs([])).toEqual([...TAB_IDS]);
    });

    it('abre a primeira visível quando a pedida está oculta', () => {
        expect(tabToOpen('claude', ['general', 'claude'])).toBe('claude');
        expect(tabToOpen('claude', ['calendar', 'notifications'])).toBe('calendar');
    });
});
