import {isValidShortcut, shortcutLabel} from './shortcut.js';

describe('shortcut', () => {
    it('exige tecla e modificador', () => {
        expect(isValidShortcut(true, 122, 64)).toBeTrue();
        expect(isValidShortcut(true, 122, 0)).toBeFalse();
        expect(isValidShortcut(false, 0, 0)).toBeFalse();
    });

    it('rótulo do atalho', () => {
        expect(shortcutLabel('<Super>z')).toBe('Super + Z');
        expect(shortcutLabel('<Super><Shift>z')).toBe('Super + Shift + Z');
        expect(shortcutLabel('<Control><Alt>Delete')).toBe('Ctrl + Alt + Delete');
        expect(shortcutLabel('')).toBe('');
    });
});
