import {TAB_IDS} from './schema-values.js';
import {tabToOpen, visibleTabs} from './tabs.js';

describe('abas', () => {
    it('mostra as não ocultas na ordem fixa', () => {
        expect(visibleTabs([])).toEqual(['general', 'calendar', 'workspaces', 'claude', 'notifications']);
        expect(visibleTabs(['calendar', 'claude'])).toEqual(['general', 'workspaces', 'notifications']);
    });

    it('nunca fica sem aba', () => {
        expect(visibleTabs([...TAB_IDS])).toEqual(['general']);
    });

    it('abre a primeira visível quando a pedida está oculta', () => {
        expect(tabToOpen('claude', ['general', 'claude'])).toBe('claude');
        expect(tabToOpen('claude', ['calendar', 'notifications'])).toBe('calendar');
    });
});
