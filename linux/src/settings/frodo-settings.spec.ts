import {createSettings} from '../../tests/fixtures.js';

describe('FrodoSettings', () => {
    it('expõe os padrões tipados', () => {
        const settings = createSettings();
        expect(settings.closedMode).toBe('compact');
        expect(settings.closedItems).toEqual(['clock', 'date', 'notifications', 'network', 'battery']);
        expect(settings.monitors).toBe('primary');
        expect(settings.hideTopBar).toBeFalse();
        expect(settings.surfaceStyle).toBe('solid');
        expect(settings.toggleShortcut).toBe('<Super>z');
    });

    it('ignora itens desconhecidos e repetidos e preserva a ordem escolhida', () => {
        const settings = createSettings();
        settings.gsettings.set_strv('closed-items', ['claude-weekly', 'xyz', 'battery', 'battery']);
        expect(settings.closedItems).toEqual(['claude-weekly', 'battery']);
        settings.closedItems = ['ram', 'clock', 'ram'];
        expect(settings.gsettings.get_strv('closed-items')).toEqual(['ram', 'clock']);
    });

    it('avisa mudanças e permite parar de ouvir', () => {
        const settings = createSettings();
        const spy = jasmine.createSpy('changed');
        const off = settings.onChanged(['closed-mode', 'monitors'], spy);
        settings.closedMode = 'minimal';
        off();
        settings.monitors = 'both';
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('lê e grava as chaves do redesign', () => {
        const settings = createSettings();
        expect(settings.openOnHover).toBeTrue();
        expect(settings.autoClose).toBeFalse();
        expect(settings.hiddenTabs).toEqual([]);
        settings.gsettings.set_strv('hidden-tabs', ['claude', 'xyz', 'claude']);
        expect(settings.hiddenTabs).toEqual(['claude']);
        settings.collapsedCards = ['apps', 'apps'];
        expect(settings.gsettings.get_strv('collapsed-cards')).toEqual(['apps']);
    });

    it('grava expandir ao passar o mouse e recolher sozinha', () => {
        const settings = createSettings();
        settings.openOnHover = false;
        settings.autoClose = true;
        expect(settings.gsettings.get_boolean('open-on-hover')).toBeFalse();
        expect(settings.gsettings.get_boolean('auto-close')).toBeTrue();
    });

    it('grava as chaves que eram das preferências', () => {
        const settings = createSettings();
        settings.hideTopBar = true;
        settings.claudePollMinutes = 12;
        settings.claudeShowRemaining = true;
        settings.toggleShortcut = '<Super>x';
        settings.claudeShortcut = '<Control><Alt>c';
        expect(settings.hideTopBar).toBeTrue();
        expect(settings.claudePollMinutes).toBe(12);
        expect(settings.claudeShowRemaining).toBeTrue();
        expect(settings.gsettings.get_strv('toggle-shortcut')).toEqual(['<Super>x']);
        expect(settings.claudeShortcut).toBe('<Control><Alt>c');
    });

    it('lê e grava o estilo do fundo', () => {
        const settings = createSettings();
        settings.surfaceStyle = 'clear';
        expect(settings.gsettings.get_string('surface-style')).toBe('clear');
        expect(settings.surfaceStyle).toBe('clear');
    });
});
