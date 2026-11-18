import type {ClosedItem} from '../settings/schema-values.types.js';
import {QUOTA_ITEMS} from './closed-items.const.js';
import {closedItemsFor, rotatingItems} from './closed-items.js';

describe('closedItemsFor', () => {
    const items: ClosedItem[] = ['clock', 'battery', 'ram', 'notifications', 'claude-session'];

    it('modo mínimo mostra só o relógio', () => {
        expect(closedItemsFor('minimal', items)).toEqual(['clock']);
    });

    it('modo compacto mostra todos', () => {
        expect(closedItemsFor('compact', items)).toEqual(items);
    });

    it('modo rotativo mantém só o primeiro item de texto', () => {
        expect(closedItemsFor('rotating', items)).toEqual(['clock', 'battery', 'notifications']);
    });

    it('modo rotativo sem item de texto mantém tudo', () => {
        expect(closedItemsFor('rotating', ['clock', 'date'])).toEqual(['clock', 'date']);
    });
});

describe('rotatingItems', () => {
    const items: ClosedItem[] = ['clock', 'battery', 'ram', 'codex-session', 'gemini-daily', 'claude-weekly'];

    it('ignora o que não é texto', () => {
        expect(rotatingItems(['clock', 'ram'], {hasBattery: true, providerEnabled: () => true})).toEqual(['ram']);
    });

    it('tira a bateria quando não há bateria', () => {
        expect(rotatingItems(items, {hasBattery: false, providerEnabled: () => true})).not.toContain('battery');
    });

    it('tira provedor desativado, menos o Claude', () => {
        expect(rotatingItems(items, {hasBattery: true, providerEnabled: provider => provider === 'gemini'})).toEqual([
            'battery',
            'ram',
            'gemini-daily',
            'claude-weekly',
        ]);
    });
});

describe('QUOTA_ITEMS', () => {
    it('o anel mostra o período da cota e o texto rotativo não repete', () => {
        expect(QUOTA_ITEMS['claude-session'].ringSuffix).toBe('');
        expect(QUOTA_ITEMS['claude-weekly'].ringSuffix).toBe(' · 7d');
        expect(QUOTA_ITEMS['codex-weekly'].ringSuffix).toBe(' · 7d');
        expect(QUOTA_ITEMS['gemini-daily'].ringSuffix).toBe(' hoje');
        expect(QUOTA_ITEMS['claude-weekly'].suffix).toBe('');
    });
});
