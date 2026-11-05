import {TopBarVisibility} from './top-bar-visibility.js';
import {createSettings} from '../../tests/fixtures.js';
import {layoutManager} from '../../tests/shell/main.js';

describe('TopBarVisibility', () => {
    const {panelBox, chrome} = layoutManager;
    const tracked = {affectsStruts: true, trackFullscreen: true};

    beforeEach(() => {
        panelBox.show();
        chrome.clear();
        chrome.set(panelBox, tracked);
    });

    it('não mexe na barra enquanto a chave está desligada', () => {
        const visibility = new TopBarVisibility(createSettings());
        expect(panelBox.visible).toBeTrue();
        visibility.destroy();
        expect(panelBox.visible).toBeTrue();
        expect(chrome.get(panelBox)).toBe(tracked);
    });

    it('esconde a barra e tira do chrome quando a chave liga', () => {
        const settings = createSettings();
        const visibility = new TopBarVisibility(settings);
        settings.hideTopBar = true;
        expect(panelBox.visible).toBeFalse();
        expect(chrome.has(panelBox)).toBeFalse();
        visibility.destroy();
    });

    it('mostra e volta a reservar espaço quando a chave desliga', () => {
        const settings = createSettings();
        settings.hideTopBar = true;
        const visibility = new TopBarVisibility(settings);
        expect(panelBox.visible).toBeFalse();
        settings.hideTopBar = false;
        expect(panelBox.visible).toBeTrue();
        expect(chrome.get(panelBox)).toEqual(tracked);
        visibility.destroy();
    });

    it('devolve a barra ao destruir e para de ouvir a chave', () => {
        const settings = createSettings();
        settings.hideTopBar = true;
        const visibility = new TopBarVisibility(settings);
        visibility.destroy();
        expect(panelBox.visible).toBeTrue();
        expect(chrome.get(panelBox)).toEqual(tracked);
        settings.hideTopBar = false;
        settings.hideTopBar = true;
        expect(panelBox.visible).toBeTrue();
    });
});
